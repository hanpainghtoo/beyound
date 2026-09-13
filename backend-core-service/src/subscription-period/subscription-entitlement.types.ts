import type {
  SubscriptionQuotaSnapshot,
  SubscriptionUpgradeCarryover,
} from './subscription-period.types';

/**
 * Plan 9 Phase 5: effective entitlement resolution domain types.
 *
 * Every quota/capacity dimension is resolved independently. `null` means
 * unlimited (nothing blocks consumption) and `0` means blocked (nothing can be
 * consumed). A top-up never converts an unlimited base into a finite quota.
 */

export const ENTITLEMENT_DIMENSION_KEYS = [
  'inbound_messages',
  'outbound_messages',
  'api_requests',
  'channel_slots',
  'storage_gb',
  'team_members',
] as const;
export type EntitlementDimensionKey =
  (typeof ENTITLEMENT_DIMENSION_KEYS)[number];

export const ENTITLEMENT_MISSING_PERIOD_CODES = [
  'NO_ACTIVE_PAID_PERIOD',
  'MULTIPLE_ACTIVE_PERIODS',
  'PERIOD_OUTSIDE_CALENDAR_WINDOW',
  'PERIOD_PAYMENT_NOT_CONFIRMED',
  'PERIOD_AWAITING_ADMIN_ACTIVATION',
  'PERIOD_REFUNDED',
  // Plan 14 Phase 3: an active trial whose exact elapsed-day window has ended
  // (now >= period_end_at). The trial grants no access past this boundary, but
  // billing/support/plan-request surfaces stay open for conversion.
  'TRIAL_EXPIRED',
] as const;
export type EntitlementMissingPeriodCode =
  (typeof ENTITLEMENT_MISSING_PERIOD_CODES)[number];

/**
 * Stable, machine-readable error for "no operational paid period". The
 * resolver throws this instead of silently falling back to a current plan or
 * a UTC month, so callers (billing, enforcement, UI) can map `code` to a
 * deterministic remediation instead of parsing prose.
 */
export class MissingActivePeriodError extends Error {
  readonly code: EntitlementMissingPeriodCode;

  constructor(code: EntitlementMissingPeriodCode, detail: string) {
    super(detail);
    this.name = 'MissingActivePeriodError';
    this.code = code;
  }
}

export type DimensionQuotaState = {
  /** Base monthly quota from the immutable period snapshot (null = unlimited). */
  base: number | null;
  /**
   * Sum of confirmed, active, non-expired top-up grants for this dimension in
   * the active period. Reported separately so support can always see the
   * purchases behind an effective limit.
   */
  topUpTotal: number;
  /**
   * `base + topUpTotal`. Stays `null` (unlimited) when the base is unlimited —
   * a top-up must never turn an unlimited base into a finite quota.
   */
  effective: number | null;
  /** `true` when the effective limit is `0` (blocked) — the dimension cannot be consumed. */
  blocked: boolean;
};

export type DimensionLimits = Record<EntitlementDimensionKey, number | null>;
export type DimensionTotals = Record<EntitlementDimensionKey, number>;
export type DimensionQuotaStates = Record<
  EntitlementDimensionKey,
  DimensionQuotaState
>;

/**
 * The resolved operational entitlement for one tenant (tasks 5.1–5.5). This
 * is the single shared shape all quota-consuming and capacity-sensitive paths
 * consume. Base and effective values are preserved separately for reporting.
 */
export type ResolvedSubscriptionEntitlement = {
  tenantId: string;
  activePeriodId: string;
  /** `paid` or `trial` — the resolved period's category (Plan 14 Phase 3). */
  periodType: 'paid' | 'trial';
  planId: string;
  periodStartAt: Date | null;
  periodEndAt: Date | null;
  activatedAt: Date | null;
  periodStatus: string;
  paymentStatus: string;
  paymentState: 'paid' | 'pending' | 'failed' | 'refunded' | 'not_required';
  /** Immutable commercial snapshot captured at purchase/backfill time. */
  planSnapshot: SubscriptionQuotaSnapshot;
  baseLimits: DimensionLimits;
  activeTopUpComponentTotals: DimensionTotals;
  effectiveLimits: DimensionLimits;
  quotaState: DimensionQuotaStates;
  /**
   * Plan 14 Phase 4 (task 4.5): the approved upgrade revision that authorized
   * the current effective entitlement. `null` when the period is not upgraded.
   */
  upgradeRevisionId?: string | null;
  /** Eligible one-time carryover folded into the effective limits. */
  carryover?: SubscriptionUpgradeCarryover | null;
};
