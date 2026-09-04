import type { DataSource, EntityManager } from 'typeorm';

import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import { SubscriptionPeriodEvent } from './entities/subscription-period-event.entity';
import {
  buildQuotaSnapshot,
  type SubscriptionQuotaSnapshot,
} from './subscription-period.types';
import { approvedYangonCutoverBoundary } from './subscription-period-cutover.util';
import { isCalendarMonthAligned } from './yangon-month.util';

export type BackfillSourcePrecedence =
  | 'billing_record'
  | 'entitlement'
  | 'tenant_plan';

export type BackfillSkipReason =
  | 'no_entitlement'
  | 'not_paid_active'
  | 'already_has_period'
  | 'missing_plan';

export type BackfillDecision =
  | {
      action: 'create';
      tenantId: string;
      planId: string;
      billingRecordId: string | null;
      periodStartAt: Date;
      periodEndAt: Date;
      durationDays: number;
      quotaSnapshot: SubscriptionQuotaSnapshot;
      sourcePrecedence: BackfillSourcePrecedence;
      matchedBillingRecord: boolean;
    }
  | {
      action: 'skip';
      tenantId: string;
      reason: BackfillSkipReason;
      detail?: string;
    };

export type BackfillReport = {
  reportType: 'subscription_period_backfill';
  format: 'safe_json';
  generatedAt: string;
  cutoverTimestamp: string;
  sourcePrecedence: BackfillSourcePrecedence[];
  created: Array<{
    tenantId: string;
    tenantCode: string;
    periodId: string;
    planId: string;
    sourcePrecedence: BackfillSourcePrecedence;
    billingRecordId: string | null;
    periodStartAt: string;
    periodEndAt: string;
    durationDays: number;
  }>;
  skipped: Array<{
    tenantId: string;
    tenantCode: string;
    reason: BackfillSkipReason;
    detail?: string;
  }>;
  reconciliationExceptions: Array<{
    tenantId: string;
    tenantCode: string;
    issue: string;
  }>;
  summary: {
    tenantsScanned: number;
    created: number;
    skipped: number;
    reconciliationExceptions: number;
  };
};

