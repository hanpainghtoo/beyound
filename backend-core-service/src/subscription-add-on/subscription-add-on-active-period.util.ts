import type { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { isTrialEntitlement } from '../subscription-period/subscription-period.service';
import type { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';

/**
 * Top-up target period resolution (Plan 9 Phase 4, tasks 4.3/4.4).
 *
 * A top-up may only attach to the tenant's currently active paid period.
 * The server resolves that period; a client-supplied period is ignored unless
 * it exactly matches the resolved one. Trial, pending-payment, expired,
 * cancelled, future, and missing active periods are all rejected. Purchases
 * are allowed whether or not quota is exhausted (quota exhaustion is handled
 * by the Phase 5 resolver, never by the purchase gate).
 */

export type ActivePeriodResolution =
  | { ok: true; period: TenantSubscriptionPeriod }
  | {
      ok: false;
      code:
        | 'trial_period'
        | 'no_active_paid_period'
        | 'period_mismatch'
        | 'unpaid_active_period'
        | 'admin_approval_pending';
      detail: string;
    };

export function resolveActivePaidPeriod(input: {
  periods: TenantSubscriptionPeriod[];
  entitlement: TenantEntitlement | null;
  requestedPeriodId?: string | null;
  now?: Date;
}): ActivePeriodResolution {
  const { periods, entitlement, requestedPeriodId } = input;
  const now = input.now ?? new Date();

  // Plan 14 Phase 3 (task 3.6): reject both the legacy trial entitlement
  // (historical rows) and the new trial period so top-ups are never granted
  // against trial capacity.
  const hasActiveTrialPeriod = periods.some(
    (period) =>
      period.periodType === 'trial' && period.periodStatus === 'active',
  );
  if (isTrialEntitlement(entitlement) || hasActiveTrialPeriod) {
    return {
      ok: false,
      code: 'trial_period',
      detail: 'Top-ups cannot be attached to a trial period.',
    };
  }

  const inWindowActive = periods.filter(
    (period) =>
      period.periodStatus === 'active' &&
      period.periodStartAt !== null &&
      period.periodEndAt !== null &&
      now.getTime() >= period.periodStartAt.getTime() &&
      now.getTime() < period.periodEndAt.getTime(),
  );

  if (inWindowActive.length === 0) {
    return {
      ok: false,
      code: 'no_active_paid_period',
      detail:
        'The tenant has no active paid period in its calendar-month window; top-ups can only attach to the active paid month.',
    };
  }

  const activePaid = inWindowActive.find(
    (period) => period.paymentStatus === 'paid',
  );
  if (!activePaid) {
    return {
      ok: false,
      code: 'unpaid_active_period',
      detail:
        'The tenant has an active period whose payment is not confirmed; top-ups cannot attach before payment.',
    };
  }

  // Plan 13 Phase 3 (task 3.5): top-ups may only attach to an operational
  // active paid period. A paid period awaiting Platform Admin approval grants
  // no capacity and cannot be a top-up target.
  if (activePaid.adminActivationStatus !== 'approved') {
    return {
      ok: false,
      code: 'admin_approval_pending',
      detail:
        'The active paid period awaits Platform Admin activation; top-ups can only be purchased once the period is approved.',
    };
  }

  // One-active invariant means at most one active period; resolve it.
  const resolved = activePaid;

  if (
    requestedPeriodId &&
    requestedPeriodId.trim() !== '' &&
    requestedPeriodId !== resolved.id
  ) {
    return {
      ok: false,
      code: 'period_mismatch',
      detail:
        'Client-supplied target period does not match the server-resolved active paid period.',
    };
  }

  return { ok: true, period: resolved };
}
