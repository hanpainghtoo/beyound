/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- Coarse repository doubles keep this suite focused on the conversion finalization orchestration. */
import { NotFoundException } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';
import { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';
import { TenantSubscriptionPeriodUpgradeRevision } from '../subscription-period/entities/tenant-subscription-period-upgrade-revision.entity';
import { SubscriptionPeriodEvent } from '../subscription-period/entities/subscription-period-event.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';

function emptyRepo() {
  return {
    count: jest.fn(async () => 0),
    create: jest.fn((value) => value),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    remove: jest.fn(async (value) => value),
    save: jest.fn(async (value) => ({ id: value.id || 'saved-id', ...value })),
    createQueryBuilder: jest.fn(),
  };
}

function makeChainableQueryBuilder(getRawOne = { total: '0' }) {
  const qb: Record<string, any> = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => []),
    getOne: jest.fn(async () => null),
    getRawOne: jest.fn(async () => getRawOne),
    getRawMany: jest.fn(async () => []),
  };
  return qb;
}

const TRIAL_START = new Date('2020-01-01T00:00:00.000Z');
const TRIAL_END = new Date('2099-01-01T00:00:00.000Z');

function makeTrialPeriod(
  overrides: Record<string, any> = {},
): Record<string, any> {
  return {
    id: 'trial-1',
    tenantId: 'tenant-1',
    planId: 'plan-trial',
    periodType: 'trial',
    periodStatus: 'active',
    paymentStatus: 'not_required',
    adminActivationStatus: 'approved',
    periodStartAt: TRIAL_START,
    periodEndAt: TRIAL_END,
    monthStartAt: null,
    monthEndAt: null,
    convertedToPeriodId: null,
    convertedFromPeriodId: null,
    quotaSnapshot: {
      messageQuotaMode: 'directional',
      messageLimit: null,
      inboundMessageLimit: 1000,
      outboundMessageLimit: 500,
      apiLimit: 2000,
      allowedProviders: ['messenger'],
      durationDays: 30,
      maxChannels: 2,
      storageLimitGb: 1,
      maxCsrs: 5,
      price: 0,
    },
    metadata: {},
    ...overrides,
  };
}

function makeRevision(
  overrides: Record<string, any> = {},
): Record<string, any> {
  return {
    id: 'rev-1',
    subscriptionPeriodId: 'trial-1',
    tenantId: 'tenant-1',
    billingRecordId: 'billing-1',
    previousPlanId: 'plan-trial',
    upgradedPlanId: 'plan-biz',
    previousPlanSnapshot: {},
    upgradedPlanSnapshot: {},
    upgradeStatus: 'pending_approval',
    upgradeRequestedAt: new Date('2026-08-17T00:00:00.000Z'),
    upgradeEffectiveAt: null,
    carryover: {
      inboundMessages: null,
      outboundMessages: null,
      apiRequests: null,
    },
    approvedAt: null,
    approvedBy: null,
    rejectionReason: null,
    metadata: { kind: 'trial_conversion' },
    ...overrides,
  };
}

interface Harness {
  service: PlatformAdminService;
  periodRows: Record<string, any>[];
  revisionRows: Record<string, any>[];
  eventRows: Record<string, any>[];
  lockTenantPeriods: jest.Mock;
  saveCalls: jest.Mock;
}