function matchesEntitlementDates(
  record: TenantBillingRecord,
  paidPeriodStartsAt: Date | null,
  paidPeriodEndsAt: Date | null,
): boolean {
  if (!paidPeriodStartsAt || !paidPeriodEndsAt) return false;
  return (
    new Date(record.billingPeriodStart).getTime() ===
      new Date(paidPeriodStartsAt).getTime() &&
    new Date(record.billingPeriodEnd).getTime() ===
      new Date(paidPeriodEndsAt).getTime()
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Pure decision logic for one tenant. Kept separate from DB access so the
 * backfill behavior is unit-testable without a live database.
 *
 * Source precedence for the single current paid period:
 *   1. a confirmed paid billing record matching the entitlement's plan and
 *      period dates;
 *   2. the paid entitlement's own period dates;
 *   3. the tenant's subscription dates (with plan duration fallback).
 */
export function decideBackfillForTenant(input: {
  tenant: Tenant;
  entitlement: TenantEntitlement | null;
  plan: SubscriptionPlan | null;
  paidBillingRecords: TenantBillingRecord[];
  hasExistingPeriod: boolean;
}): BackfillDecision {
  const { tenant, entitlement, plan, paidBillingRecords, hasExistingPeriod } =
    input;

  if (!entitlement) {
    return { action: 'skip', tenantId: tenant.id, reason: 'no_entitlement' };
  }
  if (entitlement.state !== 'paid_active') {
    return {
      action: 'skip',
      tenantId: tenant.id,
      reason: 'not_paid_active',
      detail: `entitlement state is ${entitlement.state}`,
    };
  }
  if (hasExistingPeriod) {
    return {
      action: 'skip',
      tenantId: tenant.id,
      reason: 'already_has_period',
    };
  }
  const planId = entitlement.planId || tenant.subscriptionPlanId || null;
  const activePlan = planId ? plan : null;
  if (!activePlan) {
    return {
      action: 'skip',
      tenantId: tenant.id,
      reason: 'missing_plan',
      detail: `no plan resolved for planId ${planId || 'null'}`,
    };
  }

  // Precedence 1: confirmed paid billing record matching plan + dates.
  const matchingPaidRecord = paidBillingRecords.find(
    (record) =>
      record.paymentStatus === 'paid' &&
      record.subscriptionPlanId === entitlement.planId &&
      matchesEntitlementDates(
        record,
        entitlement.paidPeriodStartsAt,
        entitlement.paidPeriodEndsAt,
      ),
  );

  if (matchingPaidRecord) {
    return {
      action: 'create',
      tenantId: tenant.id,
      planId: entitlement.planId,
      billingRecordId: matchingPaidRecord.id,
      periodStartAt: new Date(matchingPaidRecord.billingPeriodStart),
      periodEndAt: new Date(matchingPaidRecord.billingPeriodEnd),
      durationDays: activePlan.durationDays,
      quotaSnapshot: buildQuotaSnapshot(activePlan),
      sourcePrecedence: 'billing_record',
      matchedBillingRecord: true,
    };
  }

  // Precedence 2: paid entitlement dates.
  if (entitlement.paidPeriodStartsAt && entitlement.paidPeriodEndsAt) {
    return {
      action: 'create',
      tenantId: tenant.id,
      planId: entitlement.planId,
      billingRecordId: null,
      periodStartAt: new Date(entitlement.paidPeriodStartsAt),
      periodEndAt: new Date(entitlement.paidPeriodEndsAt),
      durationDays: activePlan.durationDays,
      quotaSnapshot: buildQuotaSnapshot(activePlan),
      sourcePrecedence: 'entitlement',
      matchedBillingRecord: false,
    };
  }

  // Precedence 3: tenant subscription dates with plan-duration fallback.
  const start = tenant.subscriptionStartDate
    ? new Date(tenant.subscriptionStartDate)
    : new Date();
  const end = tenant.subscriptionEndDate
    ? new Date(tenant.subscriptionEndDate)
    : addUtcDays(start, activePlan.durationDays);
  return {
    action: 'create',
    tenantId: tenant.id,
    planId: entitlement.planId,
    billingRecordId: null,
    periodStartAt: start,
    periodEndAt: end,
    durationDays: activePlan.durationDays,
    quotaSnapshot: buildQuotaSnapshot(activePlan),
    sourcePrecedence: 'tenant_plan',
    matchedBillingRecord: false,
  };
}

/**
 * Orchestrates the one-time backfill. Safe to run repeatedly: tenants that
 * already have a period row (or an applied idempotency event) are skipped and
 * reported rather than double-created.
 */
export async function backfillSubscriptionPeriods(
  dataSource: DataSource,
  options: { now?: Date } = {},
): Promise<BackfillReport> {
  const now = options.now ?? new Date();
  const cutoverTimestamp = now.toISOString();
  const manager = dataSource.manager;

  const report: BackfillReport = {
    reportType: 'subscription_period_backfill',
    format: 'safe_json',
    generatedAt: new Date().toISOString(),
    cutoverTimestamp,
    sourcePrecedence: ['billing_record', 'entitlement', 'tenant_plan'],
    created: [],
    skipped: [],
    reconciliationExceptions: [],
    summary: {
      tenantsScanned: 0,
      created: 0,
      skipped: 0,
      reconciliationExceptions: 0,
    },
  };

  const tenants = await manager.find(Tenant, {
    select: [
      'id',
      'tenantCode',
      'companyName',
      'status',
      'subscriptionPlanId',
      'subscriptionStartDate',
      'subscriptionEndDate',
    ],
  });
  report.summary.tenantsScanned = tenants.length;

  for (const tenant of tenants) {
    const [entitlement, existingPeriods, paidBillingRecords] =
      await Promise.all([
        manager.findOne(TenantEntitlement, { where: { tenantId: tenant.id } }),
        manager.find(TenantSubscriptionPeriod, {
          where: { tenantId: tenant.id },
          take: 1,
          select: ['id'],
        }),
        manager.find(TenantBillingRecord, {
          where: { tenantId: tenant.id, paymentStatus: 'paid' },
        }),
      ]);

    const planId = entitlement?.planId || tenant.subscriptionPlanId || null;
    const plan = planId
      ? await manager.findOne(SubscriptionPlan, { where: { id: planId } })
      : null;

    const decision = decideBackfillForTenant({
      tenant,
      entitlement,
      plan,
      paidBillingRecords,
      hasExistingPeriod: existingPeriods.length > 0,
    });

    if (decision.action === 'skip') {
      report.skipped.push({
        tenantId: decision.tenantId,
        tenantCode: tenant.tenantCode,
        reason: decision.reason,
        detail: decision.detail,
      });
      report.summary.skipped += 1;
      continue;
    }

    const applied = await applyBackfill(manager, decision, cutoverTimestamp);
    if (applied === 'already-applied') {
      report.skipped.push({
        tenantId: decision.tenantId,
        tenantCode: tenant.tenantCode,
        reason: 'already_has_period',
        detail: 'idempotency event already present',
      });
      report.summary.skipped += 1;
      continue;
    }

    report.created.push({
      tenantId: decision.tenantId,
      tenantCode: tenant.tenantCode,
      periodId: applied.periodId,
      planId: decision.planId,
      sourcePrecedence: decision.sourcePrecedence,
      billingRecordId: decision.billingRecordId,
      periodStartAt: decision.periodStartAt.toISOString(),
      periodEndAt: decision.periodEndAt.toISOString(),
      durationDays: decision.durationDays,
    });
    report.summary.created += 1;

    if (!decision.matchedBillingRecord) {
      report.reconciliationExceptions.push({
        tenantId: decision.tenantId,
        tenantCode: tenant.tenantCode,
        issue:
          'No confirmed paid billing record matched the paid entitlement plan/period; period dates came from a lower-precedence source.',
      });
      report.summary.reconciliationExceptions += 1;
    }
  }

  return report;
}

async function applyBackfill(
  manager: EntityManager,
  decision: Extract<BackfillDecision, { action: 'create' }>,
  cutoverTimestamp: string,
): Promise<{ periodId: string } | 'already-applied'> {
  const idempotencyKey = `backfill:period:${decision.tenantId}`;
  const existingEvent = await manager.findOne(SubscriptionPeriodEvent, {
    where: { idempotencyKey, tenantId: decision.tenantId },
    select: ['id'],
  });
  if (existingEvent) return 'already-applied';

  return manager.transaction(async (transactionalManager) => {
    const alreadyCreated = await transactionalManager
      .getRepository(TenantSubscriptionPeriod)
      .createQueryBuilder('period')
      .where('period.tenant_id = :tenantId', { tenantId: decision.tenantId })
      .getCount();
    if (alreadyCreated > 0) return 'already-applied';

    // Plan 9 Phase 2 task 2.6: mark legacy/non-monthly backfilled rows with
    // explicit transition metadata instead of silently rewriting their dates
    // or snapshots into calendar-month contracts. The forward-only cutover
    // (task 2.7) consumes this marker to schedule the Yangon-boundary
    // transition while preserving the row as evidence.
    const calendarAligned = isCalendarMonthAligned(
      decision.periodStartAt,
      decision.periodEndAt,
    );
    const metadata: Record<string, unknown> = {
      source: 'backfill',
      sourcePrecedence: decision.sourcePrecedence,
      cutoverTimestamp,
      legacyNonMonthly: !calendarAligned,
    };
    if (!calendarAligned) {
      metadata.transition = {
        kind: 'yangon_cutover',
        boundary: approvedYangonCutoverBoundary().toISOString(),
        plannedAction: 'expire_at_boundary_and_start_monthly',
        note: 'Legacy Plan 8 backfilled period; dates and quota snapshot preserved as-is.',
      };
    }

    const period = transactionalManager
      .getRepository(TenantSubscriptionPeriod)
      .create({
        tenantId: decision.tenantId,
        planId: decision.planId,
        billingRecordId: decision.billingRecordId,
        periodType: 'paid',
        periodStatus: 'active',
        paymentStatus: 'paid',
        durationDays: decision.durationDays,
        periodStartAt: decision.periodStartAt,
        periodEndAt: decision.periodEndAt,
        scheduledStartAt: decision.periodStartAt,
        scheduledEndAt: decision.periodEndAt,
        activatedAt: new Date(cutoverTimestamp),
        activationReason: 'initial',
        sequenceNumber: 1,
        quotaSnapshot: decision.quotaSnapshot,
        metadata,
      });
    const savedPeriod = await transactionalManager
      .getRepository(TenantSubscriptionPeriod)
      .save(period);

    await transactionalManager.getRepository(SubscriptionPeriodEvent).save(
      transactionalManager.getRepository(SubscriptionPeriodEvent).create({
        subscriptionPeriodId: savedPeriod.id,
        tenantId: decision.tenantId,
        eventType: 'period_backfilled',
        previousStatus: null,
        newStatus: 'active',
        actorType: 'system',
        actorId: 'period-backfill',
        source: 'backfill',
        reason:
          'Initial active purchased period backfilled from paid entitlement',
        idempotencyKey,
        metadata: {
          cutoverTimestamp,
          sourcePrecedence: decision.sourcePrecedence,
          billingRecordId: decision.billingRecordId,
          legacyNonMonthly: !isCalendarMonthAligned(
            decision.periodStartAt,
            decision.periodEndAt,
          ),
        },
      }),
    );

    return { periodId: savedPeriod.id };
  });
}
