/* eslint-disable @typescript-eslint/no-unsafe-argument -- Repository doubles keep this unit suite focused on resolver behavior. */
import { MissingActivePeriodError } from './subscription-entitlement.types';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

type Row = Record<string, any>;

const NOW = new Date('2026-09-15T00:00:00.000Z');

function makeSnapshot(overrides: Row = {}): Row {
  return {
    messageQuotaMode: 'combined',
    messageLimit: null,
    inboundMessageLimit: 10000,
    outboundMessageLimit: 5000,
    apiLimit: 20000,
    allowedProviders: ['messenger'],
    durationDays: 30,
    maxChannels: 3,
    storageLimitGb: 1,
    maxCsrs: 5,
    price: 500000,
    ...overrides,
  };
}

function makePeriod(overrides: Row = {}): Row {
  return {
    id: 'period-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    billingRecordId: null,
    periodType: 'paid',
    periodStatus: 'active',
    paymentStatus: 'paid',
    adminActivationStatus: 'approved',
    periodStartAt: new Date('2026-09-01T00:00:00.000Z'),
    periodEndAt: new Date('2026-10-01T00:00:00.000Z'),
    monthStartAt: new Date('2026-09-01T00:00:00.000Z'),
    monthEndAt: new Date('2026-10-01T00:00:00.000Z'),
    activatedAt: new Date('2026-09-01T00:00:00.000Z'),
    startOption: 'current_month',
    sequenceNumber: 1,
    quotaSnapshot: makeSnapshot(),
    metadata: {},
    ...overrides,
  };
}

function makePlan(overrides: Row = {}): Row {
  return {
    id: 'plan-1',
    name: 'Business Launch',
    monthlyPrice: 500000,
    durationDays: 30,
    messageQuotaMode: 'combined',
    messageLimit: null,
    inboundMessageLimit: 10000,
    outboundMessageLimit: 5000,
    apiLimit: 20000,
    allowedProviders: ['messenger'],
    maxCsrs: 5,
    maxChannels: 3,
    storageLimitGb: 1,
    features: {},
    status: 'active',
    ...overrides,
  };
}

function makePurchase(overrides: Row = {}): Row {
  return {
    id: 'purchase-1',
    tenantId: 'tenant-1',
    subscriptionPeriodId: 'period-1',
    productId: 'product-1',
    billingRecordId: null,
    purchasePrice: 50000,
    currency: 'MMK',
    paymentStatus: 'paid',
    purchaseStatus: 'active',
    effectiveAt: new Date('2026-09-02T00:00:00.000Z'),
    expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    idempotencyKey: null,
    metadata: {},
    ...overrides,
  };
}

function makeComponent(overrides: Row = {}): Row {
  return {
    id: 'comp-1',
    purchaseId: 'purchase-1',
    componentType: 'inbound_messages',
    quantity: 2000,
    unit: 'messages',
    expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    componentStatus: 'active',
    ...overrides,
  };
}

function createHarness() {
  const periods: Row[] = [];
  const plans: Row[] = [];
  const purchases: Row[] = [];
  const components: Row[] = [];
  const revisions: Row[] = [];

  const rowsFor = (entityName: string): Row[] => {
    if (entityName === 'TenantSubscriptionPeriod') return periods;
    if (entityName === 'SubscriptionPlan') return plans;
    if (entityName === 'TenantSubscriptionAddOnPurchase') return purchases;
    if (entityName === 'TenantSubscriptionAddOnComponent') return components;
    if (entityName === 'TenantSubscriptionPeriodUpgradeRevision')
      return revisions;
    return [];
  };

  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => {
      const findOperator = value as { _value?: unknown[] } | null;
      if (
        value &&
        typeof value === 'object' &&
        Array.isArray(findOperator?._value)
      ) {
        return findOperator._value.includes(row[key]);
      }
      return row[key] === value;
    });

  type FindOptions = { where?: Record<string, unknown> };

  const repository = (entityName: string) => ({
    find: jest.fn((opts?: FindOptions) => {
      const where = opts?.where ?? {};
      return rowsFor(entityName).filter((row) => matches(row, where));
    }),
    findOne: jest.fn((opts?: FindOptions) => {
      const where = opts?.where ?? {};
      return rowsFor(entityName).find((row) => matches(row, where)) ?? null;
    }),
  });

  const service = new SubscriptionEntitlementService(
    repository('TenantSubscriptionPeriod') as any,
    repository('SubscriptionPlan') as any,
    repository('TenantSubscriptionAddOnPurchase') as any,
    repository('TenantSubscriptionAddOnComponent') as any,
    repository('TenantSubscriptionPeriodUpgradeRevision') as any,
  );

  return { service, periods, plans, purchases, components, revisions };
}

