import type { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import type { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';
import { resolveActivePaidPeriod } from './subscription-add-on-active-period.util';

function makePeriod(
  overrides: Partial<TenantSubscriptionPeriod> = {},
): TenantSubscriptionPeriod {
  return {
    id: 'period-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    billingRecordId: 'billing-1',
    periodType: 'paid',
    periodStatus: 'active',
    paymentStatus: 'paid',
    adminActivationStatus: 'approved',
    periodStartAt: new Date('2026-09-01T00:00:00.000Z'),
    periodEndAt: new Date('2026-10-01T00:00:00.000Z'),
    monthStartAt: new Date('2026-09-01T00:00:00.000Z'),
    monthEndAt: new Date('2026-10-01T00:00:00.000Z'),
    startOption: 'current_month',
    sequenceNumber: 1,
    ...overrides,
  } as TenantSubscriptionPeriod;
}

function makeTrial(): TenantEntitlement {
  return {
    id: 'ent-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    state: 'trial_active',
  } as TenantEntitlement;
}

const now = new Date('2026-09-15T00:00:00.000Z');

describe('resolveActivePaidPeriod (tasks 4.3/4.4)', () => {
  it('resolves the active paid period for a proactive purchase', () => {
    const result = resolveActivePaidPeriod({
      periods: [makePeriod()],
      entitlement: null,
      now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.period.id).toBe('period-1');
  });

  it('resolves the active paid period when quota is exhausted (purchase allowed)', () => {
    // Quota state is never part of the gate; the period window is what counts.
    const result = resolveActivePaidPeriod({
      periods: [makePeriod()],
      entitlement: null,
      now,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects trial periods', () => {
    const result = resolveActivePaidPeriod({
      periods: [makePeriod()],
      entitlement: makeTrial(),
      now,
    });
    expect(result).toMatchObject({ ok: false, code: 'trial_period' });
  });

  it('rejects a missing active period', () => {
    const result = resolveActivePaidPeriod({
      periods: [makePeriod({ periodStatus: 'expired' })],
      entitlement: null,
      now,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'no_active_paid_period',
    });
  });

  it('rejects a future (upcoming) period', () => {
    const result = resolveActivePaidPeriod({
      periods: [makePeriod({ periodStatus: 'upcoming' })],
      entitlement: null,
      now,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'no_active_paid_period',
    });
  });

  it('rejects a cancelled period', () => {
    const result = resolveActivePaidPeriod({
      periods: [makePeriod({ periodStatus: 'cancelled' })],
      entitlement: null,
      now,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'no_active_paid_period',
    });
  });

  it('rejects an active period with pending payment', () => {
    const result = resolveActivePaidPeriod({
      periods: [makePeriod({ paymentStatus: 'pending' })],
      entitlement: null,
      now,
    });
    expect(result).toMatchObject({ ok: false, code: 'unpaid_active_period' });
  });

  it('rejects an active paid period awaiting Platform Admin activation', () => {
    const result = resolveActivePaidPeriod({
      periods: [makePeriod({ adminActivationStatus: 'pending' })],
      entitlement: null,
      now,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'admin_approval_pending',
    });
  });

  it('rejects a period outside the current window (expired window)', () => {
    const result = resolveActivePaidPeriod({
      periods: [
        makePeriod({
          periodStartAt: new Date('2026-08-01T00:00:00.000Z'),
          periodEndAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
      ],
      entitlement: null,
      now,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'no_active_paid_period',
    });
  });

  it('accepts a client-supplied period only when it matches the resolution', () => {
    const matching = resolveActivePaidPeriod({
      periods: [makePeriod()],
      entitlement: null,
      requestedPeriodId: 'period-1',
      now,
    });
    expect(matching.ok).toBe(true);

    const mismatching = resolveActivePaidPeriod({
      periods: [makePeriod()],
      entitlement: null,
      requestedPeriodId: 'period-999',
      now,
    });
    expect(mismatching).toMatchObject({
      ok: false,
      code: 'period_mismatch',
    });
  });
});
