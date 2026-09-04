import type { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import type { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import {
  summarizeBillingLinkage,
  validatePeriodBillingLinkage,
} from './subscription-period-billing-linkage.util';

function makePeriod(
  overrides: Partial<TenantSubscriptionPeriod> = {},
): TenantSubscriptionPeriod {
  return {
    id: 'period-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    billingRecordId: 'billing-1',
    periodType: 'paid',
    periodStatus: 'active',
    paymentStatus: 'paid',
    periodStartAt: new Date('2026-08-31T17:30:00.000Z'),
    periodEndAt: new Date('2026-09-30T17:30:00.000Z'),
    sequenceNumber: 1,
    ...overrides,
  } as TenantSubscriptionPeriod;
}

function makeBillingRecord(
  overrides: Partial<TenantBillingRecord> = {},
): TenantBillingRecord {
  return {
    id: 'billing-1',
    tenantId: 'tenant-1',
    subscriptionPlanId: 'plan-1',
    paymentStatus: 'paid',
    billingPeriodStart: new Date('2026-08-01'),
    billingPeriodEnd: new Date('2026-09-30'),
    ...overrides,
  } as TenantBillingRecord;
}

describe('validatePeriodBillingLinkage', () => {
  it('accepts a paid period whose record matches tenant, plan, and window', () => {
    const result = validatePeriodBillingLinkage({
      period: makePeriod(),
      billingRecord: makeBillingRecord(),
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('flags a paid period with no billing_record_id', () => {
    const result = validatePeriodBillingLinkage({
      period: makePeriod({ billingRecordId: null }),
      billingRecord: null,
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('missing_billing_record');
  });

  it('flags a record that belongs to another tenant', () => {
    const result = validatePeriodBillingLinkage({
      period: makePeriod(),
      billingRecord: makeBillingRecord({ tenantId: 'tenant-2' }),
    });
    expect(result.issues.map((i) => i.code)).toContain(
      'cross_tenant_billing_record',
    );
  });

  it('flags a plan mismatch', () => {
    const result = validatePeriodBillingLinkage({
      period: makePeriod(),
      billingRecord: makeBillingRecord({ subscriptionPlanId: 'plan-2' }),
    });
    expect(result.issues.map((i) => i.code)).toContain('plan_mismatch');
  });

  it('flags a paid period backed by an unpaid billing record', () => {
    const result = validatePeriodBillingLinkage({
      period: makePeriod(),
      billingRecord: makeBillingRecord({ paymentStatus: 'unpaid' }),
    });
    expect(result.issues.map((i) => i.code)).toContain('payment_mismatch');
  });

  it('flags a period window not covered by the billing record', () => {
    const result = validatePeriodBillingLinkage({
      period: makePeriod({
        periodStartAt: new Date('2026-08-31T17:30:00.000Z'),
        periodEndAt: new Date('2026-11-30T17:30:00.000Z'), // spans 3 months
      }),
      billingRecord: makeBillingRecord({
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-09-30'),
      }),
    });
    expect(result.issues.map((i) => i.code)).toContain('window_mismatch');
  });
});

describe('summarizeBillingLinkage', () => {
  it('counts valid periods and returns exceptions with details', () => {
    const paidRecord = makeBillingRecord();
    const summary = summarizeBillingLinkage({
      periods: [
        makePeriod({ id: 'period-ok' }),
        makePeriod({ id: 'period-bad', billingRecordId: null }),
      ],
      billingRecordById: new Map([['billing-1', paidRecord]]),
    });

    expect(summary.validCount).toBe(1);
    expect(summary.exceptionCount).toBe(1);
    expect(summary.exceptions[0].periodId).toBe('period-bad');
    expect(summary.exceptions[0].issues[0].code).toBe('missing_billing_record');
  });
});
