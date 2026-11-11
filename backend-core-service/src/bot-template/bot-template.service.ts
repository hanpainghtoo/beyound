import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantBotTemplate } from './entities/tenant-bot-template.entity';
import { TenantBotTemplateField } from './entities/tenant-bot-template-field.entity';
import { TenantBotTemplateChannel } from './entities/tenant-bot-template-channel.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TelegramBotApiClient } from '../channel/telegram-bot-api.client';
import { decryptProviderCredentialsWithFallback } from '../channel/provider-credentials.util';
import { TELEGRAM_BOT_COMMANDS } from '../telegram-bot/telegram-bot.constants';
import { AuditLogService } from '../logging/audit-log.service';
import {
  BOT_TEMPLATE_BUTTON_KEYS,
  BOT_TEMPLATE_CONDITIONS,
  BOT_TEMPLATE_FIELD_KEYS,
  BOT_TEMPLATE_LAYOUTS,
  DEFAULT_BOT_TEMPLATE_FIELDS,
  DEFAULT_BOT_TEMPLATE_NAME,
  type BotTemplateFieldInput,
} from './bot-template.constants';

/** In-process TTL so every PM2 instance converges shortly after a write. */
export const BOT_TEMPLATE_CACHE_TTL_MS = 20_000;

type NormalizedField = {
  key: string;
  layout: string;
  visible: boolean;
  condition: string | null;
  value: Record<string, unknown>;
};

export type CreateBotTemplateInput = {
  name: string;
  fields: BotTemplateFieldInput[];
};

export type UpdateBotTemplateInput = {
  name?: string;
  fields?: BotTemplateFieldInput[];
};

export type SetChannelTemplateInput = {
  /** Omitted = keep current selection; null = detach. */
  templateId?: string | null;
  useBotTemplate: boolean;
};

export type SetShopSettingsInput = {
  shopEnabled?: boolean;
  orderingEnabled?: boolean;
};

export type ChannelTemplateSelection = {
  channelId: string;
  templateId: string | null;
  useBotTemplate: boolean;
};

export type ResolvedChannelTemplate = {
  template: TenantBotTemplate;
  fields: TenantBotTemplateField[];
};

/**
 * Tenant bot templates (Plan 73, Phase 1). Unwired: nothing reads these rows
 * yet — rendering migration lands in Phase 4a. Tenant-scoping is enforced on
 * every read/write; delete is refused for the default template and for
 * templates integrated into a channel.
 */
@Injectable()
export class BotTemplateService {
  // Plan 79: plain class, constructed like telegram-commerce.service.ts:153.
  private readonly telegram = new TelegramBotApiClient();
  private readonly resolvedCache = new Map<
    string,
    { value: ResolvedChannelTemplate | null; expiresAt: number }
  >();

  constructor(
    @InjectRepository(TenantBotTemplate)
    private readonly templates: Repository<TenantBotTemplate>,
    @InjectRepository(TenantBotTemplateField)
    private readonly fields: Repository<TenantBotTemplateField>,
    @InjectRepository(TenantBotTemplateChannel)
    private readonly mappings: Repository<TenantBotTemplateChannel>,
    @InjectRepository(TenantChannel)
    private readonly channels: Repository<TenantChannel>,
    private readonly audit: AuditLogService,
  ) {}

  async listTemplates(tenantId: string): Promise<TenantBotTemplate[]> {
    return this.templates.find({
      where: { tenantId },
      relations: { fields: true },
      order: { createdAt: 'ASC', fields: { sort: 'ASC' } },
    });
  }

  async getTemplate(tenantId: string, id: string): Promise<TenantBotTemplate> {
    const template = await this.templates.findOne({
      where: { id, tenantId },
      relations: { fields: true },
    });
    if (!template) throw new NotFoundException('Bot template not found');
    return template;
  }

  async getDefaultTemplate(
    tenantId: string,
  ): Promise<TenantBotTemplate | null> {
    return this.templates.findOne({
      where: { tenantId, isDefault: true },
      relations: { fields: true },
    });
  }

