import type { EntityManager } from 'typeorm';

import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import type { BillingReviewStatus } from '../platform-admin/entities/tenant-billing-record.entity';
import type { SubscriptionPlan } from './entities/subscription-plan.entity';

export type CreateSubscriptionBillingRecordInput = {
  tenantId: string;
  plan: SubscriptionPlan;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  amountDue?: number;
  amountPaid?: number;
  reviewStatus?: BillingReviewStatus;
  paidAt?: Date | null;
  issueDate?: Date | null;
  requestedBy?: string | null;
  billingAccountId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export async function allocateSequentialInvoiceNo(
  manager: EntityManager,
): Promise<string> {
  const queryable = manager as unknown as {
    query?: (sql: string) => Promise<Array<{ n: unknown }>>;
  };
  if (typeof queryable.query !== 'function') {
    return `INV-T${Date.now().toString(36).toUpperCase()}`;
  }
  const rows = await queryable.query(
    `SELECT nextval('"billing_invoice_no_seq"') AS "n"`,
  );
  return `INV-${String(Number(rows?.[0]?.n ?? 0)).padStart(5, '0')}`;
}

/** Shared invoice-record creation for subscription purchases and trials. */
export async function createSubscriptionBillingRecord(
  manager: EntityManager,
  input: CreateSubscriptionBillingRecordInput,
) {
  const amountDue = Number(input.amountDue ?? input.plan.monthlyPrice ?? 0);
  const amountPaid = Number(input.amountPaid ?? 0);
  const repository = manager.getRepository(TenantBillingRecord);
  const record = repository.create({
    tenantId: input.tenantId,
    subscriptionPlanId: input.plan.id,
    invoiceNo: await allocateSequentialInvoiceNo(manager),
    requestedBy: input.requestedBy ?? null,
    billingAccountId: input.billingAccountId ?? null,
    billingPeriodStart: input.billingPeriodStart,
    billingPeriodEnd: input.billingPeriodEnd,
    reviewStatus: input.reviewStatus ?? 'in_review',
    amountDue,
    amountPaid,
    currency: 'MMK',
    issueDate: input.issueDate ?? input.billingPeriodStart,
    paidAt: input.paidAt ?? null,
    notes: input.notes ?? null,
    metadata: input.metadata ?? {},
  });
  return repository.save(record);
}
