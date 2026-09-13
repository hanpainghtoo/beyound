import type { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import { yangonMonthEnd, yangonMonthStart } from './yangon-month.util';

/**
 * Plan 13 Phase 1 (task 1.6/1.7): legacy-safe backfill policy for the new
 * `admin_activation_status` field.
 *
 * Only clearly valid operational paid periods are marked `approved`:
 *
 * ```text
 * period_type = paid
 * period_status = active
 * payment_status = paid
 * now inside [monthStartAt, monthEndAt) (falls back to period bounds)
 * exactly one active paid period for the tenant
 * ```
 *
 * Everything else stays untouched and is reported for manual reconciliation —
 * the backfill never guesses. Dates, snapshots, top-ups, usage, payment
 * evidence, and the calendar status are never rewritten. Because the additive
 * migration defaults the column to `approved`, this utility is the explicit
 * policy implementation and the guard for any pre-migration data.
 */
export type AdminActivationBackfillReport = {
  scanned: number;
  approved: number;
  unchanged: number;
  /** Duplicate active periods per tenant — fail-closed reconciliation list. */
  reconciliationExceptions: Array<{
    tenantId: string;
    reason: string;
    periodIds: string[];
  }>;
};

export function isOperationallyValidPaidPeriod(
  period: TenantSubscriptionPeriod,
  now = new Date(),
): boolean {
  if (period.periodType !== 'paid') return false;
  if (period.periodStatus !== 'active') return false;
  if (period.paymentStatus !== 'paid') return false;
  const startAt = period.monthStartAt ?? period.periodStartAt;
  const endAt = period.monthEndAt ?? period.periodEndAt;
  if (!startAt || !endAt) return false;
  const t = now.getTime();
  return t >= startAt.getTime() && t < endAt.getTime();
}

/**
 * Deterministic backfill decision for a tenant's periods. Returns the periods
 * to mark approved (exactly the valid current active paid period, if any) and
 * the reconciliation exceptions. Pure and unit-testable; never mutates input.
 */
export function resolveAdminActivationBackfill(input: {
  periods: TenantSubscriptionPeriod[];
  now?: Date;
}): {
  toApprove: TenantSubscriptionPeriod[];
  report: AdminActivationBackfillReport;
} {
  const now = input.now ?? new Date();
  const exceptions: AdminActivationBackfillReport['reconciliationExceptions'] =
    [];

  // Tenant grouping keeps the one-active-period check tenant-local.
  const byTenant = new Map<string, TenantSubscriptionPeriod[]>();
  for (const period of input.periods) {
    const list = byTenant.get(period.tenantId) || [];
    list.push(period);
    byTenant.set(period.tenantId, list);
  }

  const toApprove: TenantSubscriptionPeriod[] = [];
  let scanned = 0;
  let unchanged = 0;

  for (const [tenantId, tenantPeriods] of byTenant) {
    const activePaid = tenantPeriods.filter(
      (period) =>
        period.periodType === 'paid' && period.periodStatus === 'active',
    );
    scanned += tenantPeriods.length;

    if (activePaid.length > 1) {
      exceptions.push({
        tenantId,
        reason:
          'multiple active paid periods; cannot guess an authoritative row',
        periodIds: activePaid.map((period) => period.id),
      });
      unchanged += tenantPeriods.length;
      continue;
    }

    const candidate = activePaid[0];
    if (!candidate) {
      unchanged += tenantPeriods.length;
      continue;
    }

    if (isOperationallyValidPaidPeriod(candidate, now)) {
      toApprove.push(candidate);
    } else {
      // Paid-but-out-of-window or non-paid active rows stay for review.
      unchanged += 1;
    }
  }

  return {
    toApprove,
    report: {
      scanned,
      approved: toApprove.length,
      unchanged,
      reconciliationExceptions: exceptions,
    },
  };
}

/**
 * Apply the backfill decision to a period without touching any historical
 * field. `adminActivatedAt`/`adminActivatedBy` are set only when provided;
 * the migration's default keeps the column `approved` for these rows.
 */
export function applyAdminActivationApproval(
  period: TenantSubscriptionPeriod,
  options: {
    approvedAt?: Date;
    approvedBy?: string | null;
    reason?: string;
  } = {},
): TenantSubscriptionPeriod {
  period.adminActivationStatus = 'approved';
  period.adminActivatedAt = options.approvedAt ?? period.adminActivatedAt;
  period.adminActivatedBy = options.approvedBy ?? period.adminActivatedBy;
  period.adminActivationReason =
    options.reason ?? period.adminActivationReason ?? 'legacy backfill';
  return period;
}

/** Report rows that predate the Yangon month contract for review. */
export function findLegacyRowsForReview(
  periods: TenantSubscriptionPeriod[],
): TenantSubscriptionPeriod[] {
  return periods.filter((period) => !period.monthStartAt || !period.monthEndAt);
}

export function yangonWindowFor(period: TenantSubscriptionPeriod): {
  startAt: Date;
  endAt: Date;
} {
  const startAt =
    period.monthStartAt ?? period.periodStartAt ?? yangonMonthStart(new Date());
  const endAt =
    period.monthEndAt ?? period.periodEndAt ?? yangonMonthEnd(startAt);
  return { startAt, endAt };
}