  async createTemplate(
    tenantId: string,
    input: CreateBotTemplateInput,
    actorId?: string | null,
  ): Promise<TenantBotTemplate> {
    const name = this.cleanName(input.name);
    const normalized = this.normalizeFields(input.fields);
    const created = await this.templates.manager.transaction(
      async (manager) => {
        const templateRepo = manager.getRepository(TenantBotTemplate);
        const fieldRepo = manager.getRepository(TenantBotTemplateField);
        const created = await templateRepo.save(
          templateRepo.create({
            tenantId,
            name,
            isDefault: false,
            updatedBy: actorId ?? null,
          }),
        );
        created.fields = await fieldRepo.save(
          normalized.map((field, index) =>
            fieldRepo.create({ templateId: created.id, sort: index, ...field }),
          ),
        );
        return created;
      },
    );
    await this.audit.logTenantUserAction(tenantId, actorId ?? null, {
      action: 'bot_template_created',
      resourceType: 'bot_template',
      resourceId: created.id,
      newValues: { name: created.name },
    });
    return created;
  }

  async updateTemplate(
    tenantId: string,
    id: string,
    input: UpdateBotTemplateInput,
    actorId?: string | null,
  ): Promise<TenantBotTemplate> {
    const existing = await this.getTemplate(tenantId, id);
    const name =
      input.name !== undefined ? this.cleanName(input.name) : existing.name;
    const normalized =
      input.fields !== undefined ? this.normalizeFields(input.fields) : null;
    await this.templates.manager.transaction(async (manager) => {
      const templateRepo = manager.getRepository(TenantBotTemplate);
      const fieldRepo = manager.getRepository(TenantBotTemplateField);
      existing.name = name;
      existing.updatedBy = actorId ?? null;
      await templateRepo.save(existing);
      if (normalized) {
        await fieldRepo.delete({ templateId: id });
        existing.fields = await fieldRepo.save(
          normalized.map((field, index) =>
            fieldRepo.create({ templateId: id, sort: index, ...field }),
          ),
        );
      }
    });
    await this.audit.logTenantUserAction(tenantId, actorId ?? null, {
      action: 'bot_template_updated',
      resourceType: 'bot_template',
      resourceId: existing.id,
      newValues: { name: existing.name },
    });
    this.resolvedCache.clear();
    return existing;
  }

  async deleteTemplate(
    tenantId: string,
    id: string,
    actorId?: string | null,
  ): Promise<void> {
    const existing = await this.getTemplate(tenantId, id);
    if (existing.isDefault)
      throw new BadRequestException('The default template cannot be deleted');
    const integrated = await this.mappings.count({ where: { templateId: id } });
    if (integrated > 0)
      throw new ConflictException(
        'Template is integrated into a channel and cannot be deleted',
      );
    await this.templates.delete({ id, tenantId });
    this.resolvedCache.clear();
    await this.audit.logTenantUserAction(tenantId, actorId ?? null, {
      action: 'bot_template_deleted',
      resourceType: 'bot_template',
      resourceId: id,
      newValues: { name: existing.name },
    });
  }

  /**
   * Phase 2 entry point: returns the tenant default, creating it from the
   * legacy menu definition when absent. Idempotent.
   */
  async ensureDefaultTemplate(
    tenantId: string,
    actorId?: string | null,
  ): Promise<TenantBotTemplate> {
    const existing = await this.getDefaultTemplate(tenantId);
    if (existing) return existing;
    const normalized = this.normalizeFields(DEFAULT_BOT_TEMPLATE_FIELDS);
    return this.templates.manager.transaction(async (manager) => {
      const templateRepo = manager.getRepository(TenantBotTemplate);
      const fieldRepo = manager.getRepository(TenantBotTemplateField);
      const created = await templateRepo.save(
        templateRepo.create({
          tenantId,
          name: DEFAULT_BOT_TEMPLATE_NAME,
          isDefault: true,
          updatedBy: actorId ?? null,
        }),
      );
      created.fields = await fieldRepo.save(
        normalized.map((field, index) =>
          fieldRepo.create({ templateId: created.id, sort: index, ...field }),
        ),
      );
      return created;
    });
  }

