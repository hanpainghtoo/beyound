import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';

import { TenantChannelSettings } from './entities/tenant-channel-settings.entity';
import { BotTemplateService } from '../bot-template/bot-template.service';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TenantBotTemplateChannel } from '../bot-template/entities/tenant-bot-template-channel.entity';
import { TelegramBotApiClient } from '../channel/telegram-bot-api.client';
import { decryptProviderCredentialsWithFallback } from '../channel/provider-credentials.util';
import { TELEGRAM_BOT_COMMANDS } from '../telegram-bot/telegram-bot.constants';

export const TELEGRAM_BOT_TEMPLATE_COMMERCE = 'commerce' as const;

export type TelegramBotTemplate = typeof TELEGRAM_BOT_TEMPLATE_COMMERCE | null;
export const FACEBOOK_MODE_PLATFORM = 'platform_one_click' as const;
export const FACEBOOK_MODE_BYO = 'byo_app' as const;
export type FacebookMode =
  | typeof FACEBOOK_MODE_PLATFORM
  | typeof FACEBOOK_MODE_BYO;

/** In-process TTL so every PM2 instance converges shortly after a write. */
export const CHANNEL_SETTINGS_CACHE_TTL_MS = 20_000;

type CachedTemplate = {
  value: TelegramBotTemplate;
  expiresAt: number;
};

/** The only columns this service ever writes. */
type SettingsPatch = Partial<
  Pick<
    TenantChannelSettings,
    | 'telegramBotTemplate'
    | 'facebookMode'
    | 'facebookBusinessVerified'
    | 'updatedBy'
  >
>;

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = (error as QueryFailedError & {
    driverError?: { code?: string };
  }).driverError;
  return driverError?.code === PG_UNIQUE_VIOLATION;
}

/**
 * Per-tenant channel settings. A missing row reads as template-off (null).
 * Only the commerce flow consults this service; plain Telegram messaging
 * never calls it.
 */
@Injectable()
export class TenantChannelSettingsService {
  private readonly cache = new Map<string, CachedTemplate>();

  constructor(
    @InjectRepository(TenantChannelSettings)
    private readonly repository: Repository<TenantChannelSettings>,
    private readonly botTemplates: BotTemplateService,
    @InjectRepository(TenantChannel)
    private readonly channels: Repository<TenantChannel>,
    @InjectRepository(TenantBotTemplateChannel)
    private readonly mappings: Repository<TenantBotTemplateChannel>,
  ) {}

  private readonly logger = new Logger(TenantChannelSettingsService.name);
  private readonly telegram = new TelegramBotApiClient();

  /**
   * Writes ONLY the columns in `patch`, never a whole loaded entity, so two
   * concurrent writers that own different columns (telegram template vs
   * facebook mode) cannot overwrite each other's change.
   *
   * UPDATE first; when no row exists yet, INSERT. If a concurrent request
   * inserted the row in between (unique violation on tenant_id), fall back to
   * one more targeted UPDATE.
   */
  private async patchSettings(
    tenantId: string,
    patch: SettingsPatch,
  ): Promise<void> {
    const updated = await this.repository.update({ tenantId }, patch);
    if (updated.affected && updated.affected > 0) return;
    try {
      await this.repository.insert({ tenantId, ...patch });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await this.repository.update({ tenantId }, patch);
    }
  }

