import { BadRequestException } from '@nestjs/common';

import {
  buildTrialPeriodEntity,
  isTrialExpired,
  isTrialOperational,
  validateTrialPlanConfiguration,
  SubscriptionPeriodService,
} from './subscription-period.service';
import {
  assembleUpgradeEffectiveLimits,
  type SubscriptionQuotaSnapshot,
  type SubscriptionUpgradeCarryover,
} from './subscription-period.types';

/** A valid trial plan per the complete one-time contract. */
const trialPlan = {
  id: 'plan-trial',
  name: 'Guided Pilot (Trial)',
  planType: 'trial',
  durationDays: 30,
  requestable: false,
  renewable: false,
  topUpAllowed: false,
  autoApprove: true,
  messageQuotaMode: 'combined',
  messageLimit: null,
  inboundMessageLimit: 1000,
  outboundMessageLimit: 500,
  apiLimit: 20000,
  allowedProviders: ['messenger', 'telegram'],
  maxChannels: 2,
  storageLimitGb: 1,
  maxCsrs: 5,
  monthlyPrice: 0,
} as any;

describe('validateTrialPlanConfiguration (task 1.6)', () => {
  it('accepts a fully valid trial plan', () => {
    expect(validateTrialPlanConfiguration(trialPlan)).toEqual([]);
  });

  it('rejects a non-trial plan type', () => {
    expect(
      validateTrialPlanConfiguration({ ...trialPlan, planType: 'business' }),
    ).toContain('planType must be trial for a trial plan');
  });

  it('rejects a missing or non-positive duration', () => {
    expect(
      validateTrialPlanConfiguration({ ...trialPlan, durationDays: 0 }),
    ).toContain('durationDays must be a positive integer for trial plans');
    expect(
      validateTrialPlanConfiguration({ ...trialPlan, durationDays: 2.5 }),
    ).toContain('durationDays must be a positive integer for trial plans');
  });

  it('rejects requestable, renewable, or top-up-eligible trial plans', () => {
    const violations = validateTrialPlanConfiguration({
      ...trialPlan,
      requestable: true,
      renewable: true,
      topUpAllowed: true,
    });
    expect(violations).toContain('requestable must be false for trial plans');
    expect(violations).toContain('renewable must be false for trial plans');
    expect(violations).toContain('topUpAllowed must be false for trial plans');
  });

  it('rejects a trial plan that is not auto-approved', () => {
    expect(
      validateTrialPlanConfiguration({ ...trialPlan, autoApprove: false }),
    ).toContain('autoApprove must be true for trial plans');
  });
});

