/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- Repository doubles keep this unit suite focused on quota accounting. */
import { HttpStatus } from '@nestjs/common';
import {
  billableUsagePolicy,
  usageLimitPolicy,
  UsageLimitService,
} from './usage-limit.service';

type UsageQueryBuilder = {
  select: jest.Mock<UsageQueryBuilder, [select?: string, alias?: string]>;
  where: jest.Mock<UsageQueryBuilder, [sql?: string, params?: unknown]>;
  andWhere: jest.Mock<UsageQueryBuilder, [sql?: string, params?: unknown]>;
  getRawOne: jest.Mock<Promise<{ total: string }>, []>;
};

type MockRepository = {
  create: jest.Mock<Record<string, unknown>, [value?: unknown]>;
  save: jest.Mock<Record<string, unknown>, [value?: unknown]>;
  findOne: jest.Mock<Promise<unknown>, [options?: unknown]>;
  createQueryBuilder: jest.Mock<UsageQueryBuilder, [alias?: string]>;
  manager: { transaction: jest.Mock } | undefined;
};

function createRepository(
  overrides: Partial<MockRepository> = {},
): MockRepository {
  return {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: undefined,
    ...overrides,
  };
}

function createService(used = 0) {
  const usageRepository = createRepository();
  const entitlementService = {
    resolveActivePeriodId: jest.fn(
      (): Promise<string | null> => Promise.resolve(null),
    ),
    resolveActiveSubscriptionEntitlement: jest.fn().mockResolvedValue({
      tenantId: 'tenant-1',
      activePeriodId: 'period-1',
      planId: 'plan-entitled',
      periodStartAt: new Date('2026-09-01T00:00:00.000Z'),
      periodEndAt: new Date('2026-10-01T00:00:00.000Z'),
      effectiveLimits: {
        inbound_messages: 10000,
        outbound_messages: 5000,
        api_requests: 20000,
        channel_slots: 3,
        storage_gb: 1,
        team_members: 0,
      },
      baseLimits: {
        inbound_messages: 10000,
        outbound_messages: 5000,
        api_requests: 20000,
        channel_slots: 3,
        storage_gb: 1,
      },
      activeTopUpComponentTotals: {
        inbound_messages: 0,
        outbound_messages: 0,
        api_requests: 0,
        channel_slots: 0,
        storage_gb: 0,
      },
    }),
  };

  const queryBuilder: UsageQueryBuilder = {
    select: jest.fn(() => queryBuilder),
    where: jest.fn(() => queryBuilder),
    andWhere: jest.fn(() => queryBuilder),
    getRawOne: jest.fn(() => Promise.resolve({ total: String(used) })),
  };
  usageRepository.createQueryBuilder.mockReturnValue(queryBuilder);

  const transactionManager = {
    getRepository: jest.fn((entity: { name?: string }) => {
      if (entity.name === 'TenantSubscriptionPeriod') {
        return {
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([
              {
                id: 'period-1',
                monthStartAt: new Date('2026-07-01T00:00:00.000Z'),
                monthEndAt: new Date('2026-08-01T00:00:00.000Z'),
                periodStartAt: new Date('2026-07-01T00:00:00.000Z'),
                periodEndAt: new Date('2026-08-01T00:00:00.000Z'),
              },
            ]),
          })),
        };
      }
      return {
        createQueryBuilder: jest.fn(() => queryBuilder),
      };
    }),
    findOne: jest.fn(() => Promise.resolve(null)),
    createQueryBuilder: jest.fn(() => queryBuilder),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn((_entity: unknown, value: unknown) => ({
      id: 'usage-1',
      ...(value as Record<string, unknown>),
    })),
  };
  usageRepository.manager = {
    transaction: jest.fn(async (callback: (manager: unknown) => unknown) =>
      callback(transactionManager),
    ),
  };

  const service = new UsageLimitService(
    usageRepository as any,
    entitlementService as any,
  );
  return {
    service,
    usageRepository,
    entitlementService,
    queryBuilder,
    transactionManager,
  };
}

