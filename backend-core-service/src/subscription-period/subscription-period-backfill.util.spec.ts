import type { Tenant } from '../tenant/entities/tenant.entity';
import type { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import type { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import type { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import {
  buildQuotaSnapshot,
  SUBSCRIPTION_PERIOD_STATUSES,
  SUBSCRIPTION_PERIOD_PAYMENT_STATUSES,
} from './subscription-period.types';
import {
  decideBackfillForTenant,
  type BackfillDecision,
} from './subscription-period-backfill.util';

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    tenantCode: 'TENANT-1',
    companyName: 'Test Co',
    status: 'active',
    subscriptionPlanId: 'plan-1',
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Tenant;
}

function makePlan(overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan {
  return {
    id: 'plan-1',
    name: 'Business Launch',
    monthlyPrice: 500000,
    durationDays: 30,
    messageQuotaMode: 'combined',
    messageLimit: 20000,
    inboundMessageLimit: null,
    outboundMessageLimit: null,
    apiLimit: 50000,
    allowedProviders: ['messenger', 'telegram'],
    maxCsrs: 5,
    maxChannels: 3,
    storageLimitGb: 1,
    features: {},
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SubscriptionPlan;
}

function makeEntitlement(
  overrides: Partial<TenantEntitlement> = {},
): TenantEntitlement {
  return {
    id: 'ent-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    state: 'paid_active',
    paidPeriodStartsAt: new Date('2026-08-01T00:00:00.000Z'),
    paidPeriodEndsAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  } as TenantEntitlement;
}

function makeBillingRecord(
  overrides: Partial<TenantBillingRecord> = {},
): TenantBillingRecord {
  return {
    id: 'billing-1',
    tenantId: 'tenant-1',
    subscriptionPlanId: 'plan-1',
    paymentStatus: 'paid',
    billingPeriodStart: new Date('2026-08-01'),
    billingPeriodEnd: new Date('2026-08-31'),
    ...overrides,
  } as TenantBillingRecord;
}

describe('subscription-period.types', () => {
  describe('buildQuotaSnapshot', () => {
    it('captures combined-mode terms as a deep copy', () => {
      const plan = makePlan();
      const snapshot = buildQuotaSnapshot(plan);

      expect(snapshot).toEqual({
        messageQuotaMode: 'combined',
        messageLimit: 20000,
        inboundMessageLimit: null,
        outboundMessageLimit: null,
        apiLimit: 50000,
        allowedProviders: ['messenger', 'telegram'],
        durationDays: 30,
        maxChannels: 3,
        storageLimitGb: 1,
        maxCsrs: 5,
        price: 500000,
      });

      // Later plan edits must not mutate the purchased snapshot.
      plan.messageLimit = 999999;
      plan.durationDays = 7;
      plan.allowedProviders.push('viber');
      expect(snapshot.messageLimit).toBe(20000);
      expect(snapshot.durationDays).toBe(30);
      expect(snapshot.allowedProviders).toEqual(['messenger', 'telegram']);
    });

    it('captures directional-mode terms', () => {
      const snapshot = buildQuotaSnapshot(
        makePlan({
          messageQuotaMode: 'directional',
          messageLimit: null,
          inboundMessageLimit: 16000,
          outboundMessageLimit: 4000,
        }),
      );
      expect(snapshot.messageQuotaMode).toBe('directional');
      expect(snapshot.inboundMessageLimit).toBe(16000);
      expect(snapshot.outboundMessageLimit).toBe(4000);
      expect(snapshot.messageLimit).toBeNull();
    });
  });

  it('exposes the legal period status and payment status enums', () => {
    expect(SUBSCRIPTION_PERIOD_STATUSES).toEqual([
      'upcoming',
      'active',
      'expired',
      'cancelled',
    ]);
    expect(SUBSCRIPTION_PERIOD_PAYMENT_STATUSES).toEqual([
      'pending',
      'paid',
      'failed',
      'refunded',
      'not_required',
    ]);
  });
});

describe('decideBackfillForTenant', () => {
  it('skips a tenant with no entitlement', () => {
    const decision = decideBackfillForTenant({
      tenant: makeTenant(),
      entitlement: null,
      plan: makePlan(),
      paidBillingRecords: [],
      hasExistingPeriod: false,
    });
    expect(decision).toMatchObject({
      action: 'skip',
      reason: 'no_entitlement',
    });
  });

  it('skips a trial-only tenant (not paid_active)', () => {
    const decision = decideBackfillForTenant({
      tenant: makeTenant(),
      entitlement: makeEntitlement({ state: 'trial_active' }),
      plan: makePlan(),
      paidBillingRecords: [],
      hasExistingPeriod: false,
    });
    expect(decision).toMatchObject({
      action: 'skip',
      reason: 'not_paid_active',
    });
  });

  it('skips a tenant that already has a period row', () => {
    const decision = decideBackfillForTenant({
      tenant: makeTenant(),
      entitlement: makeEntitlement(),
      plan: makePlan(),
      paidBillingRecords: [],
      hasExistingPeriod: true,
    });
    expect(decision).toMatchObject({
      action: 'skip',
      reason: 'already_has_period',
    });
  });

  it('skips a paid entitlement whose plan cannot be resolved', () => {
    const decision = decideBackfillForTenant({
      tenant: makeTenant(),
      entitlement: makeEntitlement(),
      plan: null,
      paidBillingRecords: [],
      hasExistingPeriod: false,
    });
    expect(decision).toMatchObject({
      action: 'skip',
      reason: 'missing_plan',
    });
  });

  it('uses the matching paid billing record as the first precedence', () => {
    const decision = decideBackfillForTenant({
      tenant: makeTenant(),
      // Real data stores entitlement end from the billing record's inclusive
      // calendar end, so the fixture mirrors that relationship.
      entitlement: makeEntitlement({
        paidPeriodStartsAt: new Date('2026-08-01T00:00:00.000Z'),
        paidPeriodEndsAt: new Date('2026-08-31T00:00:00.000Z'),
      }),
      plan: makePlan(),
      paidBillingRecords: [
        makeBillingRecord({
          id: 'billing-match',
          billingPeriodStart: new Date('2026-08-01'),
          billingPeriodEnd: new Date('2026-08-31'),
        }),
        makeBillingRecord({
          id: 'billing-unrelated',
          billingPeriodStart: new Date('2026-06-01'),
          billingPeriodEnd: new Date('2026-06-30'),
        }),
      ],
      hasExistingPeriod: false,
    });
    expect(decision.action).toBe('create');
    if (decision.action !== 'create') return;
    expect(decision.sourcePrecedence).toBe('billing_record');
    expect(decision.billingRecordId).toBe('billing-match');
    expect(decision.matchedBillingRecord).toBe(true);
    // Backfill carries legacy source dates as-is; new periods created by the
    // coordinator (Phase 3+) use half-open [start, end) intervals.
    expect(decision.periodEndAt.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('falls back to entitlement dates when no billing record matches', () => {
    const decision = decideBackfillForTenant({
      tenant: makeTenant(),
      entitlement: makeEntitlement(),
      plan: makePlan(),
      paidBillingRecords: [makeBillingRecord({ paymentStatus: 'unpaid' })],
      hasExistingPeriod: false,
    });
    expect(decision.action).toBe('create');
    if (decision.action !== 'create') return;
    expect(decision.sourcePrecedence).toBe('entitlement');
    expect(decision.billingRecordId).toBeNull();
    expect(decision.periodStartAt.toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
    expect(decision.periodEndAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('falls back to tenant subscription dates as the last precedence', () => {
    const decision = decideBackfillForTenant({
      tenant: makeTenant({
        subscriptionStartDate: new Date('2026-08-15'),
        subscriptionEndDate: new Date('2026-09-14'),
      }),
      entitlement: makeEntitlement({
        paidPeriodStartsAt: null,
        paidPeriodEndsAt: null,
      }),
      plan: makePlan(),
      paidBillingRecords: [],
      hasExistingPeriod: false,
    });
    expect(decision.action).toBe('create');
    if (decision.action !== 'create') return;
    expect(decision.sourcePrecedence).toBe('tenant_plan');
    expect(decision.periodStartAt.toISOString()).toBe(
      '2026-08-15T00:00:00.000Z',
    );
    expect(decision.periodEndAt.toISOString()).toBe('2026-09-14T00:00:00.000Z');
  });

  it('snapshots the plan quota terms at backfill time', () => {
    const decision = decideBackfillForTenant({
      tenant: makeTenant(),
      entitlement: makeEntitlement(),
      plan: makePlan({ messageLimit: 7777, durationDays: 14 }),
      paidBillingRecords: [],
      hasExistingPeriod: false,
    });
    expect(decision.action).toBe('create');
    if (decision.action !== 'create') return;
    expect(decision.quotaSnapshot.messageLimit).toBe(7777);
    expect(decision.quotaSnapshot.durationDays).toBe(14);
    expect(decision.durationDays).toBe(14);
  });
});

// Compile-time safety net: every skip reason returned by the decision is a
// legal BackfillDecision shape. This also documents the invariant surface.
type SkipReasonUnion = Extract<BackfillDecision, { action: 'skip' }>['reason'];
const _skipReasons: SkipReasonUnion[] = [
  'no_entitlement',
  'not_paid_active',
  'already_has_period',
  'missing_plan',
];

it('documents the legal skip reasons', () => {
  expect(_skipReasons).toEqual([
    'no_entitlement',
    'not_paid_active',
    'already_has_period',
    'missing_plan',
  ]);
});