  /**
   * Reads a channel's template selection. `useBotTemplate` lives in
   * `configuration.telegramShopping` alongside the shop flags so channel GET
   * responses already carry it; the mapping row is the selection.
   */
  async getChannelTemplate(
    tenantId: string,
    channelId: string,
  ): Promise<ChannelTemplateSelection> {
    const channel = await this.requireTelegramChannel(tenantId, channelId);
    const mapping = await this.mappings.findOne({
      where: { channelId, tenantId },
    });
    return {
      channelId,
      templateId: mapping?.templateId ?? null,
      useBotTemplate: this.readUseFlag(channel),
    };
  }

  /**
   * Attaches/detaches a template and flips the per-channel render flag.
   * Selection and flag are independent: omitting `templateId` keeps the
   * current selection and only flips the flag; explicit `null` detaches.
   * Enabling without any selection is rejected. Never touches credentials
   * or webhook state, so no re-verify is needed.
   */
  async setChannelTemplate(
    tenantId: string,
    channelId: string,
    input: SetChannelTemplateInput,
    actorId?: string | null,
  ): Promise<ChannelTemplateSelection> {
    const channel = await this.requireTelegramChannel(tenantId, channelId);
    if (typeof input.useBotTemplate !== 'boolean')
      throw new BadRequestException('useBotTemplate must be a boolean');
    const current = await this.mappings.findOne({
      where: { channelId, tenantId },
    });
    let templateId: string | null = current?.templateId ?? null;
    if (input.templateId !== undefined) {
      templateId = null;
      if (input.templateId !== null) {
        // Tenant-scoped read doubles as the cross-tenant guard.
        const template = await this.getTemplate(tenantId, input.templateId);
        templateId = template.id;
      }
    }
    if (input.useBotTemplate && !templateId)
      throw new BadRequestException(
        'Select a template before turning on the bot template',
      );
    const useBotTemplate = !!templateId && input.useBotTemplate;
    const selection: ChannelTemplateSelection = {
      channelId,
      templateId,
      useBotTemplate,
    };
    await this.channels.manager.transaction(async (manager) => {
      const mappingRepo = manager.getRepository(TenantBotTemplateChannel);
      const channelRepo = manager.getRepository(TenantChannel);
      await mappingRepo.delete({ channelId, tenantId });
      // Plan 79: an off channel is no longer integrated, so it keeps no
      // mapping. Re-enabling re-creates it from the selected template.
      if (templateId && useBotTemplate) {
        await mappingRepo.save(
          mappingRepo.create({ templateId, channelId, tenantId }),
        );
      }
      const shopping = {
        ...this.shoppingOf(channel),
        // Plan 74 turned the whole sale flow on with the template; Plan 79
        // makes turning it off symmetric, so the channel stops serving a menu
        // and behaves as a plain chat bot until it is switched back on.
        shopEnabled: useBotTemplate,
        orderingEnabled: useBotTemplate,
        useBotTemplate,
      };
      await channelRepo.save({
        ...channel,
        configuration: {
          ...(channel.configuration as unknown as Record<string, unknown>),
          telegramShopping: shopping,
        },
      });
    });
    // Keep the advertised command list in step with the toggle, so `/start`
    // and `/menu` leave the Telegram chat menu rather than silently no-opping.
    await this.syncBotCommands(channel, useBotTemplate);
    await this.audit.logTenantUserAction(tenantId, actorId ?? null, {
      action: 'bot_template_channel_updated',
      resourceType: 'tenant_channel',
      resourceId: channelId,
      newValues: { templateId: selection.templateId, useBotTemplate },
    });
    this.resolvedCache.delete(`${tenantId}:${channelId}`);
    return selection;
  }