describe('UsageLimitService', () => {
  it('records tenant API usage when the monthly plan limit has capacity', async () => {
    const { service, transactionManager } = createService(4);

    await expect(
      service.trackApiRequest('tenant-1', {
        requestMethod: 'GET',
        requestPath: '/api/v1/tenant/csrs',
        sourceRequestId: 'req-123',
      }),
    ).resolves.toMatchObject({
      tenantId: 'tenant-1',
      usageType: 'api_request',
      direction: 'request',
      quantity: 1,
      requestMethod: 'GET',
      requestPath: '/api/v1/tenant/csrs',
      sourceRequestId: 'req-123',
    });
    expect(transactionManager.save).toHaveBeenCalled();
  });

  it('rejects tenant API usage when the period API limit is exhausted', async () => {
    const { service, transactionManager, entitlementService } =
      createService(5);
    entitlementService.resolveActiveSubscriptionEntitlement.mockResolvedValue({
      activePeriodId: 'period-1',
      periodStartAt: new Date('2026-09-01T00:00:00.000Z'),
      periodEndAt: new Date('2026-10-01T00:00:00.000Z'),
      effectiveLimits: {
        inbound_messages: 10000,
        outbound_messages: 5000,
        api_requests: 5,
        team_members: 0,
      },
    });

    await expect(service.trackApiRequest('tenant-1')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: expect.objectContaining({
        code: 'API_USAGE_LIMIT_REACHED',
        limit: 5,
        used: 5,
        policy: usageLimitPolicy,
      }),
    });
    expect(transactionManager.save).not.toHaveBeenCalled();
  });

  it('tracks provider message usage by tenant, channel, provider, and direction', async () => {
    const { service, transactionManager } = createService(2);

    await expect(
      service.trackProviderMessage('tenant-1', {
        channelId: 'channel-1',
        provider: 'telegram',
        direction: 'outbound',
        source: 'csr_message',
        sourceMessageId: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toMatchObject({
      tenantId: 'tenant-1',
      channelId: 'channel-1',
      provider: 'telegram',
      usageType: 'provider_message',
      direction: 'outbound',
      quantity: 1,
      sourceMessageId: '11111111-1111-4111-8111-111111111111',
    });
    expect(transactionManager.save).toHaveBeenCalled();
  });

  it('checks and records usage inside one tenant-locked transaction', async () => {
    const { service, usageRepository, transactionManager } = createService(4);

    await service.trackApiRequest('tenant-1', {
      requestMethod: 'POST',
      requestPath: '/api/v1/messages',
    });

    expect(usageRepository.manager?.transaction).toHaveBeenCalled();
    expect(transactionManager.getRepository).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'TenantSubscriptionPeriod' }),
    );
    expect(transactionManager.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'TenantUsageEvent' }),
      expect.objectContaining({
        tenantId: 'tenant-1',
        usageType: 'api_request',
        sourceRequestId: expect.any(String),
        billingPeriodStart: expect.any(Date),
        billingPeriodEnd: expect.any(Date),
      }),
    );
    expect(transactionManager.getRepository).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'TenantSubscriptionPeriod' }),
    );
  });

  it('stores and queries immutable Yangon calendar billing periods', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-18T16:56:00.000Z'));
    const { service, transactionManager, queryBuilder, entitlementService } =
      createService(0);

    try {
      await service.trackProviderMessage('tenant-1', {
        direction: 'inbound',
        sourceEventId: '11111111-1111-4111-8111-111111111111',
        sourceMessageId: '22222222-2222-4222-8222-222222222222',
      });

      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TenantUsageEvent' }),
        expect.objectContaining({
          billingPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
          billingPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
        }),
      );
      await service.getUsageSummary(
        'tenant-1',
        new Date('2026-08-01T00:00:00.000Z'),
      );
      expect(
        entitlementService.resolveActiveSubscriptionEntitlement,
      ).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('marks a queued disabled-channel send non-billable and excludes it from period totals', async () => {
    const { service, usageRepository, queryBuilder } = createService(0);
    const usage = {
      id: 'usage-1',
      tenantId: 'tenant-1',
      sourceMessageId: 'message-1',
      usageType: 'provider_message',
      quantity: 1,
      metadata: { billable: true },
    };
    usageRepository.findOne.mockResolvedValue(usage);
    (usageRepository.save as jest.Mock).mockResolvedValue(usage);

    await expect(
      service.markProviderMessageNonBillable('tenant-1', 'message-1'),
    ).resolves.toMatchObject({ updated: true, usageEventId: 'usage-1' });
    expect(usage).toMatchObject({
      quantity: 0,
      metadata: expect.objectContaining({
        billable: false,
        nonBillableReason: 'channel_disabled_before_provider_dispatch',
      }),
    });

    await service.sumUsageByPeriod('tenant-1', 'provider_message', 'period-1');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      "COALESCE(usage.metadata ->> 'billable', 'true') <> 'false'",
    );
  });

  it('documents outbound failed and delivery-unknown billing as one accepted persisted send', () => {
    expect(billableUsagePolicy.provider_message_outbound).toContain(
      'accepted and persisted',
    );
    expect(billableUsagePolicy.provider_message_outbound).toContain('failed');
    expect(billableUsagePolicy.provider_message_outbound).toContain(
      'delivery_unknown',
    );
    expect(billableUsagePolicy.provider_message_callback).toContain(
      'non-billable',
    );
  });

  it('reports usage limits from the active period with explicit no-overage policy', async () => {
    const { service, entitlementService } = createService(2);
    entitlementService.resolveActiveSubscriptionEntitlement.mockResolvedValue({
      activePeriodId: 'period-1',
      planId: 'plan-entitled',
      periodStartAt: new Date('2026-09-01T00:00:00.000Z'),
      periodEndAt: new Date('2026-10-01T00:00:00.000Z'),
      baseLimits: {
        inbound_messages: 30,
        outbound_messages: 30,
        api_requests: 15,
      },
      activeTopUpComponentTotals: {
        inbound_messages: 0,
        outbound_messages: 0,
        api_requests: 0,
      },
      effectiveLimits: {
        inbound_messages: 30,
        outbound_messages: 30,
        api_requests: 15,
        team_members: 0,
      },
    });

    await expect(service.getUsageSummary('tenant-1')).resolves.toMatchObject({
      tenantId: 'tenant-1',
      planId: 'plan-entitled',
      policy: usageLimitPolicy,
      apiRequests: expect.objectContaining({ limit: 15 }),
      inboundMessages: expect.objectContaining({ limit: 30 }),
      outboundMessages: expect.objectContaining({ limit: 30 }),
    });
  });

  describe('task 5.7 — period identity dual-write', () => {
    it('writes the resolved active period id onto newly accepted usage', async () => {
      const { service, transactionManager, entitlementService } =
        createService(0);

      await service.trackProviderMessage('tenant-1', {
        direction: 'outbound',
        source: 'csr_message',
        sourceMessageId: '11111111-1111-4111-8111-111111111111',
      });

      expect(
        entitlementService.resolveActiveSubscriptionEntitlement,
      ).toHaveBeenCalled();
      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TenantUsageEvent' }),
        expect.objectContaining({ subscriptionPeriodId: 'period-1' }),
      );
    });

    it('always writes the active period id for paid usage', async () => {
      const { service, transactionManager, entitlementService } =
        createService(0);

      await service.trackApiRequest('tenant-1');

      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TenantUsageEvent' }),
        expect.objectContaining({ subscriptionPeriodId: 'period-1' }),
      );
    });

    it('stamps the upgrade revision id when the active period is upgraded (task 4.5)', async () => {
      const { service, transactionManager, entitlementService } =
        createService(0);
      entitlementService.resolveActiveSubscriptionEntitlement.mockResolvedValue(
        {
          activePeriodId: 'period-1',
          upgradeRevisionId: 'revision-1',
          periodStartAt: new Date('2026-09-01T00:00:00.000Z'),
          periodEndAt: new Date('2026-10-01T00:00:00.000Z'),
          effectiveLimits: {
            inbound_messages: 20000,
            outbound_messages: 10000,
            api_requests: 40000,
            channel_slots: 5,
            storage_gb: 2,
            team_members: 10,
          },
        },
      );

      await service.trackApiRequest('tenant-1');

      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TenantUsageEvent' }),
        expect.objectContaining({
          subscriptionPeriodId: 'period-1',
          upgradeRevisionId: 'revision-1',
        }),
      );
    });

    it('preserves legacy billing dates while dual-writing period identity', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-12T10:00:00.000Z'));
      const { service, transactionManager } = createService(0);

      try {
        await service.trackApiRequest('tenant-1');
        expect(transactionManager.save).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'TenantUsageEvent' }),
          expect.objectContaining({
            subscriptionPeriodId: 'period-1',
            billingPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
            billingPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('task 5.10 — permanent period-scoped summary', () => {
    const entitlement = {
      tenantId: 'tenant-1',
      activePeriodId: 'period-1',
      planId: 'plan-1',
      periodStartAt: new Date('2026-09-01T00:00:00.000Z'),
      periodEndAt: new Date('2026-10-01T00:00:00.000Z'),
      baseLimits: {
        inbound_messages: 10000,
        outbound_messages: 5000,
        api_requests: 20000,
        channel_slots: 3,
        storage_gb: 1,
      },
      activeTopUpComponentTotals: {
        inbound_messages: 0,
        outbound_messages: 0,
        api_requests: 0,
        channel_slots: 0,
        storage_gb: 0,
      },
      effectiveLimits: {
        inbound_messages: 10000,
        outbound_messages: 5000,
        api_requests: 20000,
        channel_slots: 3,
        storage_gb: 1,
        team_members: 0,
      },
      quotaState: {},
    };

    afterEach(() => {
      delete process.env.SUBSCRIPTION_PERIOD_ENFORCEMENT_ENABLED;
    });

    it('uses the period-scoped summary permanently regardless of the old flag', async () => {
      const { service, entitlementService } = createService(2);
      entitlementService.resolveActiveSubscriptionEntitlement.mockResolvedValue(
        entitlement,
      );

      await expect(service.getUsageSummary('tenant-1')).resolves.toMatchObject({
        scope: 'period_scoped',
        activePeriodId: 'period-1',
        effectiveLimits: entitlement.effectiveLimits,
      });
    });

    it('returns a period-scoped summary with effective limits when the flag is on', async () => {
      process.env.SUBSCRIPTION_PERIOD_ENFORCEMENT_ENABLED = 'true';
      const { service, entitlementService } = createService(3);
      entitlementService.resolveActiveSubscriptionEntitlement.mockResolvedValue(
        entitlement,
      );

      const summary = await service.getUsageSummary('tenant-1');

      expect(summary).toMatchObject({
        scope: 'period_scoped',
        activePeriodId: 'period-1',
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-10-01T00:00:00.000Z',
        effectiveLimits: entitlement.effectiveLimits,
        apiRequests: expect.objectContaining({ limit: 20000 }),
        inboundMessages: expect.objectContaining({ limit: 10000 }),
        outboundMessages: expect.objectContaining({ limit: 5000 }),
      });
      expect(summary).toMatchObject({
        inboundMessages: expect.objectContaining({ used: 3 }),
      });
    });
  });
});
