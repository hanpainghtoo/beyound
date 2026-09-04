/**
 * Plan 9 Phase 5, task 5.8: billable tenant API path classification.
 *
 * Read-only billing, usage-summary, health, and provider-callback paths must
 * never consume API quota once enforcement is enabled. Classification happens
 * before the quota guard: only non-read-only tenant requests are tracked by
 * the usage interceptor. Provider delivery/read callbacks and webhook
 * ingestion are non-billable status updates (see `billableUsagePolicy`).
 *
 * Authentication and the billing checkout flow are infrastructure, not API
 * product usage: a tenant with no paid period must still be able to sign in,
 * request a plan, and submit payment proof — otherwise a new tenant can never
 * purchase their first plan (catch-22).
 */

const READ_ONLY_VIEW_PATH_PATTERNS: RegExp[] = [
  /\/healthz?(\/|$)/,
  /\/usage-summary(\/|$)/,
  /\/billing(\/|$)/,
  /\/subscription(\/|$)/,
  /\/entitlement(\/|$)/,
  // Capability probe: reports which providers the tenant's plan allows
  // (including `hasActivePeriod: false`). Must stay reachable without an
  // active period so the UI can disable channel creation — gating it would
  // recreate the catch-22 it exists to prevent.
  /\/providers\/allowed(\/|$)/,
];

const NON_BILLABLE_CALLBACK_PATH_PATTERNS: RegExp[] = [
  /\/delivery-receipt(\/|$)/,
  /\/provider-callback(\/|$)/,
  /\/webhooks?(\/|$)/,
];

// Account lifecycle (login, register, password reset, email verification,
// refresh) must never be quota-gated — a tenant with no active period still
// has to sign in to request or pay for a plan.
const NON_BILLABLE_AUTH_PATH_PATTERNS: RegExp[] = [/\/auth(\/|$)/];

// The purchase -> payment-proof checkout flow must work before a tenant has
// any active period (first purchase). Gating it on the API quota would lock
// new tenants out of ever buying a plan.
// The add-on catalog is read-only pre-purchase infrastructure — a tenant with
// no active period must be able to browse available top-up packages (disabled
// cards are shown in the UI) before buying their first plan.
const NON_BILLABLE_BILLING_CHECKOUT_PATH_PATTERNS: RegExp[] = [
  /\/billing\/purchase-requests(\/|$)/,
  /\/billing\/plan-change-requests(\/|$)/,
  /\/billing\/[^/]+\/payment-proof(\/|$)/,
  /\/add-on-purchases(\/|$)/,
  /\/add-on-products(\/|$)/,
  // Payment-proof uploads and download URLs are billing infrastructure.
  /\/media\/uploads\/billing-proof(\/|$)/,
  /\/media\/billing-proof(\/|$)/,
];

/**
 * Whether a tenant HTTP request should be counted against the API quota.
 * Infrastructure methods, read-only view paths, and the billing checkout flow
 * are excluded; product mutations and data-producing reads are billable.
 */
export function isBillableTenantApiRequest(
  method: string,
  path: string,
): boolean {
  const normalizedMethod = (method || '').toUpperCase();
  if (normalizedMethod === 'OPTIONS' || normalizedMethod === 'HEAD') {
    return false;
  }
  const normalizedPath = path.split('?')[0];
  if (
    NON_BILLABLE_CALLBACK_PATH_PATTERNS.some((pattern) =>
      pattern.test(normalizedPath),
    ) ||
    NON_BILLABLE_AUTH_PATH_PATTERNS.some((pattern) =>
      pattern.test(normalizedPath),
    ) ||
    NON_BILLABLE_BILLING_CHECKOUT_PATH_PATTERNS.some((pattern) =>
      pattern.test(normalizedPath),
    )
  ) {
    return false;
  }
  if (
    normalizedMethod === 'GET' &&
    READ_ONLY_VIEW_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath))
  ) {
    return false;
  }
  return true;
}