function createHarness(
  options: {
    trialPeriod?: Record<string, any>;
    revision?: Record<string, any> | null;
    adminApproveResult?: Record<string, any>;
  } = {},
): Harness {
  const periodRows: Record<string, any>[] = options.trialPeriod
    ? [options.trialPeriod]
    : [];
  const revisionRows: Record<string, any>[] = options.revision
    ? [options.revision]
    : [];
  const eventRows: Record<string, any>[] = [];

  const match = (row: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  const periodRepository = {
    ...emptyRepo(),
    findOne: jest.fn(async (opts?: { where?: Record<string, any> }) => {
      const where = opts?.where ?? {};
      return periodRows.find((r) => match(r, where)) ?? null;
    }),
    save: jest.fn(async (value: Record<string, any>) => {
      const existing = periodRows.find((r) => r.id === value.id);
      if (existing) Object.assign(existing, value);
      else periodRows.push({ ...value });
      return value;
    }),
  };
  const revisionRepository = {
    ...emptyRepo(),
    findOne: jest.fn(async (opts?: { where?: Record<string, any> }) => {
      const where = opts?.where ?? {};
      return revisionRows.find((r) => match(r, where)) ?? null;
    }),
    save: jest.fn(async (value: Record<string, any>) => {
      const existing = revisionRows.find((r) => r.id === value.id);
      if (existing) Object.assign(existing, value);
      else revisionRows.push({ ...value });
      return value;
    }),
  };
  const eventRepository = {
    ...emptyRepo(),
    findOne: jest.fn(async (opts?: { where?: Record<string, any> }) => {
      const where = opts?.where ?? {};
      return eventRows.find((r) => match(r, where)) ?? null;
    }),
    save: jest.fn(async (value: Record<string, any>) => {
      eventRows.push(value);
      return value;
    }),
  };
  const usageRepository = {
    ...emptyRepo(),
    createQueryBuilder: jest.fn(() =>
      makeChainableQueryBuilder({ total: '0' }),
    ),
  };

  const getRepository = jest.fn((entity: { name?: string }) => {
    switch (entity.name) {
      case 'TenantSubscriptionPeriod':
        return periodRepository;
      case 'TenantSubscriptionPeriodUpgradeRevision':
        return revisionRepository;
      case 'SubscriptionPeriodEvent':
        return eventRepository;
      case 'TenantUsageEvent':
        return usageRepository;
      default:
        return emptyRepo();
    }
  });

  const transactionManager = {
    getRepository,
    findOne: jest.fn(async () => null),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn(async (_entity: unknown, value: unknown) => value),
  };

  const tenantBillingRecordRepository: Record<string, any> = {
    ...emptyRepo(),
    findOne: jest.fn(async () => null),
    manager: {
      transaction: jest.fn(async (callback: (m: unknown) => unknown) =>
        callback(transactionManager),
      ),
    },
  };

  const subscriptionPeriodService = {
    adminApprovePeriod: jest.fn(async () => ({
      period: {
        id: 'paid-1',
        tenantId: 'tenant-1',
        planId: 'plan-biz',
        periodType: 'paid',
        periodStatus: 'active',
        paymentStatus: 'paid',
        adminActivationStatus: 'approved',
        convertedFromPeriodId: 'trial-1',
        convertedToPeriodId: null,
        billingRecordId: 'billing-1',
        monthStartAt: new Date('2026-08-01T00:00:00.000Z'),
        monthEndAt: new Date('2026-09-01T00:00:00.000Z'),
        quotaSnapshot: {},
        ...(options.adminApproveResult ?? {}),
      },
      operational: true,
    })),
    lockTenantPeriods: jest.fn(async () => []),
  };

  const entitlementService = {
    activatePaidPeriod: jest.fn(async () => ({})),
  };

  // Minimal constructor args for the many repository dependencies.
  const repoArgs = Array.from({ length: 17 }, () => emptyRepo());
  const service = new PlatformAdminService(
    repoArgs[0] as any, // tenant
    repoArgs[1] as any, // subscriptionPlan
    repoArgs[2] as any, // platformAdmin
    repoArgs[3] as any, // tenantUser
    repoArgs[4] as any, // tenantAnalytics
    repoArgs[5] as any, // tenantChannel
    repoArgs[6] as any, // conversation
    repoArgs[7] as any, // order
    repoArgs[8] as any, // product
    repoArgs[9] as any, // tenantRateLimit
    repoArgs[10] as any, // platformSetting
    repoArgs[11] as any, // tenantUsage
    tenantBillingRecordRepository as any,
    repoArgs[12] as any, // subscriptionPeriod
    repoArgs[13] as any, // tenantEntitlement
    repoArgs[14] as any, // lead
    {} as any, // notificationService
    entitlementService as any,
    {} as any, // authService
    subscriptionPeriodService as any,
    {} as any, // mediaLibraryService
  );

  return {
    service,
    periodRows,
    revisionRows,
    eventRows,
    lockTenantPeriods: subscriptionPeriodService.lockTenantPeriods,
    saveCalls: tenantBillingRecordRepository.manager.transaction,
  };
}

describe('PlatformAdminService — trial conversion finalization (Plan 14 Phase 4)', () => {
  it('closes the trial, re-points the revision, and stores carryover on activation (task 4.16)', async () => {
    const h = createHarness({
      trialPeriod: makeTrialPeriod(),
      revision: makeRevision(),
    });

    await h.service.adminActivatePeriod(
      'tenant-1',
      'paid-1',
      'admin-1',
      'approve',
    );

    // The revision is re-pointed from the trial to the paid period and approved.
    const revision = h.revisionRows[0];
    expect(revision.subscriptionPeriodId).toBe('paid-1');
    expect(revision.upgradeStatus).toBe('approved');
    expect(revision.approvedBy).toBe('admin-1');
    // Trial quota was unused, so full remaining quota is carried over.
    expect(revision.carryover).toEqual({
      inboundMessages: 1000,
      outboundMessages: 500,
      apiRequests: 2000,
    });

    // The trial is closed and linked to the paid period.
    const trial = h.periodRows.find((r) => r.id === 'trial-1')!;
    expect(trial.periodStatus).toBe('expired');
    expect(trial.convertedToPeriodId).toBe('paid-1');

    // The right events were recorded.
    const eventTypes = h.eventRows.map((e) => e.eventType);
    expect(eventTypes).toContain('trial_conversion_approved');
    expect(eventTypes).toContain('trial_period_closed_on_conversion');
    expect(eventTypes).toContain('upgrade_effective_applied');
  });

  it('is idempotent when the conversion revision is already approved', async () => {
    const h = createHarness({
      trialPeriod: makeTrialPeriod(),
      revision: makeRevision({ upgradeStatus: 'approved' }),
    });

    await expect(
      h.service.adminActivatePeriod('tenant-1', 'paid-1', 'admin-1', 'approve'),
    ).resolves.toBeDefined();

    // The trial is left untouched (already closed in the earlier run).
    const trial = h.periodRows.find((r) => r.id === 'trial-1')!;
    expect(trial.periodStatus).toBe('active');
    expect(h.eventRows).toHaveLength(0);
  });

  it('marks the revision stale when the trial has already expired (task 4.19)', async () => {
    const h = createHarness({
      trialPeriod: makeTrialPeriod({
        periodEndAt: new Date('2020-02-01T00:00:00.000Z'),
      }),
      revision: makeRevision(),
    });

    await h.service.adminActivatePeriod(
      'tenant-1',
      'paid-1',
      'admin-1',
      'approve',
    );

    const revision = h.revisionRows[0];
    expect(revision.upgradeStatus).toBe('stale');
    // The trial is left in its terminal state (not resurrected).
    const trial = h.periodRows.find((r) => r.id === 'trial-1')!;
    expect(trial.periodStatus).toBe('active');
    expect(h.eventRows.map((e) => e.eventType)).toContain(
      'trial_conversion_stale',
    );
  });

  it('throws when the linked trial period is missing', async () => {
    const h = createHarness({
      trialPeriod: undefined,
      revision: makeRevision(),
    });

    await expect(
      h.service.adminActivatePeriod('tenant-1', 'paid-1', 'admin-1', 'approve'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PlatformAdminService — approveUpgradeRevision stale handling (Plan 14 7.36)', () => {
  const paidPeriod = (overrides: Record<string, any> = {}) =>
    makeTrialPeriod({
      id: 'paid-1',
      planId: 'plan-biz',
      periodType: 'paid',
      paymentStatus: 'paid',
      adminActivationStatus: 'approved',
      monthStartAt: new Date('2026-08-01T00:00:00.000Z'),
      // monthEndAt in the past → approval lands outside the upgrade window
      monthEndAt: new Date('2020-08-20T00:00:00.000Z'),
      ...overrides,
    });

  it('persists the stale status and event when approved after the period ended (7.36)', async () => {
    const h = createHarness({
      trialPeriod: paidPeriod(),
      revision: makeRevision({
        id: 'rev-upgrade',
        subscriptionPeriodId: 'paid-1',
        metadata: { kind: 'upgrade' },
      }),
    });

    const result = await h.service.approveUpgradeRevision(
      'tenant-1',
      'paid-1',
      'rev-upgrade',
      'admin-1',
      undefined,
    );

    // The stale state is returned AND persisted. Regression: the old
    // implementation threw after saving, rolling the write back, so the
    // revision stayed pending_approval forever.
    expect(result.upgradeStatus).toBe('stale');
    expect(h.revisionRows[0].upgradeStatus).toBe('stale');
    expect(h.eventRows.map((e) => e.eventType)).toContain('upgrade_stale');
    // The period is not reactivated or extended.
    expect(h.periodRows[0].periodStatus).toBe('active');
    expect(h.periodRows[0].monthEndAt).toEqual(
      new Date('2020-08-20T00:00:00.000Z'),
    );
  });

  it('returns the approved revision idempotently on a retry', async () => {
    const h = createHarness({
      trialPeriod: paidPeriod(),
      revision: makeRevision({
        id: 'rev-upgrade',
        subscriptionPeriodId: 'paid-1',
        upgradeStatus: 'approved',
        metadata: { kind: 'upgrade' },
      }),
    });

    const result = await h.service.approveUpgradeRevision(
      'tenant-1',
      'paid-1',
      'rev-upgrade',
      'admin-1',
      undefined,
    );

    expect(result.upgradeStatus).toBe('approved');
    expect(h.eventRows).toHaveLength(0);
  });
});
