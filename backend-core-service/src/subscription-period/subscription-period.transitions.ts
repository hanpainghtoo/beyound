/**
 * Period status / payment-status transition tables (Plan 9 Phase 2, task 2.5).
 *
 * Business rules encoded here:
 * - pending or failed payment never grants access (`paymentConfersAccess`);
 * - a paid future month remains `upcoming` — payment confirmation marks it
 *   paid but does not activate it;
 * - once a period is `expired` or `cancelled` it is terminal (no reactivation
 *   of the same period row; a new purchase creates a new period);
 * - `scheduled_prepaid` periods are created `upcoming` and only transition to
 *   `active` by the scheduler at their Yangon month boundary.
 */

import type {
  SubscriptionPeriodPaymentStatus,
  SubscriptionPeriodStatus,
} from './subscription-period.types';

export const PERIOD_STATUS_TRANSITIONS: Record<
  SubscriptionPeriodStatus,
  readonly SubscriptionPeriodStatus[]
> = {
  upcoming: ['active', 'cancelled', 'expired'],
  active: ['expired', 'cancelled'],
  expired: [],
  cancelled: [],
};

export const PERIOD_PAYMENT_TRANSITIONS: Record<
  SubscriptionPeriodPaymentStatus,
  readonly SubscriptionPeriodPaymentStatus[]
> = {
  pending: ['paid', 'failed'],
  paid: ['refunded'],
  failed: ['pending', 'paid'],
  refunded: [],
  // Plan 14 Phase 1: trial periods are never purchased, so `not_required` is
  // terminal for the trial period itself. A trial conversion creates a NEW
  // paid period; it never transitions the trial's payment state.
  not_required: [],
};

/**
 * Thrown when a status change violates the transition table. Message is
 * intentionally stable for tests and operator logs.
 */
export class PeriodTransitionError extends Error {
  constructor(
    readonly field: 'period_status' | 'payment_status',
    readonly from: string,
    readonly to: string,
  ) {
    super(
      `Illegal ${field} transition: ${from} -> ${to} (see subscription-period.transitions)`,
    );
    this.name = 'PeriodTransitionError';
  }
}

export function assertPeriodStatusTransition(
  from: SubscriptionPeriodStatus,
  to: SubscriptionPeriodStatus,
): void {
  if (from === to) return;
  if (!PERIOD_STATUS_TRANSITIONS[from]?.includes(to)) {
    throw new PeriodTransitionError('period_status', from, to);
  }
}

export function assertPaymentStatusTransition(
  from: SubscriptionPeriodPaymentStatus,
  to: SubscriptionPeriodPaymentStatus,
): void {
  if (from === to) return;
  if (!PERIOD_PAYMENT_TRANSITIONS[from]?.includes(to)) {
    throw new PeriodTransitionError('payment_status', from, to);
  }
}

/**
 * Only a paid, active period within its Yangon month window confers service
 * access. Pending/failed payment or an `upcoming` period grants nothing, even
 * when the calendar month has already started. Admin activation must be
 * approved (or absent, which defaults to approved).
 */
export function periodConfersAccess(input: {
  periodStatus: SubscriptionPeriodStatus;
  paymentStatus: SubscriptionPeriodPaymentStatus;
  adminActivationStatus?: string | null;
  periodStartAt: Date | null;
  periodEndAt: Date | null;
  now: Date;
}): boolean {
  const {
    periodStatus,
    paymentStatus,
    adminActivationStatus,
    periodStartAt,
    periodEndAt,
    now,
  } = input;
  if (periodStatus !== 'active') return false;
  if (paymentStatus !== 'paid') return false;
  if (adminActivationStatus && adminActivationStatus !== 'approved')
    return false;
  if (!periodStartAt || !periodEndAt) return false;
  const t = now.getTime();
  return t >= periodStartAt.getTime() && t < periodEndAt.getTime();
}