  async getTelegramBotTemplate(tenantId: string): Promise<TelegramBotTemplate> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > now) return cached.value;

    const row = await this.repository.findOne({ where: { tenantId } });
    const value: TelegramBotTemplate =
      row?.telegramBotTemplate === TELEGRAM_BOT_TEMPLATE_COMMERCE
        ? TELEGRAM_BOT_TEMPLATE_COMMERCE
        : null;
    this.cache.set(tenantId, {
      value,
      expiresAt: now + CHANNEL_SETTINGS_CACHE_TTL_MS,
    });
    return value;
  }

  async getFacebookSettings(tenantId: string) {
    const row = await this.repository.findOne({ where: { tenantId } });
    return {
      facebookMode: row?.facebookMode || FACEBOOK_MODE_PLATFORM,
      facebookBusinessVerified: row?.facebookBusinessVerified ?? null,
    };
  }

  async updateFacebookSettings(
    tenantId: string,
    facebookMode: FacebookMode,
    facebookBusinessVerified?: boolean | null,
    adminId?: string | null,
  ) {
    if (![FACEBOOK_MODE_PLATFORM, FACEBOOK_MODE_BYO].includes(facebookMode)) {
      throw new BadRequestException(
        'facebookMode must be platform_one_click or byo_app',
      );
    }
    // Read only to report the previous value; it is not a write guard.
    const existing = await this.repository.findOne({ where: { tenantId } });
    const previousFacebookMode = existing?.facebookMode || FACEBOOK_MODE_PLATFORM;

    const patch: SettingsPatch = {
      facebookMode,
      updatedBy: adminId ?? null,
    };
    if (facebookBusinessVerified !== undefined) {
      patch.facebookBusinessVerified = facebookBusinessVerified;
    }
    await this.patchSettings(tenantId, patch);

    this.cache.delete(tenantId);
    const current = await this.getFacebookSettings(tenantId);
    return {
      tenantId,
      facebookMode: current.facebookMode,
      previousFacebookMode,
      facebookBusinessVerified: current.facebookBusinessVerified,
    };
  }

  async isTelegramBotTemplateEnabled(tenantId: string): Promise<boolean> {
    return (
      (await this.getTelegramBotTemplate(tenantId)) ===
      TELEGRAM_BOT_TEMPLATE_COMMERCE
    );
  }

  async updateTelegramBotTemplate(
    tenantId: string,
    value: TelegramBotTemplate,
    adminId?: string | null,
  ): Promise<{
    tenantId: string;
    telegramBotTemplate: TelegramBotTemplate;
    previousTemplate: TelegramBotTemplate;
    cascade: {
      channelsVisited: number;
      commandsUpdated: number;
      flagsUpdated: number;
      failures: string[];
    };
  }> {
    if (value !== null && value !== TELEGRAM_BOT_TEMPLATE_COMMERCE) {
      throw new BadRequestException(
        "telegramBotTemplate must be 'commerce' or null",
      );
    }

    // Enabling commerce guarantees a default template exists (Plan 73,
    // Phase 2). Default-first ordering: a failure here leaves settings
    // untouched, while the reverse order could leave commerce on with no
    // template. Disabling never deletes templates.
    if (value === TELEGRAM_BOT_TEMPLATE_COMMERCE) {
      await this.botTemplates.ensureDefaultTemplate(tenantId, adminId);
    }

    // Read only to report the previous value; it is not a write guard.
    const existing = await this.repository.findOne({ where: { tenantId } });
    const previousTemplate: TelegramBotTemplate =
      existing?.telegramBotTemplate === TELEGRAM_BOT_TEMPLATE_COMMERCE
        ? TELEGRAM_BOT_TEMPLATE_COMMERCE
        : null;

    // Targeted write: only the telegram template + updatedBy. A concurrent
    // facebook-mode change is left untouched.
    await this.patchSettings(tenantId, {
      telegramBotTemplate: value,
      updatedBy: adminId ?? null,
    });

    this.cache.delete(tenantId);
    // The settings row is the switch; the cascade makes the bot match it.
    // Best effort per channel — a Telegram outage must not fail the toggle,
    // because ingestion already routes to plain chat the moment this row
    // flips, and a later toggle re-runs the same cascade.
    const cascade = await this.cascadeCommerceState(tenantId, value);
    return { tenantId, telegramBotTemplate: value, previousTemplate, cascade };
  }

  /**
   * Plan 78: keeps Telegram and the channel flags in step with the platform
   * toggle.
   *
   * Off — clear `shopEnabled`/`orderingEnabled` and delete the `/start` and
   * `/menu` command list so nothing advertises a shop that is gone.
   *
   * On — restore the command list for every Telegram channel, but only restore
   * the shop flags on channels that actually have a template mapping; blanket
   * restoring would switch ordering on for a merchant who merely connected a
   * bot. Templates and mappings are never deleted in either direction.
   */
  private async cascadeCommerceState(
    tenantId: string,
    value: TelegramBotTemplate,
  ): Promise<{
    channelsVisited: number;
    commandsUpdated: number;
    flagsUpdated: number;
    failures: string[];
  }> {
    const failures: string[] = [];
    let commandsUpdated = 0;
    let flagsUpdated = 0;

    let channels: TenantChannel[] = [];
    try {
      channels = await this.channels.find({
        where: { tenantId, channelType: 'telegram' },
      });
    } catch (error) {
      this.logger.error(
        `commerce cascade could not list telegram channels for tenant ${tenantId}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        channelsVisited: 0,
        commandsUpdated: 0,
        flagsUpdated: 0,
        failures: ['channels_unavailable'],
      };
    }

    const enabledChannels =
      value === TELEGRAM_BOT_TEMPLATE_COMMERCE
        ? new Set(
            (await this.mappings.find({ where: { tenantId } })).map(
              (mapping) => mapping.channelId,
            ),
          )
        : null;

    for (const channel of channels) {
      try {
        await this.telegramCommandUpdate(channel, value);
        commandsUpdated += 1;
      } catch (error) {
        this.logger.warn(
          `commerce cascade command update failed for channel ${channel.id}`,
          error instanceof Error ? error.stack : undefined,
        );
        failures.push(`commands:${channel.id}`);
      }

      const wantsFlags =
        value === null ? false : enabledChannels?.has(channel.id) === true;
      if (wantsFlags !== this.shopFlagsEnabled(channel)) {
        try {
          await this.channels.save(this.withShopFlags(channel, wantsFlags));
          flagsUpdated += 1;
        } catch (error) {
          this.logger.warn(
            `commerce cascade flag update failed for channel ${channel.id}`,
            error instanceof Error ? error.stack : undefined,
          );
          failures.push(`flags:${channel.id}`);
        }
      }
    }

    return {
      channelsVisited: channels.length,
      commandsUpdated,
      flagsUpdated,
      failures,
    };
  }

  private async telegramCommandUpdate(
    channel: TenantChannel,
    value: TelegramBotTemplate,
  ) {
    const botToken = this.botTokenOf(channel);
    if (!botToken) return;
    if (value === TELEGRAM_BOT_TEMPLATE_COMMERCE) {
      await this.telegram.setMyCommands(
        botToken,
        TELEGRAM_BOT_COMMANDS.map((command) => ({ ...command })),
      );
      return;
    }
    await this.telegram.deleteMyCommands(botToken);
  }

  private botTokenOf(channel: TenantChannel) {
    try {
      const { credentials } = decryptProviderCredentialsWithFallback(
        channel.credentials,
        [
          process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
            process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY,
          process.env.JWT_SECRET,
        ],
      );
      return String(credentials.botToken || '');
    } catch {
      return '';
    }
  }

  private shopFlagsEnabled(channel: TenantChannel) {
    const shopping = (channel.configuration?.telegramShopping ||
      {}) as Record<string, unknown>;
    return shopping.shopEnabled === true && shopping.orderingEnabled === true;
  }

  private withShopFlags(channel: TenantChannel, enabled: boolean) {
    const shopping = {
      ...((channel.configuration?.telegramShopping || {}) as Record<
        string,
        unknown
      >),
      shopEnabled: enabled,
      orderingEnabled: enabled,
    };
    channel.configuration = {
      ...(channel.configuration || {}),
      telegramShopping: shopping,
    };
    return channel;
  }
}