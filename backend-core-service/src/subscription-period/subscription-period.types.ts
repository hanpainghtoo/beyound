import type { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import type { EntitlementDimensionKey } from './subscription-entitlement.types';

/**
 * Subscription period queue domain types (Plan 8 Phase 2).
 *
 * A purchased period is the authoritative quota window. The quota snapshot is
 * an immutable commercial record captured at purchase/backfill time so later
 * plan edits never change an already-purchased period's terms.
 */

export const SUBSCRIPTION_PERIOD_TYPES = ['trial', 'paid'] as const;
export type SubscriptionPeriodType = (typeof SUBSCRIPTION_PERIOD_TYPES)[number];

export const SUBSCRIPTION_PERIOD_STATUSES = [
  'upcoming',
  'active',
  'expired',
  'cancelled',
] as const;
export type SubscriptionPeriodStatus =
  (typeof SUBSCRIPTION_PERIOD_STATUSES)[number];

export const SUBSCRIPTION_PERIOD_PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refunded',
  // Plan 14 Phase 1: trial periods are not purchased, so they carry a
  // distinct `not_required` payment state instead of a fake paid invoice.
  'not_required',
] as const;
export type SubscriptionPeriodPaymentStatus =
  (typeof SUBSCRIPTION_PERIOD_PAYMENT_STATUSES)[number];

export const SUBSCRIPTION_PERIOD_END_REASONS = [
  'scheduled_expiry',
  'early_quota_renewal',
  'cancelled',
] as const;
export type SubscriptionPeriodEndReason =
  (typeof SUBSCRIPTION_PERIOD_END_REASONS)[number];

export const SUBSCRIPTION_PERIOD_ACTIVATION_REASONS = [
  'initial',
  'scheduled',
  // Legacy Plan 8 value. The calendar-month direction has no early renewal;
  // kept in the enum so historical rows remain readable.
  'early_renewal',
] as const;
export type SubscriptionPeriodActivationReason =
  (typeof SUBSCRIPTION_PERIOD_ACTIVATION_REASONS)[number];

/**
 * Plan 13 Phase 1: Platform Admin operational approval (admin activation).
 *
 * Kept separate from the calendar `period_status` and from `payment_status`.
 * A period is operational only when all three facts are aligned: paid,
 * calendar-active, and admin-approved. `revoked` is reserved for a future
 * decision and is not implemented in the first release.
 */
export const SUBSCRIPTION_PERIOD_ADMIN_ACTIVATION_STATUSES = [
  'pending',
  'approved',
  'revoked',
] as const;
export type SubscriptionPeriodAdminActivationStatus =
  (typeof SUBSCRIPTION_PERIOD_ADMIN_ACTIVATION_STATUSES)[number];

/**
 * Plan 13 Phase 1: upgrade revision lifecycle (one upgrade per current period).
 *
 * - `requested`   tenant requested a higher-priced current-month plan;
 * - `pending_payment` payment evidence is being reviewed;
 * - `approved`    payment confirmed and Platform Admin approved before expiry;
 * - `rejected`    rejected by Platform Admin or by server validation;
 * - `stale`       requested before expiry but not approved before the period
 *                 ended — a manual billing-reconciliation case when paid;
 * - `cancelled`   tenant cancelled a pending upgrade.
 *
 * All terminal states remain historical and consume the one-upgrade-per-period
 * slot; they are never silently retried.
 */
export const SUBSCRIPTION_UPGRADE_STATUSES = [
  'requested',
  'pending_payment',
  'pending_approval',
  'approved',
  'rejected',
  'stale',
  'cancelled',
] as const;
export type SubscriptionUpgradeStatus =
  (typeof SUBSCRIPTION_UPGRADE_STATUSES)[number];

/**
 * Remaining eligible quota carried from the current period into the upgraded
 * plan at successful Admin approval time. Only message and API dimensions are
 * carried; storage, channels, and users are explicitly excluded. `null`
 * preserves an unlimited current limit.
 */
export type SubscriptionUpgradeCarryover = {
  inboundMessages: number | null;
  outboundMessages: number | null;
  apiRequests: number | null;
};