describe('SubscriptionEntitlementService (Phase 5)', () => {
  describe('task 5.11 — base and top-up aggregation', () => {
    it('returns base limits with zero top-ups for a base-only period', async () => {
      const h = createHarness();
      h.periods.push(makePeriod());

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );

      expect(result.activePeriodId).toBe('period-1');
      expect(result.effectiveLimits).toEqual({
        inbound_messages: 10000,
        outbound_messages: 5000,
        api_requests: 20000,
        channel_slots: 3,
        storage_gb: 1,
        team_members: 5,
      });
      expect(result.activeTopUpComponentTotals).toEqual({
        inbound_messages: 0,
        outbound_messages: 0,
        api_requests: 0,
        channel_slots: 0,
        storage_gb: 0,
        team_members: 0,
      });
    });

    it('adds one active bundle to every matching dimension', async () => {
      const h = createHarness();
      h.periods.push(makePeriod());
      h.plans.push(makePlan());
      h.purchases.push(makePurchase());
      h.components.push(
        makeComponent({
          componentType: 'inbound_messages',
          quantity: 2000,
        }),
        makeComponent({
          id: 'comp-2',
          componentType: 'outbound_messages',
          quantity: 1000,
        }),
        makeComponent({
          id: 'comp-3',
          componentType: 'api_requests',
          quantity: 5000,
        }),
      );

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      expect(result.effectiveLimits.inbound_messages).toBe(12000);
      expect(result.effectiveLimits.outbound_messages).toBe(6000);
      expect(result.effectiveLimits.api_requests).toBe(25000);
      expect(result.activeTopUpComponentTotals.inbound_messages).toBe(2000);
    });

    it('stacks repeated bundle purchases additively', async () => {
      const h = createHarness();
      h.periods.push(makePeriod());
      h.purchases.push(makePurchase(), makePurchase({ id: 'purchase-2' }));
      h.components.push(
        makeComponent({ quantity: 2000 }),
        makeComponent({
          id: 'comp-2',
          purchaseId: 'purchase-2',
          quantity: 2000,
        }),
      );

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      expect(result.effectiveLimits.inbound_messages).toBe(14000);
      expect(result.activeTopUpComponentTotals.inbound_messages).toBe(4000);
    });

    it('excludes expired, failed-payment, cancelled, and pending purchases', async () => {
      const h = createHarness();
      h.periods.push(makePeriod());
      h.purchases.push(
        makePurchase(),
        makePurchase({
          id: 'purchase-expired',
          expiresAt: new Date('2026-09-10T00:00:00.000Z'),
        }),
        makePurchase({ id: 'purchase-failed', paymentStatus: 'failed' }),
        makePurchase({ id: 'purchase-cancelled', purchaseStatus: 'cancelled' }),
        makePurchase({ id: 'purchase-pending', purchaseStatus: 'pending' }),
      );
      h.components.push(
        makeComponent({ quantity: 2000 }),
        makeComponent({
          id: 'comp-expired',
          purchaseId: 'purchase-expired',
          quantity: 5000,
        }),
        makeComponent({
          id: 'comp-failed',
          purchaseId: 'purchase-failed',
          quantity: 5000,
        }),
        makeComponent({
          id: 'comp-cancelled',
          purchaseId: 'purchase-cancelled',
          quantity: 5000,
        }),
        makeComponent({
          id: 'comp-pending',
          purchaseId: 'purchase-pending',
          quantity: 5000,
        }),
      );

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      expect(result.effectiveLimits.inbound_messages).toBe(12000);
      expect(result.activeTopUpComponentTotals.inbound_messages).toBe(2000);
    });

    it('excludes an active purchase whose components are expired', async () => {
      const h = createHarness();
      h.periods.push(makePeriod());
      h.purchases.push(makePurchase());
      h.components.push(
        makeComponent({
          expiresAt: new Date('2026-09-10T00:00:00.000Z'),
        }),
      );

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      expect(result.activeTopUpComponentTotals.inbound_messages).toBe(0);
      expect(result.effectiveLimits.inbound_messages).toBe(10000);
    });
  });

  describe('task 5.12 — independent dimensions', () => {
    it('an inbound top-up cannot increase outbound, api, channel, or storage', async () => {
      const h = createHarness();
      h.periods.push(makePeriod());
      h.purchases.push(makePurchase());
      h.components.push(makeComponent({ quantity: 9000 }));

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      expect(result.effectiveLimits.outbound_messages).toBe(5000);
      expect(result.effectiveLimits.api_requests).toBe(20000);
      expect(result.effectiveLimits.channel_slots).toBe(3);
      expect(result.effectiveLimits.storage_gb).toBe(1);
      expect(result.activeTopUpComponentTotals.outbound_messages).toBe(0);
    });

    it('channel and storage top-ups increase only their own dimensions', async () => {
      const h = createHarness();
      h.periods.push(makePeriod());
      h.purchases.push(makePurchase());
      h.components.push(
        makeComponent({
          componentType: 'channel_slots',
          quantity: 2,
          unit: 'channels',
        }),
        makeComponent({
          id: 'comp-2',
          componentType: 'storage_gb',
          quantity: 5,
          unit: 'gb',
        }),
      );

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      expect(result.effectiveLimits.channel_slots).toBe(5);
      expect(result.effectiveLimits.storage_gb).toBe(6);
      expect(result.effectiveLimits.inbound_messages).toBe(10000);
    });
  });

  describe('task 5.13 — unlimited and blocked semantics', () => {
    it('keeps an unlimited base unlimited even with a top-up grant', async () => {
      const h = createHarness();
      h.periods.push(
        makePeriod({
          quotaSnapshot: makeSnapshot({ outboundMessageLimit: null }),
        }),
      );
      h.purchases.push(makePurchase());
      h.components.push(
        makeComponent({ componentType: 'outbound_messages', quantity: 4000 }),
      );

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      // The top-up is reported but must never make the unlimited base finite.
      expect(result.activeTopUpComponentTotals.outbound_messages).toBe(4000);
      expect(result.effectiveLimits.outbound_messages).toBeNull();
      expect(result.quotaState.outbound_messages.blocked).toBe(false);
    });

    it('reports 0-blocked dimensions and lets a top-up unblock capacity', async () => {
      const h = createHarness();
      h.periods.push(
        makePeriod({ quotaSnapshot: makeSnapshot({ inboundMessageLimit: 0 }) }),
      );
      const blocked = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      expect(blocked.effectiveLimits.inbound_messages).toBe(0);
      expect(blocked.quotaState.inbound_messages.blocked).toBe(true);

      h.purchases.push(makePurchase());
      h.components.push(makeComponent({ quantity: 1500 }));
      const withTopUp = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      expect(withTopUp.effectiveLimits.inbound_messages).toBe(1500);
      expect(withTopUp.quotaState.inbound_messages.blocked).toBe(false);
    });

    it('falls back to the current plan for dimensions a legacy snapshot never captured', async () => {
      const h = createHarness();
      const legacySnapshot = makeSnapshot();
      delete legacySnapshot.maxChannels;
      delete legacySnapshot.storageLimitGb;
      h.periods.push(makePeriod({ quotaSnapshot: legacySnapshot }));
      h.plans.push(makePlan({ maxChannels: 8, storageLimitGb: 4 }));

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      expect(result.baseLimits.channel_slots).toBe(8);
      expect(result.baseLimits.storage_gb).toBe(4);
    });

    it('keeps an explicit unlimited snapshot value authoritative over the plan', async () => {
      const h = createHarness();
      h.periods.push(
        makePeriod({
          quotaSnapshot: makeSnapshot({ inboundMessageLimit: null }),
        }),
      );
      h.plans.push(makePlan({ inboundMessageLimit: 999 }));

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      expect(result.baseLimits.inbound_messages).toBeNull();
    });
  });

  describe('task 5.14 — ownership and one-active invariant', () => {
    it('only considers the requesting tenant periods and purchases', async () => {
      const h = createHarness();
      h.periods.push(
        makePeriod(),
        makePeriod({
          id: 'period-other',
          tenantId: 'tenant-2',
          quotaSnapshot: makeSnapshot({ inboundMessageLimit: 1 }),
        }),
      );
      h.purchases.push(
        makePurchase(),
        makePurchase({
          id: 'purchase-other',
          tenantId: 'tenant-2',
          subscriptionPeriodId: 'period-other',
        }),
      );
      h.components.push(
        makeComponent({ quantity: 2000 }),
        makeComponent({
          id: 'comp-other',
          tenantId: 'tenant-2',
          purchaseId: 'purchase-other',
          quantity: 99999,
        }),
      );

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );
      expect(result.effectiveLimits.inbound_messages).toBe(12000);
      expect(result.activePeriodId).toBe('period-1');
    });

    it('rejects when the tenant has no active paid period', async () => {
      const h = createHarness();
      h.periods.push(makePeriod({ periodStatus: 'expired' }));
      await expect(
        h.service.resolveActiveSubscriptionEntitlement('tenant-1', {
          now: NOW,
        }),
      ).rejects.toMatchObject({
        name: 'MissingActivePeriodError',
        code: 'NO_ACTIVE_PAID_PERIOD',
      });
    });

    it('rejects multiple active paid periods as a loud data anomaly', async () => {
      const h = createHarness();
      h.periods.push(makePeriod(), makePeriod({ id: 'period-2' }));
      await expect(
        h.service.resolveActiveSubscriptionEntitlement('tenant-1', {
          now: NOW,
        }),
      ).rejects.toMatchObject({ code: 'MULTIPLE_ACTIVE_PERIODS' });
    });

    it('rejects an active period outside its Yangon window', async () => {
      const h = createHarness();
      h.periods.push(makePeriod());
      await expect(
        h.service.resolveActiveSubscriptionEntitlement('tenant-1', {
          now: new Date('2026-11-01T00:00:00.000Z'),
        }),
      ).rejects.toMatchObject({ code: 'PERIOD_OUTSIDE_CALENDAR_WINDOW' });
    });

    it('rejects an active period whose payment is not confirmed', async () => {
      const h = createHarness();
      h.periods.push(makePeriod({ paymentStatus: 'pending' }));
      await expect(
        h.service.resolveActiveSubscriptionEntitlement('tenant-1', {
          now: NOW,
        }),
      ).rejects.toMatchObject({ code: 'PERIOD_PAYMENT_NOT_CONFIRMED' });
    });

    it('rejects an active paid period awaiting Platform Admin activation', async () => {
      const h = createHarness();
      h.periods.push(makePeriod({ adminActivationStatus: 'pending' }));
      await expect(
        h.service.resolveActiveSubscriptionEntitlement('tenant-1', {
          now: NOW,
        }),
      ).rejects.toMatchObject({
        name: 'MissingActivePeriodError',
        code: 'PERIOD_AWAITING_ADMIN_ACTIVATION',
      });
    });

    it('rejects a refunded active period', async () => {
      const h = createHarness();
      h.periods.push(makePeriod({ paymentStatus: 'refunded' }));
      await expect(
        h.service.resolveActiveSubscriptionEntitlement('tenant-1', {
          now: NOW,
        }),
      ).rejects.toMatchObject({ code: 'PERIOD_REFUNDED' });
    });

    it('the missing-period error carries a stable machine-readable code', async () => {
      const h = createHarness();
      try {
        await h.service.resolveActiveSubscriptionEntitlement('tenant-1', {
          now: NOW,
        });
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(MissingActivePeriodError);
        expect((error as MissingActivePeriodError).code).toBe(
          'NO_ACTIVE_PAID_PERIOD',
        );
        expect((error as MissingActivePeriodError).message).toContain(
          'tenant-1',
        );
      }
    });
  });

  describe('resolveActivePeriodId (dual-write identity)', () => {
    it('returns the period id for a valid active paid period', async () => {
      const h = createHarness();
      h.periods.push(makePeriod());
      await expect(
        h.service.resolveActivePeriodId('tenant-1', { now: NOW }),
      ).resolves.toBe('period-1');
    });

    it('returns null instead of throwing when no period is operational', async () => {
      const h = createHarness();
      await expect(
        h.service.resolveActivePeriodId('tenant-1', { now: NOW }),
      ).resolves.toBeNull();
    });

    it('returns null for a trial tenant with no paid period row', async () => {
      const h = createHarness();
      h.periods.push(makePeriod({ periodStatus: 'upcoming' }));
      await expect(
        h.service.resolveActivePeriodId('tenant-1', { now: NOW }),
      ).resolves.toBeNull();
    });
  });

  describe('trial resolution fallback (Plan 14 Phase 3)', () => {
    function makeTrialPeriod(overrides: Row = {}): Row {
      return makePeriod({
        id: 'trial-period-1',
        planId: 'plan-trial',
        periodType: 'trial',
        paymentStatus: 'not_required',
        adminActivationStatus: 'approved',
        periodStartAt: new Date('2026-09-10T00:00:00.000Z'),
        periodEndAt: new Date('2026-09-20T00:00:00.000Z'),
        monthStartAt: null,
        monthEndAt: null,
        quotaSnapshot: makeSnapshot({
          inboundMessageLimit: 1000,
          outboundMessageLimit: 500,
          apiLimit: 20000,
          maxChannels: 2,
          storageLimitGb: 1,
          maxCsrs: 5,
        }),
        ...overrides,
      });
    }

    it('resolves an operational trial when no paid period exists (task 3.2)', async () => {
      const h = createHarness();
      h.periods.push(makeTrialPeriod());
      h.plans.push(
        makePlan({ id: 'plan-trial', name: 'Guided Pilot (Trial)' }),
      );

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );

      expect(result).toMatchObject({
        activePeriodId: 'trial-period-1',
        periodType: 'trial',
        planId: 'plan-trial',
        paymentState: 'not_required',
      });
      expect(result.effectiveLimits.inbound_messages).toBe(1000);
      expect(result.effectiveLimits.outbound_messages).toBe(500);
    });

    it('gives an operational paid period precedence over an active trial (task 3.1)', async () => {
      const h = createHarness();
      h.periods.push(makePeriod());
      h.periods.push(makeTrialPeriod());

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );

      expect(result.activePeriodId).toBe('period-1');
      expect(result.periodType).toBe('paid');
    });

    it('returns TRIAL_EXPIRED when the trial window has ended (task 3.10)', async () => {
      const h = createHarness();
      h.periods.push(
        makeTrialPeriod({ periodEndAt: new Date('2026-09-14T00:00:00.000Z') }),
      );

      await expect(
        h.service.resolveActiveSubscriptionEntitlement('tenant-1', {
          now: NOW,
        }),
      ).rejects.toMatchObject({ code: 'TRIAL_EXPIRED' });
    });

    it('keeps an unexpired trial authoritative while paid activation is pending', async () => {
      const h = createHarness();
      h.periods.push(makePeriod({ adminActivationStatus: 'pending' }));
      h.periods.push(makeTrialPeriod());

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );

      expect(result).toMatchObject({
        activePeriodId: 'trial-period-1',
        periodType: 'trial',
        planId: 'plan-trial',
        paymentState: 'not_required',
      });
      expect(result.effectiveLimits).toMatchObject({
        inbound_messages: 1000,
        outbound_messages: 500,
        api_requests: 20000,
      });
    });

    it('resolveActivePeriodId returns the trial period id for an operational trial', async () => {
      const h = createHarness();
      h.periods.push(makeTrialPeriod());
      await expect(
        h.service.resolveActivePeriodId('tenant-1', { now: NOW }),
      ).resolves.toBe('trial-period-1');
    });
  });

  describe('upgrade effective entitlement (Plan 14 Phase 4)', () => {
    function makeRevision(overrides: Row = {}): Row {
      return {
        id: 'revision-1',
        subscriptionPeriodId: 'period-1',
        tenantId: 'tenant-1',
        billingRecordId: null,
        previousPlanId: 'plan-1',
        upgradedPlanId: 'plan-upgraded',
        previousPlanSnapshot: makeSnapshot(),
        upgradedPlanSnapshot: makeSnapshot({
          inboundMessageLimit: 20000,
          outboundMessageLimit: 10000,
          apiLimit: 40000,
          maxChannels: 5,
          storageLimitGb: 2,
          maxCsrs: 10,
        }),
        upgradeStatus: 'approved',
        upgradeRequestedAt: new Date('2026-09-02T00:00:00.000Z'),
        upgradeEffectiveAt: new Date('2026-09-05T00:00:00.000Z'),
        carryover: {
          inboundMessages: 1500,
          outboundMessages: 800,
          apiRequests: 2000,
        },
        approvedAt: new Date('2026-09-05T00:00:00.000Z'),
        approvedBy: 'admin-1',
        rejectionReason: null,
        metadata: {},
        ...overrides,
      };
    }

    it('resolves the upgraded snapshot + carryover + top-ups as the effective entitlement (tasks 4.1/4.2/4.4)', async () => {
      const h = createHarness();
      h.periods.push(makePeriod({ planId: 'plan-upgraded' }));
      h.plans.push(makePlan({ id: 'plan-upgraded', name: 'Scale' }));
      h.revisions.push(makeRevision());
      h.purchases.push(makePurchase());
      h.components.push(
        makeComponent({ componentType: 'inbound_messages', quantity: 2000 }),
      );

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );

      expect(result.planId).toBe('plan-upgraded');
      expect(result.upgradeRevisionId).toBe('revision-1');
      expect(result.carryover).toEqual({
        inboundMessages: 1500,
        outboundMessages: 800,
        apiRequests: 2000,
      });
      expect(result.effectiveLimits).toEqual({
        inbound_messages: 20000 + 1500 + 2000,
        outbound_messages: 10000 + 800,
        api_requests: 40000 + 2000,
        channel_slots: 5,
        storage_gb: 2,
        team_members: 10,
      });
    });

    it('keeps an unlimited upgraded dimension unlimited despite carryover (task 4.6)', async () => {
      const h = createHarness();
      h.periods.push(makePeriod({ planId: 'plan-upgraded' }));
      h.plans.push(makePlan({ id: 'plan-upgraded', name: 'Scale' }));
      h.revisions.push(
        makeRevision({
          upgradedPlanSnapshot: makeSnapshot({ apiLimit: null }),
          carryover: {
            inboundMessages: null,
            outboundMessages: null,
            apiRequests: 9999,
          },
        }),
      );

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );

      expect(result.effectiveLimits.api_requests).toBeNull();
    });

    it('uses the original snapshot when no approved revision exists', async () => {
      const h = createHarness();
      h.periods.push(makePeriod());
      h.plans.push(makePlan());
      h.revisions.push(makeRevision({ upgradeStatus: 'pending_approval' }));

      const result = await h.service.resolveActiveSubscriptionEntitlement(
        'tenant-1',
        { now: NOW },
      );

      expect(result.planId).toBe('plan-1');
      expect(result.upgradeRevisionId).toBeNull();
      expect(result.effectiveLimits.inbound_messages).toBe(10000);
    });
  });
});
