import type { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import {
  applyAdminActivationApproval,
  isOperationallyValidPaidPeriod,
  resolveAdminActivationBackfill,
} from './subscription-period-admin-backfill.util';

function makePeriod(
  overrides: Partial<TenantSubscriptionPeriod> = {},
): TenantSubscriptionPeriod {
  return {
    id: overrides.id ?? 'period-1',
    tenantId: overrides.tenantId ?? 'tenant-1',
    planId: 'plan-1',
    billingRecordId: null,
    periodType: overrides.periodType ?? 'paid',
    periodStatus: overrides.periodStatus ?? 'active',
    paymentStatus: overrides.paymentStatus ?? 'paid',
    adminActivationStatus: overrides.adminActivationStatus ?? 'approved',
    adminActivatedAt: null,
    adminActivatedBy: null,
    adminActivationReason: null,
    durationDays: 30,
    periodStartAt:
      overrides.periodStartAt ?? new Date('2026-08-01T00:00:00.000Z'),
    periodEndAt: overrides.periodEndAt ?? new Date('2026-09-01T00:00:00.000Z'),
    monthStartAt:
      overrides.monthStartAt ?? new Date('2026-08-01T00:00:00.000Z'),
    monthEndAt: overrides.monthEndAt ?? new Date('2026-09-01T00:00:00.000Z'),
    startOption: overrides.startOption ?? 'current_month',
    scheduledStartAt: null,
    scheduledEndAt: null,
    activatedAt: null,
    expiredAt: null,
    endReason: null,
    activationReason: null,
    sequenceNumber: 1,
    quotaSnapshot: {} as never,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as TenantSubscriptionPeriod;
}

const now = new Date('2026-08-15T00:00:00.000Z');

describe('subscription-period-admin-backfill.util', () => {
  it('approves exactly the valid active paid period in the current window', () => {
    const active = makePeriod({ id: 'period-active' });
    const upcoming = makePeriod({
      id: 'period-upcoming',
      periodStatus: 'upcoming',
      monthStartAt: new Date('2026-09-01T00:00:00.000Z'),
      monthEndAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    const { toApprove, report } = resolveAdminActivationBackfill({
      periods: [active, upcoming],
      now,
    });

    expect(toApprove.map((period) => period.id)).toEqual(['period-active']);
    expect(report.approved).toBe(1);
    expect(report.reconciliationExceptions).toEqual([]);
  });

  it('never approves unpaid, expired, upcoming, trial, or out-of-window rows', () => {
    const unpaid = makePeriod({ id: 'unpaid', paymentStatus: 'pending' });
    const expired = makePeriod({ id: 'expired', periodStatus: 'expired' });
    const trial = makePeriod({ id: 'trial', periodType: 'trial' });
    const past = makePeriod({
      id: 'past',
      monthStartAt: new Date('2026-06-01T00:00:00.000Z'),
      monthEndAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    const { toApprove, report } = resolveAdminActivationBackfill({
      periods: [unpaid, expired, trial, past],
      now,
    });

    expect(toApprove).toEqual([]);
    expect(report.approved).toBe(0);
    // An active paid row that is unpaid or out-of-window is itself an
    // inconsistency; the backfill flags it instead of guessing which row is
    // authoritative.
    expect(report.reconciliationExceptions).toHaveLength(1);
    expect(report.reconciliationExceptions[0].reason).toContain(
      'multiple active paid periods',
    );
  });

  it('reports duplicate active paid periods as a reconciliation exception', () => {
    const first = makePeriod({ id: 'active-1' });
    const second = makePeriod({ id: 'active-2' });

    const { toApprove, report } = resolveAdminActivationBackfill({
      periods: [first, second],
      now,
    });

    expect(toApprove).toEqual([]);
    expect(report.reconciliationExceptions).toHaveLength(1);
    expect(report.reconciliationExceptions[0].reason).toContain(
      'multiple active paid periods',
    );
    expect(report.reconciliationExceptions[0].periodIds.sort()).toEqual([
      'active-1',
      'active-2',
    ]);
  });

  it('detects validity only for paid, active, in-window periods', () => {
    expect(isOperationallyValidPaidPeriod(makePeriod({}), now)).toBe(true);
    expect(
      isOperationallyValidPaidPeriod(
        makePeriod({ periodStatus: 'upcoming' }),
        now,
      ),
    ).toBe(false);
    expect(
      isOperationallyValidPaidPeriod(
        makePeriod({ paymentStatus: 'pending' }),
        now,
      ),
    ).toBe(false);
    expect(
      isOperationallyValidPaidPeriod(
        makePeriod({
          monthStartAt: new Date('2026-09-01T00:00:00.000Z'),
          monthEndAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
        now,
      ),
    ).toBe(false);
  });

  it('marks approval without rewriting any historical field', () => {
    const period = makePeriod({ id: 'period-active' });
    const approvedAt = new Date('2026-08-15T10:00:00.000Z');

    applyAdminActivationApproval(period, {
      approvedAt,
      approvedBy: 'admin-1',
      reason: 'legacy backfill',
    });

    expect(period.adminActivationStatus).toBe('approved');
    expect(period.adminActivatedAt).toEqual(approvedAt);
    expect(period.adminActivatedBy).toBe('admin-1');
    expect(period.periodStatus).toBe('active');
    expect(period.paymentStatus).toBe('paid');
    expect(period.monthStartAt?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(period.monthEndAt?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});