describe('buildTrialPeriodEntity (task 1.5)', () => {
  const start = new Date('2026-08-10T02:00:00.000Z');

  it('builds an auto-approved, not_required, active trial row with exact bounds', () => {
    const entity = buildTrialPeriodEntity({
      tenantId: 'tenant-1',
      plan: trialPlan,
      periodStartAt: start,
      durationDays: 30,
    });

    expect(entity).toMatchObject({
      tenantId: 'tenant-1',
      planId: 'plan-trial',
      periodType: 'trial',
      periodStatus: 'active',
      paymentStatus: 'not_required',
      adminActivationStatus: 'approved',
      billingRecordId: null,
      monthStartAt: null,
      monthEndAt: null,
      startOption: null,
      durationDays: 30,
    });
    // Exact elapsed-day bounds — no Yangon calendar month involved.
    expect(entity.periodStartAt.getTime()).toBe(start.getTime());
    expect(entity.periodEndAt.getTime()).toBe(
      new Date('2026-09-09T02:00:00.000Z').getTime(),
    );
    // The frozen quota snapshot comes from the trial plan.
    expect(entity.quotaSnapshot.inboundMessageLimit).toBe(1000);
    expect(entity.quotaSnapshot.maxChannels).toBe(2);
  });

  it('rejects a plan that violates the trial contract', () => {
    expect(() =>
      buildTrialPeriodEntity({
        tenantId: 'tenant-1',
        plan: { ...trialPlan, requestable: true },
        periodStartAt: start,
        durationDays: 30,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a non-positive duration', () => {
    expect(() =>
      buildTrialPeriodEntity({
        tenantId: 'tenant-1',
        plan: trialPlan,
        periodStartAt: start,
        durationDays: 0,
      }),
    ).toThrow(BadRequestException);
  });
});

describe('trial operational validity and exact expiry (task 1.7)', () => {
  const startAt = new Date('2026-08-10T02:00:00.000Z');
  const endAt = new Date('2026-09-09T02:00:00.000Z');
  const basePeriod = {
    periodType: 'trial',
    periodStatus: 'active',
    paymentStatus: 'not_required',
    adminActivationStatus: 'approved',
    periodStartAt: startAt,
    periodEndAt: endAt,
  } as any;

  it('is operational inside the half-open window', () => {
    expect(
      isTrialOperational({
        period: basePeriod,
        now: new Date('2026-08-15T00:00:00.000Z'),
      }),
    ).toBe(true);
  });

  it('is not operational before start', () => {
    expect(
      isTrialOperational({
        period: basePeriod,
        now: new Date('2026-08-09T23:59:59.000Z'),
      }),
    ).toBe(false);
  });

  it('is not operational at or after the exact end (no grace)', () => {
    expect(
      isTrialOperational({
        period: basePeriod,
        now: endAt,
      }),
    ).toBe(false);
    expect(
      isTrialOperational({
        period: basePeriod,
        now: new Date('2026-09-10T00:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('is not operational for a paid period, non-active status, pending payment, or unapproved admin state', () => {
    expect(
      isTrialOperational({
        period: { ...basePeriod, periodType: 'paid' },
        now: new Date('2026-08-15T00:00:00.000Z'),
      }),
    ).toBe(false);
    expect(
      isTrialOperational({
        period: { ...basePeriod, periodStatus: 'upcoming' },
        now: new Date('2026-08-15T00:00:00.000Z'),
      }),
    ).toBe(false);
    expect(
      isTrialOperational({
        period: { ...basePeriod, paymentStatus: 'pending' },
        now: new Date('2026-08-15T00:00:00.000Z'),
      }),
    ).toBe(false);
    expect(
      isTrialOperational({
        period: { ...basePeriod, adminActivationStatus: 'pending' },
        now: new Date('2026-08-15T00:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('reports exact expiry at the boundary', () => {
    expect(
      isTrialExpired({
        period: basePeriod,
        now: new Date('2026-09-08T00:00:00.000Z'),
      }),
    ).toBe(false);
    expect(isTrialExpired({ period: basePeriod, now: endAt })).toBe(true);
    expect(
      isTrialExpired({
        period: basePeriod,
        now: new Date('2026-09-10T00:00:00.000Z'),
      }),
    ).toBe(true);
  });
});

describe('assembleUpgradeEffectiveLimits (task 1.7)', () => {
  const upgradedSnapshot: SubscriptionQuotaSnapshot = {
    messageQuotaMode: 'directional',
    messageLimit: null,
    inboundMessageLimit: 20000,
    outboundMessageLimit: 8000,
    apiLimit: 100000,
    allowedProviders: ['messenger', 'telegram', 'viber'],
    durationDays: 30,
    maxChannels: 4,
    storageLimitGb: 10,
    maxCsrs: 10,
    price: 1500000,
  };

  const carryover: SubscriptionUpgradeCarryover = {
    inboundMessages: 5000,
    outboundMessages: 2000,
    apiRequests: 30000,
  };

  it('adds eligible carryover to the upgraded limits', () => {
    const result = assembleUpgradeEffectiveLimits({
      upgradedSnapshot,
      carryover,
      activeTopUpComponentTotals: {},
    });
    expect(result.inboundMessageLimit).toBe(25000);
    expect(result.outboundMessageLimit).toBe(10000);
    expect(result.apiLimit).toBe(130000);
  });

  it('keeps unlimited (null) dimensions unlimited regardless of carryover', () => {
    const result = assembleUpgradeEffectiveLimits({
      upgradedSnapshot: { ...upgradedSnapshot, apiLimit: null },
      carryover: { ...carryover, apiRequests: 99999 },
      activeTopUpComponentTotals: {},
    });
    expect(result.apiLimit).toBeNull();
  });

  it('keeps storage, channels, and users from snapshot + top-ups only (no carryover)', () => {
    const result = assembleUpgradeEffectiveLimits({
      upgradedSnapshot,
      carryover,
      activeTopUpComponentTotals: {
        channel_slots: 2,
        storage_gb: 5,
        team_members: 3,
      },
    });
    expect(result.maxChannels).toBe(6);
    expect(result.storageLimitGb).toBe(15);
    expect(result.maxCsrs).toBe(13);
  });

  it('stacks message/API top-ups on top of the upgraded base + carryover', () => {
    const result = assembleUpgradeEffectiveLimits({
      upgradedSnapshot,
      carryover,
      activeTopUpComponentTotals: {
        inbound_messages: 1000,
        outbound_messages: 500,
        api_requests: 2000,
      },
    });
    expect(result.inboundMessageLimit).toBe(26000);
    expect(result.outboundMessageLimit).toBe(10500);
    expect(result.apiLimit).toBe(132000);
  });

  it('does not mutate the input snapshot', () => {
    const snapshotCopy = { ...upgradedSnapshot };
    assembleUpgradeEffectiveLimits({
      upgradedSnapshot,
      carryover,
      activeTopUpComponentTotals: { channel_slots: 2 },
    });
    expect(upgradedSnapshot).toEqual(snapshotCopy);
  });
});

describe('SubscriptionPeriodService.createTrialPeriod (task 1.5)', () => {
  function createService() {
    const saved: any[] = [];
    const manager = {
      getRepository: jest.fn(() => repository),
      transaction: jest.fn((callback: any) => callback(manager)),
    };
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
      getCount: jest.fn().mockResolvedValue(0),
      getRawOne: jest.fn().mockResolvedValue({ next: '1' }),
    };
    const repository = {
      manager,
      create: jest.fn((data: any) => data),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      save: jest.fn(async (data: any) => {
        saved.push(data);
        return { ...data, id: `period-${saved.length}` };
      }),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    const dataSource = { transaction: manager.transaction } as any;
    const planRepository = {
      find: jest.fn(async () => [trialPlan]),
    } as any;
    const service = new SubscriptionPeriodService(dataSource, planRepository);
    return { service, manager, repository, queryBuilder, saved };
  }

  const start = new Date('2026-08-10T02:00:00.000Z');

  it('creates exactly one auto-approved trial period with a created event', async () => {
    const { service, saved } = createService();

    const period = await service.createTrialPeriod({
      tenantId: 'tenant-1',
      plan: trialPlan,
      periodStartAt: start,
      durationDays: 30,
    });

    expect(period).toMatchObject({
      periodType: 'trial',
      periodStatus: 'active',
      paymentStatus: 'not_required',
      adminActivationStatus: 'approved',
      billingRecordId: null,
      sequenceNumber: 1,
    });
    // The trial row + the trial_period_created event are both persisted.
    expect(saved.length).toBe(2);
    const event = saved[1];
    expect(event.eventType).toBe('trial_period_created');
    expect(event.newStatus).toBe('active');
    expect(saved[0].periodEndAt.getTime()).toBe(
      new Date('2026-09-09T02:00:00.000Z').getTime(),
    );
  });

  it('is idempotent — returns the existing active trial on retry', async () => {
    const { service, repository } = createService();
    const existing = {
      id: 'trial-existing',
      tenantId: 'tenant-1',
      periodType: 'trial',
      periodStatus: 'active',
      paymentStatus: 'not_required',
      adminActivationStatus: 'approved',
      periodStartAt: start,
      periodEndAt: new Date('2026-09-09T02:00:00.000Z'),
    };
    repository.findOne.mockResolvedValueOnce(existing);

    const result = await service.createTrialPeriod({
      tenantId: 'tenant-1',
      plan: trialPlan,
      periodStartAt: start,
      durationDays: 30,
    });

    expect(result.id).toBe('trial-existing');
    // No new row or event is written.
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('SubscriptionPeriodService trial provisioning (tasks 2.1–2.3)', () => {
  const start = new Date('2026-08-10T02:00:00.000Z');

  function createService(opts: { trialPlans?: any[] } = {}) {
    const saved: any[] = [];
    const manager = {
      getRepository: jest.fn(() => repository),
      transaction: jest.fn((callback: any) => callback(manager)),
    };
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
      getCount: jest.fn().mockResolvedValue(0),
      getRawOne: jest.fn().mockResolvedValue({ next: '1' }),
    };
    const repository = {
      manager,
      create: jest.fn((data: any) => data),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      save: jest.fn(async (data: any) => {
        saved.push(data);
        return { ...data, id: `period-${saved.length}` };
      }),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    const dataSource = { transaction: manager.transaction } as any;
    const planRepository = {
      find: jest.fn(async () => opts.trialPlans ?? [trialPlan]),
    } as any;
    const service = new SubscriptionPeriodService(dataSource, planRepository);
    return { service, manager, repository, planRepository, saved };
  }

  it('resolveActiveTrialPlan returns the single valid trial plan', async () => {
    const { service } = createService();
    const plan = await service.resolveActiveTrialPlan();
    expect(plan.id).toBe('plan-trial');
  });

  it('resolveActiveTrialPlan rejects a missing trial configuration', async () => {
    const { service } = createService({ trialPlans: [] });
    await expect(service.resolveActiveTrialPlan()).rejects.toThrow(
      'No active trial plan is configured',
    );
  });

  it('resolveActiveTrialPlan rejects multiple active trial plans', async () => {
    const { service } = createService({
      trialPlans: [trialPlan, { ...trialPlan, id: 'plan-trial-2' }],
    });
    await expect(service.resolveActiveTrialPlan()).rejects.toThrow(
      'Multiple active trial plans are configured',
    );
  });

  it('ensureTrialPeriodForTenant provisions one auto-approved trial from the resolved plan', async () => {
    const { service, saved } = createService();
    const period = await service.ensureTrialPeriodForTenant(
      'tenant-1',
      { type: 'tenant_user', id: 'owner@demo.local' },
      { now: start },
    );
    expect(period).toMatchObject({
      tenantId: 'tenant-1',
      planId: 'plan-trial',
      periodType: 'trial',
      periodStatus: 'active',
      paymentStatus: 'not_required',
      adminActivationStatus: 'approved',
      billingRecordId: null,
    });
    // Trial row + trial_period_created event.
    expect(saved.length).toBe(2);
    expect(saved[0].durationDays).toBe(30);
  });

  it('ensureTrialPeriodForTenant is idempotent under retries', async () => {
    const { service, repository } = createService();
    const existing = {
      id: 'trial-existing',
      tenantId: 'tenant-1',
      periodType: 'trial',
      periodStatus: 'active',
    };
    repository.findOne.mockResolvedValue(existing);

    const first = await service.ensureTrialPeriodForTenant(
      'tenant-1',
      {},
      { now: start },
    );
    const second = await service.ensureTrialPeriodForTenant(
      'tenant-1',
      {},
      { now: start },
    );
    expect(first.id).toBe('trial-existing');
    expect(second.id).toBe('trial-existing');
    // No new row or event is written on either retry.
    expect(repository.save).not.toHaveBeenCalled();
  });
});
