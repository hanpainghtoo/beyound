import type { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { yangonCalendarDate } from '../subscription-period/yangon-month.util';
import type { TenantSubscriptionAddOnPurchase } from './entities/tenant-subscription-add-on-purchase.entity';

/**
 * Authoritative top-up billing linkage (Plan 9 Phase 4, task 4.1).
 *
 * Per the Phase 0.5 billing-authority decision, a purchased top-up bundle may
 * carry `billing_record_id` as its payment/invoice evidence. When present it
 * must satisfy the same contract the period linkage util enforces:
 *   - the billing record belongs to the same tenant (never cross-tenant);
 *   - a paid purchase must reference a billing record that is itself paid;
 *   - the billing record's date window covers the purchase's effective window
 *     (compared through the Yangon calendar date so timezone drift cannot
 *     falsely pass or fail the check).
 *
 * A purchase without a billing record is allowed only as an explicit operator
 * grant (no automatic payment evidence). The validation below produces a
 * deterministic report so confirm/payment code and Phase 10 reconciliation can
 * depend on the same contract.
 */

export type PurchaseBillingLinkageIssueCode =
  | 'cross_tenant_billing_record'
  | 'payment_mismatch'
  | 'window_mismatch';

export type PurchaseBillingLinkageIssue = {
  code: PurchaseBillingLinkageIssueCode;
  detail: string;
};

export type PurchaseBillingLinkageValidation = {
  purchaseId: string;
  tenantId: string;
  valid: boolean;
  issues: PurchaseBillingLinkageIssue[];
};

export function validatePurchaseBillingLinkage(input: {
  purchase: Pick<
    TenantSubscriptionAddOnPurchase,
    'id' | 'tenantId' | 'billingRecordId' | 'paymentStatus'
  > & { effectiveAt?: Date | null; expiresAt?: Date | null };
  billingRecord: TenantBillingRecord | null;
}): PurchaseBillingLinkageValidation {
  const { purchase } = input;
  const billingRecord = input.billingRecord ?? null;
  const issues: PurchaseBillingLinkageIssue[] = [];

  if (purchase.billingRecordId && !billingRecord) {
    issues.push({
      code: 'cross_tenant_billing_record',
      detail: `Purchase ${purchase.id} references billing_record_id ${purchase.billingRecordId} but no such record exists.`,
    });
  } else if (purchase.billingRecordId && billingRecord) {
    if (billingRecord.tenantId !== purchase.tenantId) {
      issues.push({
        code: 'cross_tenant_billing_record',
        detail: `Billing record ${billingRecord.id} belongs to tenant ${billingRecord.tenantId}, purchase expects ${purchase.tenantId}.`,
      });
    }
    if (
      purchase.paymentStatus === 'paid' &&
      billingRecord.paymentStatus !== 'paid'
    ) {
      issues.push({
        code: 'payment_mismatch',
        detail: `Purchase ${purchase.id} is paid but billing record ${billingRecord.id} has payment status '${billingRecord.paymentStatus}'.`,
      });
    }
    if (purchase.effectiveAt && purchase.expiresAt) {
      const recordStart = new Date(billingRecord.billingPeriodStart).getTime();
      const recordEnd = new Date(billingRecord.billingPeriodEnd).getTime();
      const purchaseStartDate = yangonCalendarDate(
        purchase.effectiveAt,
      ).getTime();
      // The exclusive expiresAt instant's *last inclusive calendar day* is the
      // day before the boundary, which is what a date-typed billing end
      // represents (e.g. Sep 30 covers a purchase expiring Oct 1 Yangon).
      const purchaseLastDay = yangonCalendarDate(
        new Date(purchase.expiresAt.getTime() - 1),
      ).getTime();
      if (purchaseStartDate < recordStart || purchaseLastDay > recordEnd) {
        issues.push({
          code: 'window_mismatch',
          detail: `Purchase [${purchase.effectiveAt.toISOString()}, ${purchase.expiresAt.toISOString()}) is not covered by billing record [${billingRecord.billingPeriodStart.toISOString()}, ${billingRecord.billingPeriodEnd.toISOString()}].`,
        });
      }
    }
  }

  return {
    purchaseId: purchase.id,
    tenantId: purchase.tenantId,
    valid: issues.length === 0,
    issues,
  };
}