/**
 * Persisted first-purchase / queueing choice (Plan 9 Phase 2, task 2.3).
 *
 * - `current_month`    first purchase that activates immediately in the open
 *                      Yangon month (records `activatedAt` separately);
 * - `next_month`       first purchase that stays upcoming until the next
 *                      Yangon boundary;
 * - `scheduled_prepaid` server-assigned prepaid month queued behind an already
 *                      active paid period, or a fresh paid period scheduled
 *                      after a trial. Clients persist this only through the
 *                      validated purchase flow.
 *
 * Immutable after payment confirmation.
 */
export const SUBSCRIPTION_PERIOD_START_OPTIONS = [
  'current_month',
  'next_month',
  'scheduled_prepaid',
] as const;
export type SubscriptionPeriodStartOption =
  (typeof SUBSCRIPTION_PERIOD_START_OPTIONS)[number];

/**
 * Monthly period schedule contract (task 2.2). Calendar months are the
 * half-open `[monthStartAt, monthEndAt)` window in `Asia/Yangon`. For
 * calendar-aligned periods `periodStartAt === monthStartAt` and
 * `periodEndAt === monthEndAt`. A fresh paid plan scheduled after a trial may
 * use the exact trial expiry as `periodStartAt` while retaining the Yangon
 * calendar month as its billing window. `activatedAt` is the actual activation
 * instant, which differs from the effective period start for current-month
 * first purchases and scheduled-after-trial activation.
 */
export type SubscriptionPeriodSchedule = {
  monthStartAt: Date;
  monthEndAt: Date;
  periodStartAt: Date;
  periodEndAt: Date;
  activatedAt: Date | null;
};

/**
 * Build the schedule contract for a calendar-aligned period or a validated
 * after-trial effective window. Used by the period service and cutover so the
 * `SubscriptionPeriodSchedule` shape is the single source for the period's
 * calendar window and effective bounds, not dead documentation.
 */
export function buildPeriodSchedule(input: {
  monthStartAt: Date;
  monthEndAt: Date;
  periodStartAt?: Date;
  periodEndAt?: Date;
  activatedAt?: Date | null;
}): SubscriptionPeriodSchedule {
  return {
    monthStartAt: input.monthStartAt,
    monthEndAt: input.monthEndAt,
    periodStartAt: input.periodStartAt ?? input.monthStartAt,
    periodEndAt: input.periodEndAt ?? input.monthEndAt,
    activatedAt: input.activatedAt ?? null,
  };
}

/**
 * Domain contract for creating a trial period (Plan 14 Phase 1, task 1.5).
 *
 * A trial period is deliberately distinct from `createPaidPeriod`: it requires
 * a `plan_type = trial` plan, a positive day duration, an auto-approved admin
 * state, `not_required` payment, no billing record, and exact start/end
 * instants. Trial periods use exact elapsed-day bounds, not Yangon calendar
 * months, so `month_start_at`/`month_end_at` stay `null`.
 */
