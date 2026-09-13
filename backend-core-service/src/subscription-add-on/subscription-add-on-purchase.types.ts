/**
 * Plan 9 Phase 4: top-up purchase, payment, and active-period attachment types.
 *
 * A purchase is one immutable bundle grant attached to the tenant's resolved
 * active paid period. The same product may be purchased repeatedly (records
 * stack); only the same request/payment event is idempotent. Refunds are
 * intentionally out of scope in this release.
 */

export const ADD_ON_PURCHASE_PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
] as const;
export type AddOnPurchasePaymentStatus =
  (typeof ADD_ON_PURCHASE_PAYMENT_STATUSES)[number];

export const ADD_ON_PURCHASE_STATUSES = [
  'pending',
  'active',
  'expired',
  'cancelled',
] as const;
export type AddOnPurchaseStatus = (typeof ADD_ON_PURCHASE_STATUSES)[number];

export const ADD_ON_PURCHASE_COMPONENT_STATUSES = [
  'pending',
  'active',
  'expired',
] as const;
export type AddOnPurchaseComponentStatus =
  (typeof ADD_ON_PURCHASE_COMPONENT_STATUSES)[number];

export const ADD_ON_PURCHASE_EVENT_TYPES = [
  'add_on_purchase_created',
  'add_on_payment_confirmed',
  'add_on_activated',
  'add_on_expired',
  'add_on_cancelled',
] as const;
export type AddOnPurchaseEventType =
  (typeof ADD_ON_PURCHASE_EVENT_TYPES)[number];
