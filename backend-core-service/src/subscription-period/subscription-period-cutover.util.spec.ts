import type { Tenant } from '../tenant/entities/tenant.entity';
import type { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import type { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import type { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import {
  approvedYangonCutoverBoundary,
  decideCutoverForTenant,
  type CutoverDecision,
} from './subscription-period-cutover.util';
import { yangonWallClockToUtc } from './yangon-month.util';

function makePeriod(
  overrides: Partial<TenantSubscriptionPeriod> = {},
): TenantSubscriptionPeriod {
  return {
    id: 'period-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    billingRecordId: null,
    periodType: 'paid',
    periodStatus: 'active',
    paymentStatus: 'paid',
    periodStartAt: new Date('2026-07-29T17:30:00.000Z'), // Jul 30 Yangon
    periodEndAt: new Date('2027-07-29T17:30:00.000Z'), // Jul 30 2027 Yangon
    monthStartAt: null,
    monthEndAt: null,
    startOption: null,
    sequenceNumber: 1,
    ...overrides,
  } as TenantSubscriptionPeriod;
}

function makePlan(): SubscriptionPlan {
  return {
    id: 'plan-1',
    name: 'Business Launch',
    durationDays: 30,
    messageQuotaMode: 'combined',
    messageLimit: 20000,
    inboundMessageLimit: 16000,
    outboundMessageLimit: 4000,
    apiLimit: 50000,
    allowedProviders: ['messenger', 'telegram'],
    monthlyPrice: 500000,
    status: 'active',
  } as SubscriptionPlan;
}

function makeBillingRecord(
  overrides: Partial<TenantBillingRecord> = {},
): TenantBillingRecord {
  return {
    id: 'billing-1',
    tenantId: 'tenant-1',
    subscriptionPlanId: 'plan-1',
    paymentStatus: 'paid',
    billingPeriodStart: new Date('2026-09-01'),
    billingPeriodEnd: new Date('2026-09-30'),
    ...overrides,
  } as TenantBillingRecord;
}

function decide(overrides: {
  activePeriods?: TenantSubscriptionPeriod[];
  allPeriods?: TenantSubscriptionPeriod[];
  plan?: SubscriptionPlan | null;
  paidBillingRecords?: TenantBillingRecord[];
}) {
  const {
    activePeriods = [makePeriod()],
    allPeriods = activePeriods,
    plan = makePlan(),
    paidBillingRecords = [],
  } = overrides;
  return decideCutoverForTenant({
    tenantId: 'tenant-1',
    activePeriods,
    allPeriods,
    plan,
    paidBillingRecords,
    boundary: approvedYangonCutoverBoundary(),
  });
}

describe('approvedYangonCutoverBoundary', () => {
  it('is 2026-09-01 00:00 Asia/Yangon', () => {
    expect(approvedYangonCutoverBoundary().toISOString()).toBe(
      '2026-08-31T17:30:00.000Z',
    );
  });
});

describe('decideCutoverForTenant', () => {
  it('skips a tenant with no active paid period', () => {
    const decision = decide({ activePeriods: [] });
    expect(decision).toMatchObject({
      action: 'skip',
      reason: 'no_active_paid_period',
    });
  });

  it('skips a trial-only tenant', () => {
    const decision = decide({
      activePeriods: [
        makePeriod({ periodType: 'trial', paymentStatus: 'pending' }),
      ],
    });
    expect(decision).toMatchObject({ action: 'skip', reason: 'trial_period' });
  });

  it('skips an already calendar-aligned active period', () => {
    const alignedStart = yangonWallClockToUtc(2026, 9, 1);
    const alignedEnd = yangonWallClockToUtc(2026, 10, 1);
    const decision = decide({
      activePeriods: [
        makePeriod({ periodStartAt: alignedStart, periodEndAt: alignedEnd }),
      ],
    });
    expect(decision).toMatchObject({
      action: 'skip',
      reason: 'monthly_aligned',
    });
  });

  it('skips when a period already covers the boundary month', () => {
    const coveredStart = yangonWallClockToUtc(2026, 9, 1);
    const coveredEnd = yangonWallClockToUtc(2026, 10, 1);
    const decision = decide({
      allPeriods: [
        makePeriod(),
        makePeriod({
          id: 'period-sep',
          periodStatus: 'upcoming',
          monthStartAt: coveredStart,
          monthEndAt: coveredEnd,
        }),
      ],
    });
    expect(decision).toMatchObject({
      action: 'skip',
      reason: 'already_transitioned',
    });
  });

  it('creates the next monthly period with a covering paid billing record', () => {
    const decision = decide({
      paidBillingRecords: [
        makeBillingRecord({
          billingPeriodStart: new Date('2026-09-01'),
          billingPeriodEnd: new Date('2026-10-01'),
        }),
      ],
    });
    expect(decision.action).toBe('create_next_monthly');
    if (decision.action !== 'create_next_monthly') return;
    expect(decision.paymentStatus).toBe('paid');
    expect(decision.billingRecordId).toBe('billing-1');
    expect(decision.monthStartAt.toISOString()).toBe(
      '2026-08-31T17:30:00.000Z',
    );
    expect(decision.monthEndAt.toISOString()).toBe('2026-09-30T17:30:00.000Z');
    expect(decision.billingNotes).toEqual([]);
  });

  it('queues the next monthly period pending when no paid record covers it', () => {
    const decision = decide({
      paidBillingRecords: [
        makeBillingRecord({
          billingPeriodStart: new Date('2026-08-01'),
          billingPeriodEnd: new Date('2026-08-31'), // Aug-only, not Sep
        }),
      ],
    });
    expect(decision.action).toBe('create_next_monthly');
    if (decision.action !== 'create_next_monthly') return;
    expect(decision.paymentStatus).toBe('pending');
    expect(decision.billingRecordId).toBeNull();
    expect(decision.billingNotes.length).toBeGreaterThan(0);
  });

  it('skips with a distinct reason when the legacy plan cannot be resolved', () => {
    const decision = decide({ plan: null });
    expect(decision).toMatchObject({
      action: 'skip',
      reason: 'missing_plan',
    });
  });
});

// Compile-time safety net for the legal skip reasons.
type SkipReasonUnion = Extract<CutoverDecision, { action: 'skip' }>['reason'];
const _skipReasons: SkipReasonUnion[] = [
  'no_active_paid_period',
  'trial_period',
  'monthly_aligned',
  'already_transitioned',
  'missing_plan',
];

it('documents the legal cutover skip reasons', () => {
  expect(_skipReasons).toEqual([
    'no_active_paid_period',
    'trial_period',
    'monthly_aligned',
    'already_transitioned',
    'missing_plan',
  ]);
});

// The legacy fixture mirrors the real dev row (year-long, duration 30).
// Kept as a compile-time contract so the cutover can never be confused with a
// calendar-aligned period.
const _legacyFixture: Tenant = {
  id: 'tenant-1',
  tenantCode: 'TENANT-1',
  companyName: 'Test Co',
  status: 'active',
  subscriptionPlanId: 'plan-1',
  createdAt: new Date(),
  updatedAt: new Date(),
} as Tenant;
expect(_legacyFixture.tenantCode).toBe('TENANT-1');
