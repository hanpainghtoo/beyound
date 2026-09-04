import type { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import type { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import { yangonCalendarDate } from './yangon-month.util';

/**
 * Authoritative billing linkage (Plan 9 Phase 2, task 2.9).
 *
 * Per the Phase 0.5 decision, `tenant_subscription_periods.billing_record_id`
 * is the authoritative required relationship: a purchased period must point at
 * the billing record that paid for it, and the record must belong to the same
 * tenant/plan and cover the period window. The validation below produces a
 * deterministic report so new purchase code (Phase 4+) can depend on the
 * contract, and legacy rows that cannot satisfy it are surfaced as
 * reconciliation exceptions instead of being silently rewritten.
 */

export type BillingLinkageIssueCode =
  | 'missing_billing_record'
  | 'cross_tenant_billing_record'
  | 'plan_mismatch'
  | 'payment_mismatch'
  | 'window_mismatch';

export type BillingLinkageIssue = {
  code: BillingLinkageIssueCode;
  detail: string;
};

export type BillingLinkageValidation = {
  periodId: string;
  tenantId: string;
  valid: boolean;
  issues: BillingLinkageIssue[];
};

export function validatePeriodBillingLinkage(input: {
  period: TenantSubscriptionPeriod;
  billingRecord: TenantBillingRecord | null;
  now?: Date;
}): BillingLinkageValidation {
  const { period } = input;
  const billingRecord = input.billingRecord ?? null;
  const issues: BillingLinkageIssue[] = [];

  if (!period.billingRecordId) {
    issues.push({
      code: 'missing_billing_record',
      detail: `Period ${period.id} has no billing_record_id; a paid period must reference its confirmed billing record.`,
    });
  } else if (!billingRecord) {
    issues.push({
      code: 'missing_billing_record',
      detail: `Period ${period.id} references billing_record_id ${period.billingRecordId} but no such record exists.`,
    });
  } else {
    if (billingRecord.tenantId !== period.tenantId) {
      issues.push({
        code: 'cross_tenant_billing_record',
        detail: `Billing record ${billingRecord.id} belongs to tenant ${billingRecord.tenantId}, period expects ${period.tenantId}.`,
      });
    }
    if (
      billingRecord.subscriptionPlanId &&
      period.planId !== billingRecord.subscriptionPlanId
    ) {
      issues.push({
        code: 'plan_mismatch',
        detail: `Billing record ${billingRecord.id} is for plan ${billingRecord.subscriptionPlanId}, period ${period.id} expects ${period.planId}.`,
      });
    }
    if (
      period.paymentStatus === 'paid' &&
      billingRecord.paymentStatus !== 'paid'
    ) {
      issues.push({
        code: 'payment_mismatch',
        detail: `Period ${period.id} is paid but billing record ${billingRecord.id} has payment status '${billingRecord.paymentStatus}'.`,
      });
    }
    if (period.periodStartAt && period.periodEndAt) {
      // Billing bounds are date-typed (calendar days); period bounds are
      // Yangon instants. Compare via the Yangon calendar date so a period
      // month is covered by the billing record whose date range spans it.
      const recordStart = new Date(billingRecord.billingPeriodStart).getTime();
      const recordEnd = new Date(billingRecord.billingPeriodEnd).getTime();
      const periodStartDate = yangonCalendarDate(
        period.periodStartAt,
      ).getTime();
      // The exclusive period end's *last inclusive calendar day* is the day
      // before the boundary instant, which is what a date-typed billing end
      // represents (e.g. Sep 30 covers a period ending Oct 1 Yangon).
      const periodLastDay = yangonCalendarDate(
        new Date(period.periodEndAt.getTime() - 1),
      ).getTime();
      if (periodStartDate < recordStart || periodLastDay > recordEnd) {
        issues.push({
          code: 'window_mismatch',
          detail: `Period [${period.periodStartAt.toISOString()}, ${period.periodEndAt.toISOString()}) is not covered by billing record [${billingRecord.billingPeriodStart.toISOString()}, ${billingRecord.billingPeriodEnd.toISOString()}].`,
        });
      }
    }
  }

  return {
    periodId: period.id,
    tenantId: period.tenantId,
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Validate every provided period against its resolved billing record. Used by
 * the cutover/reconciliation report and Phase 10 reconciliation checks.
 */
export function summarizeBillingLinkage(input: {
  periods: TenantSubscriptionPeriod[];
  billingRecordById: Map<string, TenantBillingRecord>;
}): {
  validCount: number;
  exceptionCount: number;
  exceptions: BillingLinkageValidation[];
} {
  const exceptions: BillingLinkageValidation[] = [];
  let validCount = 0;

  for (const period of input.periods) {
    const billingRecord = period.billingRecordId
      ? (input.billingRecordById.get(period.billingRecordId) ?? null)
      : null;
    const result = validatePeriodBillingLinkage({
      period,
      billingRecord,
    });
    if (result.valid) validCount += 1;
    else exceptions.push(result);
  }

  return {
    validCount,
    exceptionCount: exceptions.length,
    exceptions,
  };
}
