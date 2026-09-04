import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomInt } from 'crypto';
import { DataSource, In, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import {
  TelegramManagedBotOnboardingRequest,
  TelegramManagedBotOnboardingStatus,
} from '../channel/entities/telegram-managed-bot-onboarding-request.entity';
import { Tenant } from './entities/tenant.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { AuditLogService } from '../logging/audit-log.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { SubscriptionEntitlementService } from '../subscription-period/subscription-entitlement.service';
import {
  MissingActivePeriodError,
  type ResolvedSubscriptionEntitlement,
} from '../subscription-period/subscription-entitlement.types';
import {
  decryptProviderCredentials,
  encryptProviderCredentials,
} from '../channel/provider-credentials.util';
import { getProviderCredentialSchema } from '../channel/provider-credentials.util';
import { buildProviderWebhookUrl } from '../channel/provider-webhook-url.util';
import {
  TelegramBotApiClient,
  TelegramBotApiError,
} from '../channel/telegram-bot-api.client';
import type {
  InitiateTelegramManagedBotDto,
  TelegramManagedBotCreatedDto,
  TelegramManagerStartDto,
} from './dto/telegram-managed-bot.dto';

const ACTIVE_REQUEST_STATUSES: TelegramManagedBotOnboardingStatus[] = [
  'pending',
  'telegram_started',
  'awaiting_creation',
  'provisioning',
];
const REQUEST_TTL_MS = 10 * 60 * 1000;
const START_STATE_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const BOT_USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{3,62}[Bb]ot$/;
const MANAGER_RETRY_INTERVAL_MS = 5 * 60 * 1000;
const MANAGER_NOT_READY_RESPONSE = {
  code: 'TELEGRAM_MANAGER_NOT_READY',
  message: 'Telegram business-bot creation is temporarily unavailable.',
};

type TelegramManagerReadinessState = {
  status: 'ready' | 'misconfigured' | 'unavailable';
  ready: boolean;
  code: string | null;
  message: string | null;
  checkedAt: string | null;
  username?: string;
  canManageBots?: boolean;
};

@Injectable()
export class TelegramManagedBotService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly telegramClient = new TelegramBotApiClient();
  private managerReadiness: TelegramManagerReadinessState = {
    status: 'unavailable',
    ready: false,
    code: 'TELEGRAM_MANAGER_NOT_CHECKED',
    message: 'Telegram manager readiness has not been checked yet.',
    checkedAt: null,
  };
  private managerReadinessRetryTimer?: NodeJS.Timeout;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(TenantChannel)
    private readonly tenantChannelRepository: Repository<TenantChannel>,
    @InjectRepository(TelegramManagedBotOnboardingRequest)
    private readonly requestRepository: Repository<TelegramManagedBotOnboardingRequest>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(SubscriptionPlan)
    private readonly subscriptionPlanRepository: Repository<SubscriptionPlan>,
    private readonly auditLogService: AuditLogService,
    private readonly entitlementService: EntitlementService,
    @Optional()
    private readonly subscriptionEntitlementService?: SubscriptionEntitlementService,
  ) {}

  async onModuleInit() {
    await this.refreshManagerReadiness();
    this.managerReadinessRetryTimer = setInterval(() => {
      void this.refreshManagerReadiness();
    }, MANAGER_RETRY_INTERVAL_MS);
    this.managerReadinessRetryTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.managerReadinessRetryTimer) {
      clearInterval(this.managerReadinessRetryTimer);
      this.managerReadinessRetryTimer = undefined;
    }
  }

  getManagerReadiness() {
    return this.managerReadiness;
  }

  async retryManagerReadiness() {
    return this.refreshManagerReadiness();
  }

  async registerManagerWebhook(input: { url?: string; secretToken?: string }) {
    const token = this.managerToken();
    if (!token) {
      throw new ServiceUnavailableException(MANAGER_NOT_READY_RESPONSE);
    }

    const url =
      input.url?.trim() || process.env.TELEGRAM_MANAGER_WEBHOOK_URL || '';
    const secretToken =
      input.secretToken?.trim() ||
      process.env.TELEGRAM_MANAGER_WEBHOOK_SECRET ||
      '';

    if (!url) {
      throw new BadRequestException(
        'Webhook URL is required. Provide it in the body or set TELEGRAM_MANAGER_WEBHOOK_URL.',
      );
    }
    if (!secretToken) {
      throw new BadRequestException(
        'Webhook secret token is required. Provide it in the body or set TELEGRAM_MANAGER_WEBHOOK_SECRET.',
      );
    }
    if (!this.isHttpsUrl(url)) {
      throw new BadRequestException('Webhook URL must be an HTTPS URL.');
    }

    await this.telegramClient.setWebhook(token, {
      url,
      secretToken,
      allowedUpdates: ['message', 'managed_bot'],
      maxConnections: Number(
        process.env.TELEGRAM_WEBHOOK_MAX_CONNECTIONS || 40,
      ),
      dropPendingUpdates: false,
    });

    const info = await this.telegramClient.getWebhookInfo(token);
    return { url, secretToken: `${secretToken.slice(0, 4)}...`, info };
  }

  async getManagerWebhookInfo() {
    const token = this.managerToken();
    if (!token) {
      throw new ServiceUnavailableException(MANAGER_NOT_READY_RESPONSE);
    }
    const [identity, webhookInfo] = await Promise.all([
      this.telegramClient.getMe(token),
      this.telegramClient.getWebhookInfo(token),
    ]);
    return {
      ...webhookInfo,
      bot: {
        id: identity.botId,
        username: identity.username,
        canManageBots: identity.canManageBots,
      },
    };
  }

  private async refreshManagerReadiness(): Promise<TelegramManagerReadinessState> {
    const config = this.validateManagerConfig(true);
    if (!config.ok) {
      this.managerReadiness = {
        status: 'misconfigured',
        ready: false,
        code: 'TELEGRAM_MANAGER_MISCONFIGURED',
        message: 'Telegram manager configuration is incomplete or invalid.',
        checkedAt: new Date().toISOString(),
      };
      this.logManagerReadinessIssue(this.managerReadiness);
      return this.managerReadiness;
    }

    try {
      const identity = await this.telegramClient.getMe(this.managerToken());
      const expectedUsername = this.managerUsername().replace(/^@/, '');
      if (
        identity.username &&
        identity.username.toLowerCase() !== expectedUsername.toLowerCase()
      ) {
        this.managerReadiness = {
          status: 'misconfigured',
          ready: false,
          code: 'TELEGRAM_MANAGER_USERNAME_MISMATCH',
          message:
            'Telegram manager bot token does not match the configured manager username.',
          checkedAt: new Date().toISOString(),
          username: identity.username,
          canManageBots: identity.canManageBots,
        };
        this.logManagerReadinessIssue(this.managerReadiness);
        return this.managerReadiness;
      }

      if (identity.canManageBots !== true) {
        this.managerReadiness = {
          status: 'misconfigured',
          ready: false,
          code: 'TELEGRAM_MANAGER_BOT_MANAGEMENT_DISABLED',
          message: `Telegram bot management is not enabled for @${this.managerUsername()}. Enable management of other bots in the BotFather Mini App.`,
          checkedAt: new Date().toISOString(),
          username: identity.username,
          canManageBots: identity.canManageBots,
        };
        this.logManagerReadinessIssue(this.managerReadiness);
        return this.managerReadiness;
      }

      this.managerReadiness = {
        status: 'ready',
        ready: true,
        code: null,
        message: null,
        checkedAt: new Date().toISOString(),
        username: identity.username,
        canManageBots: true,
      };
      return this.managerReadiness;
    } catch (error) {
      this.managerReadiness = {
        status: 'unavailable',
        ready: false,
        code: this.safeTelegramErrorCode(error),
        message: 'Telegram manager readiness check is temporarily unavailable.',
        checkedAt: new Date().toISOString(),
      };
      this.logManagerReadinessIssue(this.managerReadiness);
      return this.managerReadiness;
    }
  }

  async initiate(
    workspaceId: string,
    requestedByUserId: string,
    dto: InitiateTelegramManagedBotDto,
  ) {
    this.assertManagerReady();
    await this.assertWorkspaceAndUser(workspaceId, requestedByUserId);
    await this.expireRequests();

    const suggestedName = this.cleanDisplayName(dto.displayName);
    const suggestedUsername = this.cleanUsername(dto.suggestedUsername);
    const state = randomBytes(32).toString('base64url');
    const stateHash = this.hashState(state);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REQUEST_TTL_MS);

    const request = await this.dataSource.transaction(async (manager) => {
      await manager.update(
        TelegramManagedBotOnboardingRequest,
        {
          workspaceId,
          requestedByUserId,
          status: In(ACTIVE_REQUEST_STATUSES),
        },
        {
          status: 'cancelled',
          completedAt: now,
          failureCode: 'superseded',
          failureMessage: 'A newer Telegram managed bot request was started.',
        },
      );

      const created = manager.create(TelegramManagedBotOnboardingRequest, {
        workspaceId,
        requestedByUserId,
        requestId: randomInt(1, 2_147_483_647),
        stateHash,
        stateExpiresAt: expiresAt,
        suggestedName,
        suggestedUsername,
        status: 'pending',
      });
      return manager.save(created);
    });

    await this.logRequestAudit(
      workspaceId,
      requestedByUserId,
      'telegram_managed_bot_requested',
      request,
      {
        suggestedName,
        suggestedUsername,
        expiresAt,
      },
    );

    return {
      requestId: request.id,
      telegramUrl: `https://t.me/${this.managerUsername().replace(/^@/, '')}?start=${state}`,
      status: request.status,
      expiresAt: request.stateExpiresAt.toISOString(),
    };
  }

  async getRequestStatus(workspaceId: string, requestId: string) {
    await this.expireRequests();
    const request = await this.requestRepository.findOne({
      where: { id: requestId, workspaceId },
    });
    if (!request)
      throw new NotFoundException('Telegram onboarding request not found');
    return this.toSafeRequest(request);
  }

  async cancel(
    workspaceId: string,
    requestedByUserId: string,
    requestId: string,
  ) {
    const request = await this.requestRepository.findOne({
      where: { id: requestId, workspaceId },
    });
    if (!request)
      throw new NotFoundException('Telegram onboarding request not found');
    if (!ACTIVE_REQUEST_STATUSES.includes(request.status))
      return this.toSafeRequest(request);

    request.status = 'cancelled';
    request.completedAt = new Date();
    request.failureCode = 'cancelled_by_user';
    request.failureMessage = 'The Telegram managed bot request was cancelled.';
    await this.requestRepository.save(request);
    await this.logRequestAudit(
      workspaceId,
      requestedByUserId,
      'telegram_managed_bot_failed',
      request,
      { failureCode: request.failureCode },
    );
    return this.toSafeRequest(request);
  }

  async handleManagerStart(input: TelegramManagerStartDto) {
    this.assertValidTelegramId(input.telegramUserId, 'telegramUserId');
    this.assertValidTelegramId(input.telegramChatId, 'telegramChatId');
    if (!START_STATE_PATTERN.test(input.state || '')) {
      throw new BadRequestException(
        'Invalid or expired Telegram onboarding request.',
      );
    }

    await this.expireRequests();
    const stateHash = this.hashState(input.state);
    const now = new Date();
    const request = await this.requestRepository.findOne({
      where: {
        stateHash,
        status: 'pending',
        stateExpiresAt: MoreThan(now),
      },
    });
    if (!request) {
      throw new BadRequestException(
        'Invalid or expired Telegram onboarding request.',
      );
    }

    request.telegramUserId = input.telegramUserId;
    request.telegramChatId = input.telegramChatId;
    request.status = 'awaiting_creation';
    await this.requestRepository.save(request);
    await this.logRequestAudit(
      request.workspaceId,
      request.requestedByUserId,
      'telegram_manager_started',
      request,
      {
        telegramUserId: request.telegramUserId,
        telegramChatId: request.telegramChatId,
      },
    );

    return {
      requestId: request.id,
      telegramRequestId: request.requestId,
      suggestedName: request.suggestedName,
      suggestedUsername: request.suggestedUsername,
      message:
        'Create your business bot below. Customers will message that business bot directly; this manager bot is only used during setup.',
    };
  }

  async handleManagedBotCreated(input: TelegramManagedBotCreatedDto) {
    this.assertManagerReady();
    this.assertValidTelegramId(input.telegramUserId, 'telegramUserId');
    this.assertValidTelegramId(input.telegramChatId, 'telegramChatId');
    this.assertValidTelegramId(input.createdBotId, 'createdBotId');
    await this.expireRequests();

    const request = await this.requestRepository.findOne({
      where: {
        telegramUserId: input.telegramUserId,
        status: In(['awaiting_creation', 'provisioning', 'connected']),
      },
      order: { updatedAt: 'DESC' },
    });
    if (!request) {
      throw new NotFoundException(
        'No active Telegram managed bot request was found.',
      );
    }
    if (request.telegramChatId !== input.telegramChatId) {
      throw new ForbiddenException('Telegram onboarding chat mismatch.');
    }
    if (
      request.stateExpiresAt <= new Date() &&
      request.status !== 'connected'
    ) {
      await this.failRequest(
        request,
        'request_expired',
        'Telegram onboarding request expired.',
      );
      throw new BadRequestException('Telegram onboarding request expired.');
    }
    if (request.status === 'connected' && request.channelConnectionId) {
      return { ...this.toSafeRequest(request), alreadyConnected: true };
    }

    if (
      request.createdBotId &&
      request.createdBotId === input.createdBotId &&
      request.status !== 'awaiting_creation'
    ) {
      return { ...this.toSafeRequest(request), alreadyConnected: true };
    }

    request.status = 'provisioning';
    request.createdBotId = input.createdBotId;
    request.createdBotUsername =
      this.cleanOptionalUsername(input.createdBotUsername) ||
      request.createdBotUsername;
    await this.requestRepository.save(request);
    await this.logRequestAudit(
      request.workspaceId,
      request.requestedByUserId,
      'telegram_managed_bot_created',
      request,
      {
        telegramBotId: request.createdBotId,
        username: request.createdBotUsername,
      },
    );

    return this.provision(request, input.createdBotFirstName);
  }

  async disconnectManagedBot(
    workspaceId: string,
    channelId: string,
    actorUserId?: string | null,
  ) {
    const channel = await this.tenantChannelRepository.findOne({
      where: { id: channelId, tenantId: workspaceId, channelType: 'telegram' },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if ((channel.configuration || {}).connectionType !== 'managed_bot') {
      throw new BadRequestException(
        'Channel is not a managed Telegram bot connection.',
      );
    }

    const credentials = this.decryptManagedChannelCredentials(channel);
    try {
      if (typeof credentials.botToken === 'string') {
        await this.telegramClient.deleteWebhook(credentials.botToken, {
          dropPendingUpdates: false,
        });
      }
    } catch (error) {
      channel.webhookRegistrationStatus = 'failed';
      channel.webhookRegistrationErrorCode = this.safeTelegramErrorCode(error);
    }
    channel.status = 'inactive';
    channel.connectionStatus = 'disabled';
    channel.errorMessage = null;
    await this.tenantChannelRepository.save(channel);
    await this.logChannelAudit(
      workspaceId,
      actorUserId,
      'telegram_managed_bot_disconnected',
      channel,
      { telegramBotId: channel.providerAccountId },
    );
  }

  private async assertProviderAllowed(workspaceId: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: workspaceId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (this.subscriptionEntitlementService) {
      // Use subscription-period snapshot as source of truth.
      // Let MissingActivePeriodError propagate – caller will handle it.
      const entitlement =
        await this.subscriptionEntitlementService.resolveActiveSubscriptionEntitlement(
          workspaceId,
        );
      const allowed = Array.isArray(entitlement.planSnapshot.allowedProviders)
        ? entitlement.planSnapshot.allowedProviders
        : [];
      if (allowed.length && !allowed.includes('telegram')) {
        throw new ConflictException({
          code: 'PROVIDER_NOT_ALLOWED_IN_PLAN',
          message: `Telegram is not allowed by the current subscription plan (${entitlement.planId})`,
          channelType: 'telegram',
          allowedProviders: allowed,
          planId: entitlement.planId,
        });
      }
      return;
    }

    // Legacy fallback (deprecated)
    const entitlement = await this.entitlementService
      .getTenantEntitlement(workspaceId)
      .catch(() => null);
    const planId = entitlement?.planId || tenant?.subscriptionPlanId || null;
    if (!planId) return;

    const plan = await this.subscriptionPlanRepository.findOne({
      where: { id: planId },
    });
    if (!plan) return;

    const allowedProviders = Array.isArray(plan.allowedProviders)
      ? plan.allowedProviders
      : [];
    if (allowedProviders.length === 0) return;

    if (!allowedProviders.includes('telegram')) {
      throw new ConflictException({
        code: 'PROVIDER_NOT_ALLOWED_IN_PLAN',
        message: `Telegram is not allowed by the current subscription plan (${plan.name} allows: ${allowedProviders.join(', ')})`,
        channelType: 'telegram',
        allowedProviders,
        planId: plan.id,
        planName: plan.name,
      });
    }
  }

  private async provision(
    request: TelegramManagedBotOnboardingRequest,
    createdBotFirstName?: string,
  ) {
    try {
      const createdBotId = request.createdBotId;
      if (!createdBotId) {
        throw new TelegramBotApiError('managed_bot_missing');
      }
      try {
        await this.assertProviderAllowed(request.workspaceId);
      } catch (error) {
        if (error instanceof MissingActivePeriodError) {
          throw new ConflictException({
            code: 'NO_ACTIVE_SUBSCRIPTION_PERIOD',
            message:
              'No active subscription period – cannot connect a managed Telegram bot.',
          });
        }
        throw error;
      }
      await this.assertTelegramBotAvailable(
        createdBotId,
        request.channelConnectionId || undefined,
      );
      const token = await this.telegramClient.getManagedBotToken(
        this.managerToken(),
        createdBotId,
      );
      const identity = await this.telegramClient.getMe(token);
      if (identity.botId !== createdBotId) {
        throw new TelegramBotApiError('managed_bot_identity_mismatch');
      }

      const webhookSecret = randomBytes(32).toString('base64url');
      let savedChannel: TenantChannel;
      await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(TenantChannel, {
          where: {
            channelType: 'telegram',
            providerAccountId: createdBotId,
          },
        });
        if (existing && existing.tenantId !== request.workspaceId) {
          throw new ConflictException(
            'This Telegram bot is already connected to a ZayOS workspace.',
          );
        }

        const now = new Date();
        const channel = existing || manager.create(TenantChannel);
        channel.tenantId = request.workspaceId;
        channel.channelType = 'telegram';
        channel.channelName = this.channelNameFromUsername(
          identity.username ||
            request.createdBotUsername ||
            request.suggestedUsername,
        );
        channel.displayName =
          identity.firstName || createdBotFirstName || request.suggestedName;
        channel.status = 'pending';
        channel.connectionStatus = 'webhook_registering';
        channel.providerAccountId = createdBotId;
        channel.credentialsVerifiedAt = now;
        channel.credentialLastUpdatedAt = now;
        channel.credentialSchema = getProviderCredentialSchema('telegram');
        channel.credentialStatus = 'encrypted';
        channel.webhookRegistrationStatus = 'pending';
        channel.webhookRegistrationCheckedAt = now;
        channel.webhookRegistrationErrorCode = null;
        channel.errorMessage = null;
        channel.credentials = encryptProviderCredentials(
          {
            botToken: token,
            botUsername: identity.username || request.createdBotUsername,
            secretToken: webhookSecret,
          },
          this.getCredentialSecret(),
        );
        channel.configuration = {
          ...(channel.configuration || {}),
          provider: 'telegram',
          connectionType: 'managed_bot',
          managedBy: this.managerUsername(),
          onboardingRequestId: request.id,
          connectedByUserId: request.requestedByUserId,
          verifiedIdentity: {
            botId: identity.botId,
            username: identity.username || request.createdBotUsername,
            firstName: identity.firstName || createdBotFirstName,
          },
          credentialsVerifiedAt: now.toISOString(),
          providerApiCheckStatus: 'credentials_verified',
        };
        savedChannel = await manager.save(channel);
        savedChannel.webhookUrl = this.buildMerchantWebhookUrl(savedChannel.id);
        savedChannel.configuration = {
          ...(savedChannel.configuration || {}),
          webhookUrl: savedChannel.webhookUrl,
        };
        savedChannel = await manager.save(savedChannel);
        request.channelConnectionId = savedChannel.id;
        await manager.save(request);
      });

      try {
        const maxRetries = 3;
        let lastError: unknown;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await this.telegramClient.setWebhook(token, {
              url:
                savedChannel!.webhookUrl ||
                this.buildMerchantWebhookUrl(savedChannel!.id),
              secretToken: webhookSecret,
              allowedUpdates: ['message'],
              maxConnections: Number(
                process.env.TELEGRAM_WEBHOOK_MAX_CONNECTIONS || 40,
              ),
              dropPendingUpdates: false,
            });
            lastError = undefined;
            break;
          } catch (err) {
            lastError = err;
            if (
              err instanceof TelegramBotApiError &&
              err.code === 'rate_limited'
            ) {
              const delayMs = (err.safeDetails.retryAfterSeconds || 1) * 1000;
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              continue;
            }
            throw err;
          }
        }
        if (lastError) throw lastError;
        const webhookInfo = await this.telegramClient.getWebhookInfo(token);
        savedChannel!.status = 'active';
        savedChannel!.connectionStatus = 'connected';
        savedChannel!.connectedAt = new Date();
        savedChannel!.webhookRegistrationStatus = 'registered';
        savedChannel!.webhookRegisteredAt = new Date();
        savedChannel!.webhookRegistrationCheckedAt = new Date();
        savedChannel!.webhookRegistrationErrorCode = null;
        savedChannel!.errorMessage = null;
        savedChannel!.configuration = {
          ...(savedChannel!.configuration || {}),
          telegramWebhook: {
            status: 'webhook_registered',
            checkedAt: savedChannel!.webhookRegistrationCheckedAt.toISOString(),
            pendingUpdateCount: webhookInfo.pendingUpdateCount,
            allowedUpdates: webhookInfo.allowedUpdates,
          },
        };
        await this.tenantChannelRepository.save(savedChannel!);
      } catch (error) {
        savedChannel!.status = 'pending';
        savedChannel!.connectionStatus = 'error';
        savedChannel!.webhookRegistrationStatus = 'failed';
        savedChannel!.webhookRegistrationCheckedAt = new Date();
        savedChannel!.webhookRegistrationErrorCode =
          this.safeTelegramErrorCode(error);
        savedChannel!.errorMessage = savedChannel!.webhookRegistrationErrorCode;
        await this.tenantChannelRepository.save(savedChannel!);
        throw error;
      }

      request.status = 'connected';
      request.completedAt = new Date();
      request.failureCode = null;
      request.failureMessage = null;
      await this.requestRepository.save(request);
      await this.logChannelAudit(
        request.workspaceId,
        request.requestedByUserId,
        'telegram_managed_bot_connected',
        savedChannel!,
        {
          telegramBotId: createdBotId,
          username: this.publicTelegramUsername(savedChannel!),
          connectionType: 'managed_bot',
        },
      );

      return { ...this.toSafeRequest(request, savedChannel!), botToken: token };
    } catch (error) {
      await this.failRequest(
        request,
        this.safeTelegramErrorCode(error),
        'Telegram managed bot provisioning failed. Please retry setup or contact support.',
      );
      throw error;
    }
  }

  private async assertWorkspaceAndUser(workspaceId: string, userId: string) {
    const [tenant, user] = await Promise.all([
      this.tenantRepository.findOne({ where: { id: workspaceId } }),
      this.dataSource.getRepository(TenantUser).findOne({
        where: { id: userId, tenantId: workspaceId },
      }),
    ]);
    if (!tenant || !user) {
      throw new ForbiddenException('Workspace access is required.');
    }
    if (!['owner', 'admin'].includes(String(user.role || '').toLowerCase())) {
      throw new ForbiddenException(
        'Workspace owner or administrator access is required.',
      );
    }
  }

  private async assertTelegramBotAvailable(
    botId: string,
    existingChannelId?: string,
  ) {
    const query = this.tenantChannelRepository
      .createQueryBuilder('channel')
      .where('channel.channel_type = :channelType', { channelType: 'telegram' })
      .andWhere('channel.provider_account_id = :botId', { botId })
      .andWhere("channel.status NOT IN ('inactive', 'disabled')")
      .andWhere(
        "channel.connection_status NOT IN ('disabled', 'locally_disabled_provider_cleanup_pending')",
      );
    if (existingChannelId) {
      query.andWhere('channel.id != :existingChannelId', { existingChannelId });
    }
    if (await query.getOne()) {
      throw new ConflictException(
        'This Telegram bot is already connected to a ZayOS workspace.',
      );
    }
  }

  private async expireRequests() {
    const now = new Date();
    await this.requestRepository.update(
      {
        status: In(['pending', 'telegram_started', 'awaiting_creation']),
        stateExpiresAt: LessThanOrEqual(now),
      },
      {
        status: 'expired',
        completedAt: now,
        failureCode: 'request_expired',
        failureMessage: 'Telegram managed bot onboarding request expired.',
      },
    );
  }

  private async failRequest(
    request: TelegramManagedBotOnboardingRequest,
    code: string,
    message: string,
  ) {
    request.status = 'failed';
    request.failureCode = code.slice(0, 120);
    request.failureMessage = message;
    request.completedAt = new Date();
    await this.requestRepository.save(request);
    await this.logRequestAudit(
      request.workspaceId,
      request.requestedByUserId,
      'telegram_managed_bot_failed',
      request,
      { failureCode: request.failureCode },
    );
  }

  private toSafeRequest(
    request: TelegramManagedBotOnboardingRequest,
    channel?: TenantChannel,
  ) {
    return {
      requestId: request.id,
      status: request.status,
      expiresAt: request.stateExpiresAt.toISOString(),
      suggestedName: request.suggestedName,
      suggestedUsername: request.suggestedUsername,
      createdBotUsername: request.createdBotUsername,
      channelConnectionId: request.channelConnectionId,
      failureCode: request.failureCode,
      failureMessage: request.failureMessage,
      completedAt: request.completedAt?.toISOString() || null,
      connectedChannel: channel
        ? {
            id: channel.id,
            displayName: channel.displayName,
            username:
              this.publicTelegramUsername(channel) ||
              request.createdBotUsername,
            connectedAt: channel.connectedAt,
            status: channel.status,
            connectionStatus: channel.connectionStatus,
            webhookRegistrationStatus: channel.webhookRegistrationStatus,
          }
        : undefined,
    };
  }

  private decryptManagedChannelCredentials(channel: TenantChannel) {
    return decryptProviderCredentials(
      channel.credentials,
      this.getCredentialSecret(),
    );
  }

  private hashState(state: string) {
    return createHash('sha256')
      .update(`${this.getStateSecret()}:${state}`)
      .digest('hex');
  }

  private managerToken() {
    return process.env.TELEGRAM_MANAGER_BOT_TOKEN || '';
  }

  private managerUsername() {
    return (
      process.env.TELEGRAM_MANAGER_BOT_USERNAME || 'ZayOSManagerBot'
    ).replace(/^@/, '');
  }

  private assertManagerReady() {
    if (!this.managerReadiness.ready) {
      throw new ServiceUnavailableException(MANAGER_NOT_READY_RESPONSE);
    }
  }

  private validateManagerConfig(requireWebhookUrls: boolean) {
    const errors: string[] = [];
    for (const key of [
      'TELEGRAM_MANAGER_BOT_TOKEN',
      'TELEGRAM_MANAGER_BOT_USERNAME',
      'TELEGRAM_MANAGER_WEBHOOK_SECRET',
      'TELEGRAM_MANAGER_WEBHOOK_URL',
      'TELEGRAM_MERCHANT_WEBHOOK_BASE_URL',
      'TELEGRAM_TOKEN_ENCRYPTION_KEY',
    ]) {
      if (!process.env[key]?.trim()) errors.push(`${key} is required.`);
    }
    if (
      requireWebhookUrls &&
      !this.isHttpsUrl(process.env.TELEGRAM_MANAGER_WEBHOOK_URL || '')
    ) {
      errors.push('TELEGRAM_MANAGER_WEBHOOK_URL must be an HTTPS URL.');
    }
    if (
      requireWebhookUrls &&
      !this.isHttpsUrl(process.env.TELEGRAM_MERCHANT_WEBHOOK_BASE_URL || '')
    ) {
      errors.push('TELEGRAM_MERCHANT_WEBHOOK_BASE_URL must be an HTTPS URL.');
    }
    return { ok: errors.length === 0, errors };
  }

  private logManagerReadinessIssue(state: TelegramManagerReadinessState) {
    if (!state.code) return;
    const message =
      state.code === 'TELEGRAM_MANAGER_BOT_MANAGEMENT_DISABLED'
        ? state.message
        : `Telegram manager readiness degraded: ${state.code}`;
    console.error(
      JSON.stringify({
        event: 'telegram_manager_readiness_degraded',
        status: state.status,
        code: state.code,
        message,
        checkedAt: state.checkedAt,
      }),
    );
  }

  private getCredentialSecret() {
    return (
      process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
      process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      ''
    );
  }

  private getStateSecret() {
    return (
      process.env.JWT_SECRET ||
      process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
      'development-state-secret'
    );
  }

  private buildMerchantWebhookUrl(channelId: string) {
    const base = process.env.TELEGRAM_MERCHANT_WEBHOOK_BASE_URL;
    if (base) {
      return `${base.replace(/\/$/, '')}/webhooks/telegram/bots/${channelId}`;
    }
    return buildProviderWebhookUrl({
      provider: 'telegram',
      channelId,
      baseUrl: process.env.WEBHOOK_PUBLIC_BASE_URL || 'http://localhost:3000',
    });
  }

  private cleanDisplayName(value: string) {
    const normalized = (value || '').trim().replace(/\s+/g, ' ');
    if (normalized.length < 2 || normalized.length > 128) {
      throw new BadRequestException('Business bot display name is invalid.');
    }
    return normalized;
  }

  private cleanUsername(value: string) {
    const username = (value || '').trim().replace(/^@/, '');
    if (!BOT_USERNAME_PATTERN.test(username)) {
      throw new BadRequestException(
        'Suggested Telegram bot username is invalid.',
      );
    }
    return username;
  }

  private cleanOptionalUsername(value?: string) {
    if (!value) return undefined;
    const username = value.trim().replace(/^@/, '');
    return BOT_USERNAME_PATTERN.test(username) ? username : undefined;
  }

  private channelNameFromUsername(username: string) {
    return (
      username
        .replace(/bot$/i, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 48) || 'telegram-managed-bot'
    );
  }

  private assertValidTelegramId(value: string, field: string) {
    if (!/^-?\d{1,32}$/.test(value || '')) {
      throw new BadRequestException(`${field} is invalid.`);
    }
  }

  private publicTelegramUsername(channel: TenantChannel) {
    const configuration = (channel.configuration || {}) as Record<
      string,
      unknown
    >;
    const verifiedIdentity =
      configuration.verifiedIdentity &&
      typeof configuration.verifiedIdentity === 'object' &&
      !Array.isArray(configuration.verifiedIdentity)
        ? (configuration.verifiedIdentity as Record<string, unknown>)
        : undefined;
    return typeof verifiedIdentity?.username === 'string'
      ? verifiedIdentity.username
      : undefined;
  }

  private isHttpsUrl(value: string) {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }

  private safeTelegramErrorCode(error: unknown) {
    if (error instanceof ConflictException) {
      const response = error.getResponse() as
        | Record<string, unknown>
        | undefined;
      if (response?.code === 'PROVIDER_NOT_ALLOWED_IN_PLAN') {
        return 'provider_not_allowed_in_plan';
      }
      return 'telegram_bot_already_connected';
    }
    if (error instanceof TelegramBotApiError) return error.code;
    if (error instanceof BadRequestException) return 'bad_request';
    return 'telegram_managed_bot_provisioning_failed';
  }

  private async logRequestAudit(
    tenantId: string,
    actorUserId: string | null | undefined,
    action: string,
    request: TelegramManagedBotOnboardingRequest,
    newValues: Record<string, unknown>,
  ) {
    await this.auditLogService.logTenantUserAction(
      tenantId,
      actorUserId || null,
      {
        action,
        resourceType: 'telegram_managed_bot_onboarding_request',
        resourceId: request.id,
        newValues,
      },
    );
  }

  private async logChannelAudit(
    tenantId: string,
    actorUserId: string | null | undefined,
    action: string,
    channel: TenantChannel,
    newValues: Record<string, unknown>,
  ) {
    await this.auditLogService.logTenantUserAction(
      tenantId,
      actorUserId || null,
      {
        action,
        resourceType: 'tenant_channel',
        resourceId: channel.id,
        newValues: {
          channelType: channel.channelType,
          channelName: channel.channelName,
          ...newValues,
        },
      },
    );
  }
}