export type CreateTrialPeriodInput = {
  tenantId: string;
  plan: SubscriptionPlan;
  periodStartAt: Date;
  /** Exact trial length in days; must be a positive integer. */
  durationDays: number;
  actorType?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Trial-to-paid conversion linkage (Plan 14 Phase 1, task 1.2). When a paid
 * business period replaces a trial, the trial records the paid period it
 * converted into and the paid period records the trial it came from. Both are
 * nullable so the pair is only linked when a conversion actually exists.
 */
export type TrialConversionLinkage = {
  /** The paid period a trial converted into (set on the trial period). */
  convertedToPeriodId: string | null;
  /** The trial a paid period originated from (set on the paid period). */
  convertedFromPeriodId: string | null;
};

/**
 * Frozen quota policy for one purchased period. This is what runtime guards
 * enforce; the plan is only catalog identity for display.
 *
 * @deprecated legacy fields — `messageQuotaMode`, `messageLimit`, and
 * `durationDays` are retained only so Plan 8/backfilled rows stay readable.
 * New monthly periods enforce the independent `inboundMessageLimit` and
 * `outboundMessageLimit` terms and ignore the aggregate/mode/duration fields.
 */
export type SubscriptionQuotaSnapshot = {
  /** @deprecated legacy Plan 8 field, kept for historical rows only. */
  messageQuotaMode: 'combined' | 'directional';
  /** @deprecated legacy aggregate limit, kept for historical rows only. */
  messageLimit: number | null;
  inboundMessageLimit: number | null;
  outboundMessageLimit: number | null;
  apiLimit: number | null;
  allowedProviders: string[];
  /** @deprecated legacy Plan 8 field; calendar months derive from Yangon bounds. */
  durationDays: number;
  /**
   * Base channel capacity for the purchased period. `0` blocks channel
   * creation; channel top-ups add capacity on top of this value.
   */
  maxChannels: number;
  /**
   * Base storage capacity (GB) for the purchased period. `0` blocks new
   * uploads while over capacity; storage top-ups add capacity on top of it.
   */
  storageLimitGb: number;
  /**
   * Base active team-member (CSR) capacity for the purchased period. `0`
   * blocks new workspace users; no user-seat top-up exists yet, so this stays
   * the plan's `maxCsrs` frozen at purchase time.
   */
  maxCsrs: number;
  price: number;
};

/**
 * Build an immutable quota snapshot from a plan at purchase/backfill time.
 * Returns a deep copy so mutating the plan afterwards cannot change a
 * purchased period's frozen terms.
 */
export function buildQuotaSnapshot(
  plan: SubscriptionPlan,
): SubscriptionQuotaSnapshot {
  return {
    messageQuotaMode:
      plan.messageQuotaMode === 'directional' ? 'directional' : 'combined',
    messageLimit: plan.messageLimit ?? null,
    inboundMessageLimit: plan.inboundMessageLimit ?? null,
    outboundMessageLimit: plan.outboundMessageLimit ?? null,
    apiLimit: plan.apiLimit ?? null,
    allowedProviders: Array.isArray(plan.allowedProviders)
      ? [...plan.allowedProviders]
      : [],
    durationDays: plan.durationDays,
    maxChannels: Number(plan.maxChannels ?? 0),
    storageLimitGb: Number(plan.storageLimitGb ?? 0),
    maxCsrs: Number(plan.maxCsrs ?? 0),
    price: Number(plan.monthlyPrice || 0),
  };
}

/**
 * Plan 14 Phase 1 (task 1.7): assemble the effective entitlement after an
 * approved upgrade or trial conversion.
 *
 * The upgraded entitlement is the target plan snapshot plus the one-time
 * eligible carryover (inbound/outbound/API only) plus existing active
 * top-up component totals. Storage, channels, and users never receive
 * carryover; `null` (unlimited) stays unlimited and `0` stays blocked unless
 * the target snapshot supplies a valid non-zero value.
 *
 * This is a pure, deterministic helper so the resolver/approval path can unit
 * test it without a database.
 */
export function assembleUpgradeEffectiveLimits(input: {
  upgradedSnapshot: SubscriptionQuotaSnapshot;
  carryover: SubscriptionUpgradeCarryover;
  activeTopUpComponentTotals: Partial<Record<EntitlementDimensionKey, number>>;
}): SubscriptionQuotaSnapshot {
  const { upgradedSnapshot, carryover, activeTopUpComponentTotals } = input;
  const total = (dimension: EntitlementDimensionKey): number =>
    activeTopUpComponentTotals[dimension] ?? 0;

  // Message/API dimensions receive the one-time eligible carryover AND their
  // existing valid top-ups; an unlimited base stays unlimited. Storage,
  // channels, and users receive only their existing top-ups (no carryover).
  const combine = (
    base: number | null,
    remaining: number | null,
    dimension: EntitlementDimensionKey,
  ): number | null => {
    if (base === null) return null; // unlimited stays unlimited
    const carry = remaining === null ? 0 : remaining; // no carryover grant
    return base + carry + total(dimension);
  };

  return {
    ...upgradedSnapshot,
    inboundMessageLimit: combine(
      upgradedSnapshot.inboundMessageLimit,
      carryover.inboundMessages,
      'inbound_messages',
    ),
    outboundMessageLimit: combine(
      upgradedSnapshot.outboundMessageLimit,
      carryover.outboundMessages,
      'outbound_messages',
    ),
    apiLimit: combine(
      upgradedSnapshot.apiLimit,
      carryover.apiRequests,
      'api_requests',
    ),
    // Storage, channels, and users: base snapshot + top-ups only (no carryover).
    maxChannels: upgradedSnapshot.maxChannels + total('channel_slots'),
    storageLimitGb: upgradedSnapshot.storageLimitGb + total('storage_gb'),
    maxCsrs: upgradedSnapshot.maxCsrs + total('team_members'),
    allowedProviders: [...upgradedSnapshot.allowedProviders],
  };
}
