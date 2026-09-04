/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- Legacy TenantService unit tests use lightweight repository doubles; this task only adds UUID webhook routing coverage. */
import { BadRequestException, ConflictException } from '@nestjs/common';

import { TenantService } from './tenant.service';
import { yangonMonthEnd } from '../subscription-period/yangon-month.util';
import { MissingActivePeriodError } from '../subscription-period/subscription-entitlement.types';

const originalWebhookPublicBaseUrl = process.env.WEBHOOK_PUBLIC_BASE_URL;
const originalJwtSecret = process.env.JWT_SECRET;

function createService(overrides: Record<string, any> = {}) {
  const repositories = {
    tenantUser: {
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: value.id || 'tenant-user-1',
        ...value,
      })),
    },
    tenantChannel: {
      count: jest.fn(),
      find: jest.fn(async (_options?: unknown) => [] as any[]),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      manager: undefined,
    },
    cannedResponse: {},
    product: {},
    productCategory: {},
    tenantAnalytics: {},
    conversation: {},
    tenant: { findOne: jest.fn(), save: jest.fn(async (value) => value) },
    subscriptionPlan: { findOne: jest.fn() },
    tenantBillingRecord: {},
    tenantUsage: {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0', latest: null }),
      })),
    },
    subscriptionPeriod: {
      find: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
  const channelAdapterService = overrides.channelAdapterService || {
    validateConfig: jest.fn(async () => ({ valid: true, errors: [] })),
  };
  const auditLogService = overrides.auditLogService || {
    logTenantUserAction: jest.fn(),
  };
  const authService = overrides.authService || {
    issueTenantUserInvite: jest.fn(async () => ({
      message: 'Team invitation requested',
      invitationDelivery: 'requested',
      expiresAt: new Date(Date.now() + 60_000),
    })),
  };

  const service = new TenantService(
    repositories.tenantUser as any,
    repositories.tenantChannel as any,
    repositories.cannedResponse as any,
    repositories.product as any,
    repositories.productCategory as any,
    repositories.tenantAnalytics as any,
    repositories.conversation as any,
    repositories.tenant as any,
    repositories.subscriptionPlan as any,
    repositories.tenantBillingRecord as any,
    {} as any,
    repositories.tenantUsage as any,
    repositories.subscriptionPeriod as any,
    {} as any,
    channelAdapterService,
    auditLogService,
    authService,
    {
      getTenantEntitlement: jest
        .fn()
        .mockResolvedValue({ state: 'trial_active' }),
    } as any,
  );

  (service as any).subscriptionEntitlementService = {
    resolveActiveSubscriptionEntitlement: jest.fn(async () => {
      const tenant = await repositories.tenant.findOne({
        where: { id: 'tenant-1' },
      });
      const plan = tenant?.subscriptionPlanId
        ? await repositories.subscriptionPlan.findOne({
            where: { id: tenant.subscriptionPlanId },
          })
        : null;
      const capacity = tenant?.customChannelLimit ?? plan?.maxChannels ?? 0;
      const channels = await repositories.tenantChannel.find({
        where: { tenantId: 'tenant-1' },
      });
      return {
        activePeriodId: 'period-1',
        periodEndAt: new Date('2026-09-01T00:00:00.000Z'),
        baseLimits: { channel_slots: capacity },
        activeTopUpComponentTotals: { channel_slots: 0 },
        effectiveLimits: { channel_slots: capacity },
        channels,
        planSnapshot: plan
          ? { allowedProviders: plan.allowedProviders || [] }
          : { allowedProviders: [] },
        planId: plan?.id,
        periodType: 'paid',
      };
    }),
  };
  if (!repositories.tenantChannel.find) {
    repositories.tenantChannel.find = jest.fn(
      async (_options?: unknown) => [] as any[],
    );
  }
  repositories.tenantChannel.find.mockImplementation(async () => {
    const count = await repositories.tenantChannel.count({
      where: { tenantId: 'tenant-1' },
    });
    return Array.from({ length: Number(count || 0) }, (_, index) => ({
      id: `channel-${index}`,
      status: 'active',
      entitlementOrigin: 'base_plan',
      createdAt: new Date(index),
    }));
  });

  jest
    .spyOn(service as any, 'callIntegrationTelegramWebhook')
    .mockResolvedValue({
      ok: false,
      status: 'integration_service_unavailable',
      providerError: { code: 'integration_service_unavailable' },
    });

  return {
    service,
    repositories,
    channelAdapterService,
    auditLogService,
    authService,
  };
}