  /**
   * Plan 79: per-channel twin of the Plan 78 cascade. Advertises `/start` and
   * `/menu` while the channel sells, and removes them when it does not.
   *
   * Best effort: the flags above are already committed, so a Telegram failure
   * here must not fail the toggle. The next confirm retries.
   */
  private async syncBotCommands(
    channel: TenantChannel,
    enabled: boolean,
  ): Promise<boolean> {
    try {
      const botToken = this.botTokenOf(channel);
      if (!botToken) return false;
      if (enabled) {
        await this.telegram.setMyCommands(
          botToken,
          TELEGRAM_BOT_COMMANDS.map((command) => ({ ...command })),
        );
      } else {
        await this.telegram.deleteMyCommands(botToken);
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Decrypts with the same key chain the sending path uses. */
  private botTokenOf(channel: TenantChannel) {
    const { credentials } = decryptProviderCredentialsWithFallback(
      channel.credentials,
      [
        process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
          process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY,
        process.env.JWT_SECRET,
      ],
    );
    return String(credentials.botToken || '');
  }

  /**
   * Shop/ordering toggles (Plan 73, Phase 4b). New-build replacement for the
   * `telegram:shop:set` script. Merges flags into `telegramShopping`,
   * preserving everything else (template flag, media caches). Never touches
   * credentials or webhook state.
   */
  async setShopSettings(
    tenantId: string,
    channelId: string,
    input: SetShopSettingsInput,
    actorId?: string | null,
  ): Promise<ChannelTemplateSelection> {
    const channel = await this.requireTelegramChannel(tenantId, channelId);
    if (input.shopEnabled === undefined && input.orderingEnabled === undefined)
      throw new BadRequestException(
        'Provide shopEnabled and/or orderingEnabled',
      );
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined && typeof value !== 'boolean')
        throw new BadRequestException(`${key} must be a boolean`);
    }
    const shopping: Record<string, unknown> = {
      ...this.shoppingOf(channel),
      ...(input.shopEnabled !== undefined
        ? { shopEnabled: input.shopEnabled }
        : {}),
      ...(input.orderingEnabled !== undefined
        ? { orderingEnabled: input.orderingEnabled }
        : {}),
    };
    channel.configuration = {
      ...(channel.configuration as unknown as Record<string, unknown>),
      telegramShopping: shopping,
    };
    await this.channels.save(channel);
    await this.audit.logTenantUserAction(tenantId, actorId ?? null, {
      action: 'bot_shop_settings_updated',
      resourceType: 'tenant_channel',
      resourceId: channelId,
      newValues: {
        shopEnabled: shopping.shopEnabled ?? null,
        orderingEnabled: shopping.orderingEnabled ?? null,
      },
    });
    const mapping = await this.mappings.findOne({
      where: { channelId, tenantId },
    });
    return {
      channelId,
      templateId: mapping?.templateId ?? null,
      useBotTemplate: shopping.useBotTemplate === true,
    };
  }

  private async requireTelegramChannel(
    tenantId: string,
    channelId: string,
  ): Promise<TenantChannel> {
    const channel = await this.channels.findOne({
      where: { id: channelId, tenantId },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.channelType !== 'telegram')
      throw new BadRequestException(
        'Bot templates apply to Telegram channels only',
      );
    return channel;
  }

  private readUseFlag(channel: TenantChannel): boolean {
    return this.shoppingOf(channel).useBotTemplate === true;
  }

  private shoppingOf(channel: TenantChannel): Record<string, unknown> {
    const configuration: unknown = channel.configuration;
    if (typeof configuration !== 'object' || configuration === null) return {};
    const shopping = (configuration as { telegramShopping?: unknown })
      .telegramShopping;
    return typeof shopping === 'object' &&
      shopping !== null &&
      !Array.isArray(shopping)
      ? (shopping as Record<string, unknown>)
      : {};
  }

  /**
   * Resolves the effective template for rendering (Phase 4a, default
   * fallback since Phase 5). Returns the integrated template when the
   * channel flag is on and selection + template all exist; otherwise the
   * tenant default (self-healing via ensure for pre-feature tenants).
   * Returns null only for non-Telegram channels or a total template-store
   * failure — both fail safe to the static default menu in the caller.
   * Cached per channel for 20s; edits propagate within one TTL.
   */
  async resolveChannelTemplate(
    tenantId: string,
    channelId: string,
  ): Promise<ResolvedChannelTemplate | null> {
    const cacheKey = `${tenantId}:${channelId}`;
    const now = Date.now();
    const cached = this.resolvedCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;
    const value = await this.loadChannelTemplate(tenantId, channelId);
    this.resolvedCache.set(cacheKey, {
      value,
      expiresAt: now + BOT_TEMPLATE_CACHE_TTL_MS,
    });
    return value;
  }

  private async loadChannelTemplate(
    tenantId: string,
    channelId: string,
  ): Promise<ResolvedChannelTemplate | null> {
    const channel = await this.channels.findOne({
      where: { id: channelId, tenantId },
    });
    if (!channel || channel.channelType !== 'telegram') return null;
    if (this.readUseFlag(channel)) {
      const mapping = await this.mappings.findOne({
        where: { channelId, tenantId },
      });
      if (mapping) {
        const template = await this.templates.findOne({
          where: { id: mapping.templateId, tenantId },
          relations: { fields: true },
        });
        if (template) return this.sorted(template);
      }
    }
    // Default fallback: pre-feature tenants and channels without a
    // selection render the default (idempotent; race losers re-read).
    try {
      const defaults = await this.ensureDefaultTemplate(tenantId, null);
      return this.sorted(defaults);
    } catch {
      const retry = await this.getDefaultTemplate(tenantId).catch(() => null);
      return retry ? this.sorted(retry) : null;
    }
  }

  private sorted(template: TenantBotTemplate): ResolvedChannelTemplate {
    return {
      template,
      fields: [...(template.fields || [])].sort((a, b) => a.sort - b.sort),
    };
  }

  private cleanName(name: unknown): string {
    const cleaned = typeof name === 'string' ? name.trim() : '';
    if (cleaned.length < 1 || cleaned.length > 100)
      throw new BadRequestException(
        'Template name must be between 1 and 100 characters',
      );
    return cleaned;
  }

  private normalizeFields(
    inputs: BotTemplateFieldInput[] | undefined,
  ): NormalizedField[] {
    if (!inputs || inputs.length === 0)
      throw new BadRequestException(
        'Template needs at least one visible button',
      );
    const seen = new Set<string>();
    const normalized = inputs.map((input) => {
      if (!BOT_TEMPLATE_FIELD_KEYS.includes(input.key as never))
        throw new BadRequestException(
          `Unknown bot template field: ${input.key}`,
        );
      if (seen.has(input.key))
        throw new BadRequestException(
          `Duplicate bot template field: ${input.key}`,
        );
      seen.add(input.key);
      const layout = input.layout ?? 'full';
      if (!BOT_TEMPLATE_LAYOUTS.includes(layout as never))
        throw new BadRequestException(`Invalid bot template layout: ${layout}`);
      const visible = input.visible ?? true;
      if (typeof visible !== 'boolean')
        throw new BadRequestException(
          `Invalid bot template visibility for field: ${input.key}`,
        );
      const condition = input.condition ?? null;
      if (
        condition !== null &&
        !BOT_TEMPLATE_CONDITIONS.includes(condition as never)
      )
        throw new BadRequestException(
          `Invalid bot template condition: ${condition}`,
        );
      const value = input.value ?? {};
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new BadRequestException(
          `Invalid bot template value for field: ${input.key}`,
        );
      return { key: input.key, layout, visible, condition, value };
    });
    if (
      !normalized.some(
        (field) =>
          field.visible && BOT_TEMPLATE_BUTTON_KEYS.has(field.key as never),
      )
    )
      throw new BadRequestException(
        'Template needs at least one visible button',
      );
    return normalized;
  }
}
