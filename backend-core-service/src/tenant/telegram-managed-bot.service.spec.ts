/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- Repository doubles keep this unit suite focused on onboarding behavior. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TelegramManagedBotService } from './telegram-managed-bot.service';

const originalEnv = { ...process.env };

function restoreEnv() {
  process.env = { ...originalEnv };
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    id: 'request-1',
    workspaceId: 'tenant-1',
    requestedByUserId: 'user-1',
    telegramUserId: null,
    telegramChatId: null,
    requestId: 42,
    stateHash: 'state-hash',
    stateExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    suggestedName: 'Golden Mobile',
    suggestedUsername: 'GoldenMobileMMBot',
    createdBotId: null,
    createdBotUsername: null,
    status: 'pending',
    channelConnectionId: null,
    failureCode: null,
    failureMessage: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createService(overrides: Record<string, any> = {}) {
  process.env.TELEGRAM_MANAGER_BOT_TOKEN =
    '123456789:testTelegramManagerBotTokenValue';
  process.env.TELEGRAM_MANAGER_BOT_USERNAME = 'ZayOSManagerBot';
  process.env.TELEGRAM_MANAGER_WEBHOOK_SECRET =
    'test-telegram-manager-webhook-secret-32';
  process.env.TELEGRAM_MANAGER_WEBHOOK_URL =
    'https://hooks.example.com/webhooks/telegram/manager';
  process.env.TELEGRAM_MERCHANT_WEBHOOK_BASE_URL = 'https://hooks.example.com';
  process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY =
    'test-telegram-token-encryption-key-32';
  process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY =
    'test-provider-credential-key-32';
  process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-chars';

  const requestRepository = {
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
    ...overrides.requestRepository,
  };
  const tenantChannelRepository = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    })),
    ...overrides.tenantChannelRepository,
  };
  const manager = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    create: jest.fn((_, value) => ({
      id: value?.id || 'created-id',
      ...value,
    })),
    save: jest.fn(async (value) => ({ id: value.id || 'channel-1', ...value })),
    findOne: jest.fn().mockResolvedValue(null),
    ...overrides.manager,
  };
  const dataSource = {
    transaction: jest.fn(async (callback) => callback(manager)),
    getRepository: jest.fn(() => ({
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        role: 'owner',
      }),
    })),
    ...overrides.dataSource,
  };
  const service = new TelegramManagedBotService(
    dataSource,
    tenantChannelRepository,
    requestRepository,
    {
      findOne: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      ...overrides.tenantRepository,
    },
    {
      findOne: jest.fn().mockResolvedValue(null),
      ...overrides.subscriptionPlanRepository,
    },
    { logTenantUserAction: jest.fn(), ...overrides.auditLogService },
    {
      getTenantEntitlement: jest.fn().mockResolvedValue(null),
      ...overrides.entitlementService,
    },
  );
  (service as any).telegramClient = {
    getMe: jest.fn().mockResolvedValue({
      botId: '777',
      username: 'GoldenMobileMMBot',
      firstName: 'Golden Mobile',
      canManageBots: true,
    }),
    getManagedBotToken: jest
      .fn()
      .mockResolvedValue('777:merchantTelegramBotTokenValue'),
    setWebhook: jest.fn().mockResolvedValue({ ok: true }),
    getWebhookInfo: jest.fn().mockResolvedValue({
      url: 'https://hooks.example.com/webhooks/telegram/bots/channel-1',
      pendingUpdateCount: 0,
      allowedUpdates: ['message'],
    }),
    deleteWebhook: jest.fn().mockResolvedValue({ ok: true }),
    sendManagerText: jest.fn(),
    ...overrides.telegramClient,
  };
  if (overrides.ready !== false) {
    (service as any).managerReadiness = {
      status: 'ready',
      ready: true,
      code: null,
      message: null,
      checkedAt: new Date().toISOString(),
      username: 'ZayOSManagerBot',
      canManageBots: true,
    };
  }
  return {
    service,
    requestRepository,
    tenantChannelRepository,
    dataSource,
    manager,
  };
}

