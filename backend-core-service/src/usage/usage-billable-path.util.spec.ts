import { isBillableTenantApiRequest } from './usage-billable-path.util';

describe('isBillableTenantApiRequest (Phase 5, task 5.8/5.16)', () => {
  it('excludes read-only billing and usage-summary views', () => {
    expect(isBillableTenantApiRequest('GET', '/api/v1/tenant/billing')).toBe(
      false,
    );
    expect(
      isBillableTenantApiRequest(
        'GET',
        '/api/v1/tenant/usage-summary?period=2026-09',
      ),
    ).toBe(false);
    expect(
      isBillableTenantApiRequest('GET', '/api/v1/tenant/billing/records'),
    ).toBe(false);
  });

  it('excludes health and subscription/entitlement views', () => {
    expect(isBillableTenantApiRequest('GET', '/health')).toBe(false);
    expect(isBillableTenantApiRequest('GET', '/healthz')).toBe(false);
    expect(
      isBillableTenantApiRequest(
        'GET',
        '/platform-admin/subscription/entitlement',
      ),
    ).toBe(false);
    expect(
      isBillableTenantApiRequest(
        'GET',
        '/platform-admin/subscription/reconciliation',
      ),
    ).toBe(false);
  });

  it('excludes provider callback and delivery-receipt paths', () => {
    expect(isBillableTenantApiRequest('GET', '/api/v1/provider-callback')).toBe(
      false,
    );
    expect(
      isBillableTenantApiRequest('POST', '/api/v1/provider-callback'),
    ).toBe(false);
    expect(isBillableTenantApiRequest('GET', '/api/v1/delivery-receipt')).toBe(
      false,
    );
    expect(isBillableTenantApiRequest('GET', '/webhooks/telegram')).toBe(false);
  });

  it('excludes auth endpoints from quota gating (catch-22 guard)', () => {
    expect(isBillableTenantApiRequest('POST', '/api/v1/auth/login')).toBe(
      false,
    );
    expect(
      isBillableTenantApiRequest('POST', '/api/v1/auth/password-reset/request'),
    ).toBe(false);
    expect(isBillableTenantApiRequest('GET', '/api/v1/auth/profile')).toBe(
      false,
    );
  });

  it('excludes the billing checkout flow (first purchase without a period)', () => {
    expect(
      isBillableTenantApiRequest(
        'POST',
        '/api/v1/tenant/billing/purchase-requests',
      ),
    ).toBe(false);
    expect(
      isBillableTenantApiRequest(
        'POST',
        '/api/v1/tenant/billing/55ece265-59f2-4335-b271-240a59daf2d3/payment-proof',
      ),
    ).toBe(false);
    expect(
      isBillableTenantApiRequest(
        'POST',
        '/api/v1/tenant/billing/plan-change-requests',
      ),
    ).toBe(false);
    expect(
      isBillableTenantApiRequest(
        'POST',
        '/api/v1/tenant/billing/plan-change-requests/req-1/cancel',
      ),
    ).toBe(false);
    expect(
      isBillableTenantApiRequest('POST', '/api/v1/tenant/add-on-purchases'),
    ).toBe(false);
    expect(
      isBillableTenantApiRequest('POST', '/api/v1/media/uploads/billing-proof'),
    ).toBe(false);
    expect(
      isBillableTenantApiRequest(
        'GET',
        '/api/v1/media/billing-proof/proof-1/download-url',
      ),
    ).toBe(false);
  });

  it('excludes the add-on catalog (read-only pre-purchase infrastructure)', () => {
    expect(
      isBillableTenantApiRequest('GET', '/api/v1/tenant/add-on-products'),
    ).toBe(false);
    expect(
      isBillableTenantApiRequest(
        'GET',
        '/api/v1/tenant/add-on-products?page=2',
      ),
    ).toBe(false);
    // Purchase mutation still billable
    expect(
      isBillableTenantApiRequest('POST', '/api/v1/tenant/add-on-purchases'),
    ).toBe(false);
  });

  it('excludes the provider capability probe (must answer without an active period)', () => {
    expect(
      isBillableTenantApiRequest('GET', '/api/v1/tenant/providers/allowed'),
    ).toBe(false);
    expect(isBillableTenantApiRequest('GET', '/tenant/providers/allowed')).toBe(
      false,
    );
  });

  it('keeps mutations and data-producing reads billable', () => {
    expect(isBillableTenantApiRequest('POST', '/api/v1/tenant/messages')).toBe(
      true,
    );
    expect(isBillableTenantApiRequest('GET', '/api/v1/tenant/csrs')).toBe(true);
    expect(
      isBillableTenantApiRequest('GET', '/api/v1/tenant/conversations'),
    ).toBe(true);
    // Product mutations (messages, channels, media uploads) stay billable.
    expect(isBillableTenantApiRequest('POST', '/api/v1/tenant/channels')).toBe(
      true,
    );
    expect(isBillableTenantApiRequest('POST', '/api/v1/media/uploads')).toBe(
      true,
    );
  });

  it('excludes infrastructure methods', () => {
    expect(isBillableTenantApiRequest('OPTIONS', '/api/v1/tenant/csrs')).toBe(
      false,
    );
    expect(isBillableTenantApiRequest('HEAD', '/health')).toBe(false);
  });
});
