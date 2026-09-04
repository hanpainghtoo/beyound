import type { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { validatePurchaseBillingLinkage } from './subscription-add-on-purchase-billing-linkage.util';

type PurchaseLike = Parameters<
  typeof validatePurchaseBillingLinkage
>[0]['purchase'];

// Real Yangon instants: Sep 1 00:00 Yangon == Aug 31 17:30 UTC, and the
// exclusive month end Oct 1 00:00 Yangon == Sep 30 17:30 UTC. The date-typed
// billing record covers the inclusive calendar days Sep 1–Sep 30.
const SEP_YANGON_START = new Date('2026-08-31T17:30:00.000Z');
const OCT_YANGON_START = new Date('2026-09-30T17:30:00.000Z');

function makePurchase(overrides: Partial<PurchaseLike> = {}): PurchaseLike {
  return {
    id: 'purchase-1',
    tenantId: 'tenant-1',
    billingRecordId: 'billing-1',
    paymentStatus: 'paid',
    effectiveAt: SEP_YANGON_START,
    expiresAt: OCT_YANGON_START,
    ...overrides,
  };
}

function makeBillingRecord(
  overrides: Partial<TenantBillingRecord> = {},
): TenantBillingRecord {
  return {
    id: 'billing-1',
    tenantId: 'tenant-1',
    subscriptionPlanId: 'plan-1',
    paymentStatus: 'paid',
    billingPeriodStart: new Date('2026-09-01'),
    billingPeriodEnd: new Date('2026-09-30'),
    ...overrides,
  } as TenantBillingRecord;
}

describe('validatePurchaseBillingLinkage (task 4.1)', () => {
  it('accepts a same-tenant paid billing record covering the purchase window', () => {
    const result = validatePurchaseBillingLinkage({
      purchase: makePurchase(),
      billingRecord: makeBillingRecord(),
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('rejects a cross-tenant billing record', () => {
    const result = validatePurchaseBillingLinkage({
      purchase: makePurchase(),
      billingRecord: makeBillingRecord({ tenantId: 'tenant-2' }),
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('cross_tenant_billing_record');
  });

  it('rejects a paid purchase whose billing record is unpaid', () => {
    const result = validatePurchaseBillingLinkage({
      purchase: makePurchase(),
      billingRecord: makeBillingRecord({ paymentStatus: 'unpaid' }),
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('payment_mismatch');
  });

  it('rejects a billing window that does not cover the purchase window', () => {
    const result = validatePurchaseBillingLinkage({
      purchase: makePurchase(),
      billingRecord: makeBillingRecord({
        billingPeriodStart: new Date('2026-10-01'),
        billingPeriodEnd: new Date('2026-10-31'),
      }),
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('window_mismatch');
  });

  it('flags a referenced billing record that does not exist', () => {
    const result = validatePurchaseBillingLinkage({
      purchase: makePurchase(),
      billingRecord: null,
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('cross_tenant_billing_record');
  });

  it('allows an explicit operator grant without a billing record (pending purchase)', () => {
    const result = validatePurchaseBillingLinkage({
      purchase: makePurchase({
        billingRecordId: null,
        paymentStatus: 'pending',
      }),
      billingRecord: null,
    });
    expect(result.valid).toBe(true);
  });
});