describe('TenantService commercial limits', () => {
  afterEach(() => {
    if (originalWebhookPublicBaseUrl === undefined) {
      delete process.env.WEBHOOK_PUBLIC_BASE_URL;
    } else {
      process.env.WEBHOOK_PUBLIC_BASE_URL = originalWebhookPublicBaseUrl;
    }
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('blocks csr creation when the tenant custom csr limit is reached', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customCsrLimit: 2,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxCsrs: 10,
    });
    repositories.tenantUser.count.mockResolvedValue(2);

    await expect(
      service.createCsr('tenant-1', {
        fullName: 'New CSR',
        email: 'new-csr@example.com',
        password: 'ZayStrong123!',
        role: 'csr',
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CSRS_PLAN_LIMIT_REACHED',
        limit: 2,
        used: 2,
      }),
    });
    expect(repositories.tenantUser.create).not.toHaveBeenCalled();
  });

  it('persists onboarding setup guide state in tenant feature flags', async () => {
    const { service, repositories } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      featureFlags: { existingFlag: true },
    });

    await expect(
      service.updateOnboardingState('tenant-1', 'user-1', {
        dismissedAt: '2026-07-04T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      featureFlags: {
        existingFlag: true,
        onboardingSetupGuide: expect.objectContaining({
          dismissedAt: '2026-07-04T00:00:00.000Z',
          dismissedBy: 'user-1',
          updatedAt: expect.any(String),
        }),
      },
    });
    expect(repositories.tenant.save).toHaveBeenCalled();
  });

  it('uses the subscription plan csr limit when no custom override exists', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customCsrLimit: null,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxCsrs: 1,
    });
    repositories.tenantUser.count.mockResolvedValue(1);

    await expect(
      service.createCsr('tenant-1', {
        fullName: 'Second CSR',
        email: 'second-csr@example.com',
        password: 'ZayStrong123!',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects direct team-member creation when the password is missing or weak', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customCsrLimit: 10,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxCsrs: 10,
    });
    repositories.tenantUser.count.mockResolvedValue(1);

    await expect(
      service.createCsr('tenant-1', {
        fullName: 'Weak Password CSR',
        email: 'weak-password@example.com',
        password: '',
        role: 'csr',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createCsr('tenant-1', {
        fullName: 'Weak Password CSR',
        email: 'weak-password@example.com',
        password: 'weakpass',
        role: 'csr',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks direct password-created users as email verified', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customCsrLimit: 10,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxCsrs: 10,
    });
    repositories.tenantUser.count.mockResolvedValue(0);

    await expect(
      service.createCsr('tenant-1', {
        fullName: 'Direct Password User',
        email: 'direct-user@example.com',
        password: 'ZayStrong123!',
        role: 'admin',
      } as any),
    ).resolves.toMatchObject({
      email: 'direct-user@example.com',
      role: 'admin',
      status: 'active',
    });

    expect(repositories.tenantUser.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'direct-user@example.com',
        emailVerifiedAt: expect.any(Date),
      }),
    );
  });

  it('creates an inactive invited user without exposing invite tokens or URLs', async () => {
    const { service, repositories, authService } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customCsrLimit: 10,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxCsrs: 10,
    });
    repositories.tenantUser.count.mockResolvedValue(1);

    await expect(
      service.inviteCsr(
        'tenant-1',
        {
          fullName: 'Invited User',
          email: 'invite@example.com',
          role: 'csr',
        } as any,
        'owner-1',
        'owner',
      ),
    ).resolves.toMatchObject({
      user: expect.objectContaining({
        email: 'invite@example.com',
        status: 'inactive',
      }),
      invitation: expect.objectContaining({
        invitationDelivery: 'requested',
      }),
    });
    const result = await service.inviteCsr(
      'tenant-1',
      {
        fullName: 'Second Invited User',
        email: 'invite-2@example.com',
        role: 'csr',
      },
      'owner-1',
      'owner',
    );
    expect(JSON.stringify(result)).not.toContain('invite-token');
    expect(JSON.stringify(result)).not.toContain('reset-password?token=');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(repositories.tenantUser.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'invite@example.com',
        status: 'inactive',
        emailVerifiedAt: null,
      }),
    );

    expect(authService.issueTenantUserInvite).toHaveBeenCalledWith(
      expect.any(String),
      'invite@example.com',
      expect.objectContaining({
        invitedBy: 'owner-1',
        tenantId: 'tenant-1',
        role: 'csr',
      }),
    );
  });

  it('exposes finance and delivery as supported tenant roles', () => {
    const { service } = createService();

    expect(service.getAvailableRoles()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'finance' }),
        expect.objectContaining({ role: 'delivery' }),
      ]),
    );
  });

  it('fails closed for channel mutations without a transaction manager in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const { service } = createService();

    try {
      await expect(
        service.createChannel('tenant-1', {
          channelType: 'telegram',
          channelName: 'Telegram',
          credentials: { botToken: '123456:test' },
        } as any),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CHANNEL_TRANSACTION_REQUIRED',
        }),
      });
      await expect(
        service.reactivateChannel('tenant-1', 'channel-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CHANNEL_TRANSACTION_REQUIRED',
        }),
      });
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('blocks channel creation when the tenant channel plan limit is reached', async () => {
    const { service, repositories, channelAdapterService } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customChannelLimit: null,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxChannels: 1,
    });
    repositories.tenantChannel.count.mockResolvedValue(1);

    await expect(
      service.createChannel('tenant-1', {
        channelType: 'telegram',
        channelName: 'Telegram',
        credentials: { botToken: '123456:test' },
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CHANNELS_PLAN_LIMIT_REACHED',
        limit: 1,
        used: 1,
      }),
    });
    expect(channelAdapterService.validateConfig).toHaveBeenCalled();
    expect(repositories.tenantChannel.create).not.toHaveBeenCalled();
  });

  it('uses the period trial plan for provider checks without requiring a legacy entitlement', async () => {
    const { service, repositories } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      subscriptionPlanId: null,
    });
    const periodResolver = (service as any).subscriptionEntitlementService;
    periodResolver.resolveActiveSubscriptionEntitlement.mockResolvedValue({
      planId: 'trial-plan',
      periodType: 'trial',
      effectiveLimits: { channel_slots: 2 },
      planSnapshot: { allowedProviders: ['messenger'] },
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'trial-plan',
      allowedProviders: ['messenger'],
    });

    await expect(
      (service as any).assertProviderAllowed('tenant-1', 'messenger'),
    ).resolves.toBeUndefined();
    expect(
      (service as any).entitlementService.getTenantEntitlement,
    ).not.toHaveBeenCalled();
  });

  it('returns allowed providers from the frozen period snapshot without reading the plan row', async () => {
    const { service, repositories } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      subscriptionPlanId: null,
    });
    const periodResolver = (service as any).subscriptionEntitlementService;
    periodResolver.resolveActiveSubscriptionEntitlement.mockResolvedValue({
      planId: 'period-plan',
      periodType: 'paid',
      effectiveLimits: { channel_slots: 2 },
      planSnapshot: { allowedProviders: ['telegram', 'viber'] },
    });
    // Live plan row disagrees with the snapshot on purpose – snapshot wins.
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'period-plan',
      allowedProviders: ['messenger'],
    });

    await expect(
      (service as any).getTenantAllowedProviders('tenant-1'),
    ).resolves.toEqual(['telegram', 'viber']);
    expect(repositories.subscriptionPlan.findOne).not.toHaveBeenCalled();
  });

  it('propagates MissingActivePeriodError from getTenantAllowedProviders', async () => {
    const { service, repositories } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      subscriptionPlanId: null,
    });
    (
      service as any
    ).subscriptionEntitlementService.resolveActiveSubscriptionEntitlement.mockRejectedValue(
      new MissingActivePeriodError(
        'NO_ACTIVE_PAID_PERIOD',
        'no operational paid or trial period',
      ),
    );

    await expect(
      (service as any).getTenantAllowedProviders('tenant-1'),
    ).rejects.toBeInstanceOf(MissingActivePeriodError);
  });

  it('blocks channel creation with NO_ACTIVE_SUBSCRIPTION_PERIOD when no period exists', async () => {
    const { service, repositories } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customChannelLimit: null,
      subscriptionPlanId: null,
    });
    (
      service as any
    ).subscriptionEntitlementService.resolveActiveSubscriptionEntitlement.mockRejectedValue(
      new MissingActivePeriodError(
        'NO_ACTIVE_PAID_PERIOD',
        'no operational paid or trial period',
      ),
    );

    await expect(
      (service as any).assertProviderAllowed('tenant-1', 'telegram'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'NO_ACTIVE_SUBSCRIPTION_PERIOD',
      }),
    });
  });

  it('treats an empty snapshot provider list as unrestricted', async () => {
    const { service, repositories } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customChannelLimit: null,
      subscriptionPlanId: null,
    });
    (
      service as any
    ).subscriptionEntitlementService.resolveActiveSubscriptionEntitlement.mockResolvedValue(
      {
        planId: 'open-plan',
        periodType: 'paid',
        effectiveLimits: { channel_slots: 2 },
        planSnapshot: { allowedProviders: [] },
      },
    );

    await expect(
      (service as any).assertProviderAllowed('tenant-1', 'tiktok'),
    ).resolves.toBeUndefined();
  });

  it('blocks channel creation when the provider is not allowed by the plan', async () => {
    const { service, repositories } = createService({
      channelAdapterService: {
        validateConfig: jest.fn(async () => ({ valid: true, errors: [] })),
      },
    });
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customChannelLimit: null,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxChannels: 5,
      allowedProviders: ['messenger'],
    });
    repositories.tenantChannel.count.mockResolvedValue(0);

    await expect(
      service.createChannel('tenant-1', {
        channelType: 'telegram',
        channelName: 'Telegram',
        credentials: { botToken: '123456:test' },
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROVIDER_NOT_ALLOWED_IN_PLAN',
        channelType: 'telegram',
        allowedProviders: ['messenger'],
      }),
    });
    expect(repositories.tenantChannel.create).not.toHaveBeenCalled();
  });

  it('allows channel creation when the provider is allowed by the plan', async () => {
    process.env.WEBHOOK_PUBLIC_BASE_URL = 'https://hooks.example.com';
    process.env.JWT_SECRET = 'tenant-channel-test-secret';
    const { service, repositories } = createService({
      channelAdapterService: {
        validateConfig: jest.fn(async () => ({ valid: true, errors: [] })),
      },
      tenantChannel: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((value) => value),
        save: jest
          .fn()
          .mockImplementationOnce(async (value) => ({
            ...value,
            id: '0f0b3a6e-2f8d-4a9b-b7d6-3d5e5f6a7b8c',
          }))
          .mockImplementation(async (value) => value),
      },
    });
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customChannelLimit: null,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxChannels: 5,
      allowedProviders: ['telegram'],
    });

    const channel = await service.createChannel('tenant-1', {
      channelType: 'telegram',
      channelName: 'Telegram',
      credentials: { botToken: '123456:test' },
    });

    expect(channel.channelType).toBe('telegram');
    expect(repositories.tenantChannel.create).toHaveBeenCalled();
  });

  it('persists a channel before constructing the UUID webhook URL', async () => {
    process.env.WEBHOOK_PUBLIC_BASE_URL = 'https://hooks.example.com';
    process.env.JWT_SECRET = 'tenant-channel-test-secret';
    const firstChannelId = '9db7cb15-f4d4-4ac6-b87e-c21f84d32875';
    const { service, repositories } = createService({
      channelAdapterService: {
        validateConfig: jest.fn(async () => ({ valid: true, errors: [] })),
      },
      tenantChannel: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((value) => value),
        save: jest
          .fn()
          .mockImplementationOnce(async (value) => ({
            ...value,
            id: firstChannelId,
          }))
          .mockImplementationOnce(async (value) => value),
      },
    });
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customChannelLimit: null,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxChannels: 5,
    });

    const channel = await service.createChannel('tenant-1', {
      channelType: 'telegram',
      channelName: 'Merchant Main Channel',
      credentials: { botToken: '123456:test' },
    });

    expect(repositories.tenantChannel.save).toHaveBeenCalledTimes(3);
    expect(repositories.tenantChannel.save.mock.calls[0][0]).toMatchObject({
      webhookUrl: null,
      status: 'pending',
      webhookRegistrationStatus: 'pending',
    });
    expect(repositories.tenantChannel.save.mock.calls[1][0]).toMatchObject({
      id: firstChannelId,
      webhookUrl: `https://hooks.example.com/webhooks/telegram/${firstChannelId}`,
    });
    expect(repositories.tenantChannel.save.mock.calls[2][0]).toMatchObject({
      id: firstChannelId,
      webhookUrl: `https://hooks.example.com/webhooks/telegram/${firstChannelId}`,
      webhookRegistrationStatus: 'failed',
      connectionStatus: 'error',
    });
    expect(channel.webhookUrl).toBe(
      `https://hooks.example.com/webhooks/telegram/${firstChannelId}`,
    );
    expect(channel.webhookUrl).not.toContain('merchant-main-channel');
  });

  it('gives same-name channels distinct UUID webhook URLs', async () => {
    process.env.WEBHOOK_PUBLIC_BASE_URL = 'https://hooks.example.com';
    process.env.JWT_SECRET = 'tenant-channel-test-secret';
    const firstChannelId = '9db7cb15-f4d4-4ac6-b87e-c21f84d32875';
    const secondChannelId = '4078d080-fb4a-4c59-9f18-4c599ddcc9ac';
    const ids = [firstChannelId, secondChannelId];
    const { service, repositories } = createService({
      channelAdapterService: {
        validateConfig: jest.fn(async () => ({ valid: true, errors: [] })),
      },
      tenantChannel: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) =>
          value.id ? value : { ...value, id: ids.shift() },
        ),
      },
    });
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customChannelLimit: null,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxChannels: 5,
    });

    const first = await service.createChannel('tenant-1', {
      channelType: 'telegram',
      channelName: 'Main Channel',
      credentials: { botToken: '123456:test' },
    });
    const second = await service.createChannel('tenant-1', {
      channelType: 'telegram',
      channelName: 'Main Channel',
      credentials: { botToken: '123456:test' },
    });

    expect(first.webhookUrl).toBe(
      `https://hooks.example.com/webhooks/telegram/${firstChannelId}`,
    );
    expect(second.webhookUrl).toBe(
      `https://hooks.example.com/webhooks/telegram/${secondChannelId}`,
    );
  });

  it('does not change the webhook URL when a channel is renamed', async () => {
    process.env.WEBHOOK_PUBLIC_BASE_URL = 'https://hooks.example.com';
    process.env.JWT_SECRET = 'tenant-channel-test-secret';
    const channelId = '9db7cb15-f4d4-4ac6-b87e-c21f84d32875';
    const savedWebhookUrl = `https://hooks.example.com/webhooks/telegram/${channelId}`;
    const { service, repositories } = createService({
      channelAdapterService: {
        validateConfig: jest.fn(async () => ({ valid: true, errors: [] })),
      },
      tenantChannel: {
        count: jest.fn().mockResolvedValue(0),
        findOne: jest.fn().mockResolvedValue({
          id: channelId,
          tenantId: 'tenant-1',
          channelType: 'telegram',
          channelName: 'Old Name',
          configuration: { webhookUrl: savedWebhookUrl },
          credentials: {},
          credentialSchema: [],
          credentialStatus: 'missing_required',
          connectionStatus: 'pending_configuration',
          status: 'pending',
          webhookUrl: savedWebhookUrl,
        }),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => value),
      },
    });

    const updated = await service.updateChannel('tenant-1', channelId, {
      channelName: 'New Merchant Name',
    });

    expect(updated.webhookUrl).toBe(savedWebhookUrl);
    expect(repositories.tenantChannel.save).toHaveBeenCalledWith(
      expect.objectContaining({
        channelName: 'New Merchant Name',
        webhookUrl: savedWebhookUrl,
      }),
    );
  });

  it('gives two different tenant messenger channels the same shared webhook URL', async () => {
    process.env.WEBHOOK_PUBLIC_BASE_URL = 'https://hooks.example.com';
    process.env.JWT_SECRET = 'tenant-channel-test-secret';
    process.env.MESSENGER_PROVIDER_APP_ROUTING_ID = 'shared';
    const firstChannelId = '9db7cb15-f4d4-4ac6-b87e-c21f84d32875';
    const secondChannelId = '4078d080-fb4a-4c59-9f18-4c599ddcc9ac';
    const ids = [firstChannelId, secondChannelId];
    const { service, repositories } = createService({
      channelAdapterService: {
        validateConfig: jest.fn(async () => ({ valid: true, errors: [] })),
      },
      tenantChannel: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) =>
          value.id ? value : { ...value, id: ids.shift() },
        ),
      },
    });
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customChannelLimit: null,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxChannels: 5,
    });

    const first = await service.createChannel('tenant-1', {
      channelType: 'messenger',
      channelName: 'Tenant A Messenger',
      credentials: { pageId: 'page-a' },
    });
    const second = await service.createChannel('tenant-2', {
      channelType: 'messenger',
      channelName: 'Tenant B Messenger',
      credentials: { pageId: 'page-b' },
    });

    expect(first.webhookUrl).toBe(
      'https://hooks.example.com/webhooks/messenger/shared',
    );
    expect(second.webhookUrl).toBe(
      'https://hooks.example.com/webhooks/messenger/shared',
    );
    expect(first.webhookUrl).toBe(second.webhookUrl);
    delete process.env.MESSENGER_PROVIDER_APP_ROUTING_ID;
  });

  it('rejects retention selection for a channel owned by another tenant', async () => {
    const { service, repositories } = createService();
    repositories.tenantChannel.findOne.mockResolvedValue(null);

    await expect(
      service.setChannelRetentionSelection('tenant-1', 'channel-2', true),
    ).rejects.toThrow('Channel not found');
  });

  it('reactivates a capacity-disabled channel only within its tenant capacity', async () => {
    process.env.WEBHOOK_PUBLIC_BASE_URL = 'https://hooks.example.com';
    const channel = {
      id: 'channel-1',
      tenantId: 'tenant-1',
      channelType: 'telegram',
      channelName: 'Telegram',
      status: 'disabled',
      connectionStatus: 'disabled',
      disabledPreviousStatus: 'active',
      disabledPreviousConnectionStatus: 'ready',
      credentials: {},
      configuration: {},
      credentialSchema: [],
      webhookUrl: 'https://hooks.example.com/webhooks/telegram/channel-1',
    };
    const { service, repositories } = createService();
    repositories.tenantChannel.findOne.mockResolvedValue(channel);
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customChannelLimit: 2,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxChannels: 2,
    });
    repositories.tenantChannel.count.mockResolvedValue(0);

    await expect(
      service.reactivateChannel('tenant-1', 'channel-1'),
    ).resolves.toMatchObject({
      id: 'channel-1',
      tenantId: 'tenant-1',
      status: 'active',
      connectionStatus: 'ready',
      disabledAt: null,
      disabledReason: null,
    });
    expect(repositories.tenantChannel.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        status: 'active',
      }),
    );
  });

  it('rejects reactivation when the tenant capacity is already full', async () => {
    const channel = {
      id: 'channel-1',
      tenantId: 'tenant-1',
      channelType: 'telegram',
      channelName: 'Telegram',
      status: 'disabled',
      connectionStatus: 'disabled',
      disabledPreviousStatus: 'active',
      disabledPreviousConnectionStatus: 'ready',
      credentials: {},
      configuration: {},
      credentialSchema: [],
      webhookUrl: 'https://hooks.example.com/webhooks/telegram/channel-1',
    };
    const { service, repositories } = createService();
    repositories.tenantChannel.findOne.mockResolvedValue(channel);
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      customChannelLimit: 1,
      subscriptionPlanId: 'plan-1',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      maxChannels: 1,
    });
    repositories.tenantChannel.count.mockResolvedValue(1);

    await expect(
      service.reactivateChannel('tenant-1', 'channel-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CHANNELS_PLAN_LIMIT_REACHED',
        limit: 1,
        used: 1,
      }),
    });
    expect(repositories.tenantChannel.save).not.toHaveBeenCalled();
  });

  it('does not allow reactivation to bypass tenant ownership', async () => {
    const { service, repositories } = createService();
    repositories.tenantChannel.findOne.mockResolvedValue(null);

    await expect(
      service.reactivateChannel('tenant-1', 'channel-from-tenant-2'),
    ).rejects.toThrow('Channel not found');
  });

  it('expires channels at the exact boundary under a tenant lock and is idempotent', async () => {
    const expiry = yangonMonthEnd(new Date('2026-08-15T00:00:00.000Z'));
    const channels = [
      {
        id: 'base-channel',
        status: 'active',
        connectionStatus: 'ready',
        entitlementOrigin: 'base_plan',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        entitlementExpiresAt: null,
        retentionSelected: false,
        credentials: { encrypted: 'base-channel-secret' },
        configuration: { pageId: 'base-page' },
      },
      {
        id: 'top-up-channel',
        status: 'active',
        connectionStatus: 'ready',
        entitlementOrigin: 'top_up',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
        entitlementExpiresAt: expiry,
        retentionSelected: false,
        credentials: { encrypted: 'top-up-channel-secret' },
        configuration: { pageId: 'top-up-page' },
      },
    ];
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(channels),
    };
    const channelRepository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      save: jest.fn(async (value) => value),
    };
    const manager = { getRepository: jest.fn(() => channelRepository) };
    const transaction = jest.fn(
      (callback: (value: typeof manager) => unknown) =>
        Promise.resolve(callback(manager)),
    );
    const { service } = createService({
      tenantChannel: {
        count: jest.fn(),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => value),
        manager: { transaction },
      },
    });

    await expect(
      service.expireChannelCapacity(
        'tenant-1',
        1,
        new Date(expiry.getTime() - 1),
      ),
    ).resolves.toEqual({ retained: [], disabled: [] });
    expect(channels[1].status).toBe('active');

    await expect(
      service.expireChannelCapacity('tenant-1', 1, expiry),
    ).resolves.toEqual({
      retained: [],
      disabled: ['top-up-channel'],
    });
    expect(channels[1]).toMatchObject({
      status: 'disabled',
      connectionStatus: 'disabled',
      disabledReason: 'capacity_expired',
      disabledAt: expiry,
      disabledPreviousStatus: 'active',
      disabledPreviousConnectionStatus: 'ready',
    });
    expect(channels[1]).toMatchObject({
      credentials: { encrypted: 'top-up-channel-secret' },
      configuration: { pageId: 'top-up-page' },
    });
    expect(channelRepository.save).toHaveBeenCalledTimes(1);

    await expect(
      service.expireChannelCapacity('tenant-1', 1, expiry),
    ).resolves.toEqual({ retained: [], disabled: [] });
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(channelRepository.save).toHaveBeenCalledTimes(1);
    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
  });
});