describe('TelegramManagedBotService', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreEnv();
  });

  it('creates a one-time state URL without storing the raw state', async () => {
    const { service, manager } = createService();
    const result = await service.initiate('tenant-1', 'user-1', {
      displayName: 'Golden Mobile',
      suggestedUsername: 'GoldenMobileMMBot',
    });

    expect(result.telegramUrl).toMatch(
      /^https:\/\/t\.me\/ZayOSManagerBot\?start=/,
    );
    const created = manager.create.mock.calls[0][1];
    const rawState = new URL(result.telegramUrl).searchParams.get('start');
    expect(created.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(created.stateHash).not.toBe(rawState);
    expect(created.status).toBe('pending');
  });

  it('marks Telegram manager ready when can_manage_bots is true', async () => {
    const { service } = createService({
      ready: false,
      telegramClient: {
        getMe: jest.fn().mockResolvedValue({
          botId: '8990811941',
          username: 'ZayOSManagerBot',
          firstName: 'ZayOS Channel Manager',
          canManageBots: true,
        }),
      },
    });

    await expect(service.retryManagerReadiness()).resolves.toMatchObject({
      status: 'ready',
      ready: true,
      username: 'ZayOSManagerBot',
      canManageBots: true,
    });
    expect(service.getManagerReadiness()).toMatchObject({
      status: 'ready',
      ready: true,
    });
  });

  it('marks Telegram manager degraded when can_manage_bots is false without throwing', async () => {
    const { service } = createService({
      ready: false,
      telegramClient: {
        getMe: jest.fn().mockResolvedValue({
          botId: '8990811941',
          username: 'ZayOSManagerBot',
          firstName: 'ZayOS Channel Manager',
          canManageBots: false,
        }),
      },
    });

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(service.getManagerReadiness()).toMatchObject({
      status: 'misconfigured',
      ready: false,
      code: 'TELEGRAM_MANAGER_BOT_MANAGEMENT_DISABLED',
      message:
        'Telegram bot management is not enabled for @ZayOSManagerBot. Enable management of other bots in the BotFather Mini App.',
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('TELEGRAM_MANAGER_BOT_MANAGEMENT_DISABLED'),
    );
    service.onModuleDestroy();
  });

  it('marks Telegram manager unavailable when getMe fails without throwing', async () => {
    const { service } = createService({
      ready: false,
      telegramClient: {
        getMe: jest.fn().mockRejectedValue(new Error('timeout')),
      },
    });

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(service.getManagerReadiness()).toMatchObject({
      status: 'unavailable',
      ready: false,
      code: 'telegram_managed_bot_provisioning_failed',
      message: 'Telegram manager readiness check is temporarily unavailable.',
    });
    service.onModuleDestroy();
  });

  it('returns 503 while Telegram manager is unavailable', async () => {
    const { service, dataSource } = createService({ ready: false });

    await expect(
      service.initiate('tenant-1', 'user-1', {
        displayName: 'Golden Mobile',
        suggestedUsername: 'GoldenMobileMMBot',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'TELEGRAM_MANAGER_NOT_READY',
        message: 'Telegram business-bot creation is temporarily unavailable.',
      },
    });
    await expect(
      service.initiate('tenant-1', 'user-1', {
        displayName: 'Golden Mobile',
        suggestedUsername: 'GoldenMobileMMBot',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects non-owner/admin users during initiation', async () => {
    const { service, dataSource } = createService({
      dataSource: {
        getRepository: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue({
            id: 'user-1',
            tenantId: 'tenant-1',
            role: 'csr',
          }),
        })),
      },
    });

    await expect(
      service.initiate('tenant-1', 'user-1', {
        displayName: 'Golden Mobile',
        suggestedUsername: 'GoldenMobileMMBot',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('consumes a valid start state once and moves to awaiting creation', async () => {
    const request = makeRequest({ status: 'pending' });
    const { service, requestRepository } = createService({
      requestRepository: { findOne: jest.fn().mockResolvedValue(request) },
    });
    const state = 'valid_state_value_abcdefghijklmnopqrstuvwxyz';
    request.stateHash = (service as any).hashState(state);

    await expect(
      service.handleManagerStart({
        state,
        telegramUserId: '10001',
        telegramChatId: '10001',
      }),
    ).resolves.toMatchObject({
      telegramRequestId: 42,
      suggestedUsername: 'GoldenMobileMMBot',
    });
    expect(request.status).toBe('awaiting_creation');
    expect(request.telegramUserId).toBe('10001');
    expect(requestRepository.save).toHaveBeenCalledWith(request);
  });

  it('rejects expired or consumed start states', async () => {
    const { service } = createService({
      requestRepository: { findOne: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.handleManagerStart({
        state: 'valid_state_value_abcdefghijklmnopqrstuvwxyz',
        telegramUserId: '10001',
        telegramChatId: '10001',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deduplicates a repeated created update after connection', async () => {
    const request = makeRequest({
      status: 'connected',
      telegramUserId: '10001',
      telegramChatId: '10001',
      createdBotId: '777',
      channelConnectionId: 'channel-1',
    });
    const { service, requestRepository } = createService({
      requestRepository: { findOne: jest.fn().mockResolvedValue(request) },
    });

    await expect(
      service.handleManagedBotCreated({
        telegramUserId: '10001',
        telegramChatId: '10001',
        createdBotId: '777',
      }),
    ).resolves.toMatchObject({
      status: 'connected',
      channelConnectionId: 'channel-1',
    });
    expect(requestRepository.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'provisioning' }),
    );
  });

  it('rejects cross-tenant bot reuse during provisioning', async () => {
    const request = makeRequest({
      status: 'awaiting_creation',
      telegramUserId: '10001',
      telegramChatId: '10001',
    });
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValue({ id: 'other-channel', tenantId: 'tenant-2' }),
    };
    const { service } = createService({
      requestRepository: { findOne: jest.fn().mockResolvedValue(request) },
      tenantChannelRepository: { createQueryBuilder: jest.fn(() => query) },
    });

    await expect(
      service.handleManagedBotCreated({
        telegramUserId: '10001',
        telegramChatId: '10001',
        createdBotId: '777',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('persists an encrypted managed channel only after Telegram validation', async () => {
    const request = makeRequest({
      status: 'awaiting_creation',
      telegramUserId: '10001',
      telegramChatId: '10001',
    });
    const { service, manager, tenantChannelRepository } = createService({
      requestRepository: { findOne: jest.fn().mockResolvedValue(request) },
    });

    await expect(
      service.handleManagedBotCreated({
        telegramUserId: '10001',
        telegramChatId: '10001',
        createdBotId: '777',
        createdBotUsername: 'GoldenMobileMMBot',
      }),
    ).resolves.toMatchObject({ status: 'connected' });

    const savedChannel = manager.save.mock.calls.find(
      (call) => call[0].channelType === 'telegram',
    )?.[0];
    expect(savedChannel.credentials).toMatchObject({ encrypted: true });
    expect(JSON.stringify(savedChannel.credentials)).not.toContain(
      'merchantTelegramBotTokenValue',
    );
    expect(tenantChannelRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        connectionStatus: 'connected',
        webhookRegistrationStatus: 'registered',
      }),
    );
  });

  it('rejects Telegram managed-bot creation when the plan does not allow Telegram (regression: plans stuck at messenger-only)', async () => {
    const request = makeRequest({
      status: 'awaiting_creation',
      telegramUserId: '10001',
      telegramChatId: '10001',
    });
    const { service, requestRepository } = createService({
      requestRepository: { findOne: jest.fn().mockResolvedValue(request) },
      tenantRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          subscriptionPlanId: 'plan-growth',
        }),
      },
      subscriptionPlanRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'plan-growth',
          name: 'Business Growth',
          allowedProviders: ['messenger'],
        }),
      },
    });

    await expect(
      service.handleManagedBotCreated({
        telegramUserId: '10001',
        telegramChatId: '10001',
        createdBotId: '777',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PROVIDER_NOT_ALLOWED_IN_PLAN',
        message: expect.stringContaining(
          'Telegram is not allowed by the current subscription plan (Business Growth allows: messenger)',
        ),
        planId: 'plan-growth',
        planName: 'Business Growth',
        allowedProviders: ['messenger'],
      },
    });
    expect(request.status).toBe('failed');
    expect(request.failureCode).toBe('provider_not_allowed_in_plan');
    expect(requestRepository.save).toHaveBeenCalled();
  });

  it('allows Telegram managed-bot creation when the plan includes Telegram', async () => {
    const request = makeRequest({
      status: 'awaiting_creation',
      telegramUserId: '10001',
      telegramChatId: '10001',
    });
    const { service } = createService({
      requestRepository: { findOne: jest.fn().mockResolvedValue(request) },
      tenantRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          subscriptionPlanId: 'plan-growth',
        }),
      },
      subscriptionPlanRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'plan-growth',
          name: 'Business Growth',
          allowedProviders: ['messenger', 'telegram'],
        }),
      },
    });

    await expect(
      service.handleManagedBotCreated({
        telegramUserId: '10001',
        telegramChatId: '10001',
        createdBotId: '777',
        createdBotUsername: 'GoldenMobileMMBot',
      }),
    ).resolves.toMatchObject({ status: 'connected' });
  });
});
