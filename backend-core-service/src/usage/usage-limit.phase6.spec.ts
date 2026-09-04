/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { HttpStatus } from '@nestjs/common';
import { UsageLimitService } from './usage-limit.service';

type TestRepository = {
  createQueryBuilder: jest.Mock;
};

type TestManager = {
  getRepository: jest.Mock<TestRepository>;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function makeService(input: {
  entitlement: Record<string, unknown>;
  used?: number;
}) {
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([
      {
        id: 'period-1',
        monthStartAt: new Date('2026-09-01T00:00:00.000Z'),
        monthEndAt: new Date('2026-10-01T00:00:00.000Z'),
        periodStartAt: new Date('2026-09-01T00:00:00.000Z'),
        periodEndAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    ]),
    getRawOne: jest.fn().mockResolvedValue({ total: String(input.used ?? 0) }),
  };
  const periodRepository: TestRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const usageRepositoryForManager: TestRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const manager: TestManager = {
    getRepository: jest.fn((entity: { name?: string }) =>
      entity.name === 'TenantSubscriptionPeriod'
        ? periodRepository
        : usageRepositoryForManager,
    ),
    findOne: jest.fn(async () => ({ id: 'tenant-1', state: 'paid_active' })),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn((_entity: unknown, value: unknown) => value),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const usageRepository = {
    manager: {
      transaction: jest.fn(
        async (callback: (manager: TestManager) => unknown) =>
          callback(manager),
      ),
    },
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const entitlementService = {
    resolveActiveSubscriptionEntitlement: jest
      .fn()
      .mockResolvedValue(input.entitlement),
    resolveActivePeriodId: jest.fn().mockResolvedValue('period-1'),
  };
  const service = new UsageLimitService(
    usageRepository as any,
    entitlementService as any,
  );
  return { service, manager, queryBuilder, entitlementService };
}

const baseEntitlement = {
  activePeriodId: 'period-1',
  periodStartAt: new Date('2026-09-01T00:00:00.000Z'),
  periodEndAt: new Date('2026-10-01T00:00:00.000Z'),
  effectiveLimits: {
    inbound_messages: 2,
    outbound_messages: 1,
    api_requests: 2,
    team_members: 0,
  },
};

describe('Phase 6 period-scoped usage enforcement', () => {
  beforeEach(() => {
    process.env.SUBSCRIPTION_PERIOD_ENFORCEMENT_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.SUBSCRIPTION_PERIOD_ENFORCEMENT_ENABLED;
  });

  it('enforces inbound and outbound limits independently', async () => {
    const inbound = makeService({ entitlement: baseEntitlement, used: 2 });
    await expect(
      inbound.service.trackProviderMessage('tenant-1', {
        direction: 'inbound',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: expect.objectContaining({
        code: 'INBOUND_MESSAGE_QUOTA_EXHAUSTED',
        dimension: 'inbound_messages',
        activePeriodId: 'period-1',
      }),
    });

    const outbound = makeService({ entitlement: baseEntitlement, used: 0 });
    await expect(
      outbound.service.trackProviderMessage('tenant-1', {
        direction: 'outbound',
      }),
    ).resolves.toMatchObject({ direction: 'outbound' });
    expect(outbound.queryBuilder.andWhere).toHaveBeenCalledWith(
      'usage.direction = :direction',
      { direction: 'outbound' },
    );
  });

  it('enforces API limits and records the active period identity', async () => {
    const h = makeService({ entitlement: baseEntitlement, used: 2 });
    await expect(h.service.trackApiRequest('tenant-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_USAGE_LIMIT_REACHED',
        dimension: 'api_requests',
        activePeriodId: 'period-1',
      }),
    });

    const accepted = makeService({ entitlement: baseEntitlement, used: 0 });
    await expect(
      accepted.service.trackApiRequest('tenant-1'),
    ).resolves.toMatchObject({
      usageType: 'api_request',
      subscriptionPeriodId: 'period-1',
    });
  });

  it('keeps unlimited dimensions unlimited and zero dimensions blocked', async () => {
    const unlimited = makeService({
      entitlement: {
        ...baseEntitlement,
        effectiveLimits: {
          ...baseEntitlement.effectiveLimits,
          inbound_messages: null,
          team_members: 0,
        },
      },
      used: 999,
    });
    await expect(
      unlimited.service.trackProviderMessage('tenant-1', {
        direction: 'inbound',
      }),
    ).resolves.toBeDefined();

    const blocked = makeService({
      entitlement: {
        ...baseEntitlement,
        effectiveLimits: {
          ...baseEntitlement.effectiveLimits,
          inbound_messages: 0,
          team_members: 0,
        },
      },
      used: 0,
    });
    await expect(
      blocked.service.trackProviderMessage('tenant-1', {
        direction: 'inbound',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INBOUND_MESSAGE_QUOTA_EXHAUSTED',
        limit: 0,
      }),
    });
  });
});
