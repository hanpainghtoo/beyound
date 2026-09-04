import type { DataSource, EntityManager } from 'typeorm';

import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import { SubscriptionPeriodEvent } from './entities/subscription-period-event.entity';
import {
  buildQuotaSnapshot,
  type SubscriptionPeriodPaymentStatus,
} from './subscription-period.types';
import { validatePeriodBillingLinkage } from './subscription-period-billing-linkage.util';
import {
  isCalendarMonthAligned,
  yangonCalendarDate,
  yangonMonthStart,
  yangonNextMonthStart,
  yangonWallClockToUtc,
} from './yangon-month.util';

/**
 * Approved forward-only cutover boundary (Phase 0.7 decision): the first
 * Yangon calendar month after the legacy non-monthly periods, i.e.
 * 2026-09-01 00:00:00 Asia/Yangon. All legacy non-monthly active rows expire
 * at this boundary and a fresh calendar-month period takes over. Historical
 * rows are preserved as evidence, never rewritten.
 */
export function approvedYangonCutoverBoundary(): Date {
  return yangonWallClockToUtc(2026, 9, 1, 0, 0, 0);
}

export type CutoverSkipReason =
  | 'no_active_paid_period'
  | 'trial_period'
  | 'monthly_aligned'
  | 'already_transitioned'
  | 'missing_plan';

export type CutoverDecision =
  | {
      action: 'skip';
      tenantId: string;
      reason: CutoverSkipReason;
      detail?: string;
    }
  | {
      action: 'create_next_monthly';
      tenantId: string;
      planId: string;
      legacyPeriodId: string;
      monthStartAt: Date;
      monthEndAt: Date;
      paymentStatus: SubscriptionPeriodPaymentStatus;
      billingRecordId: string | null;
      billingNotes: string[];
    };

/**
 * Pure decision for one tenant (Plan 9 Phase 2 task 2.7). Forward-only and
 * idempotent by construction: a tenant whose active period is already a
 * calendar month, or that already has a period covering the boundary month,
 * is skipped and reported.
 */
export function decideCutoverForTenant(input: {
  tenantId: string;
  activePeriods: TenantSubscriptionPeriod[];
  allPeriods: TenantSubscriptionPeriod[];
  plan: SubscriptionPlan | null;
  paidBillingRecords: TenantBillingRecord[];
  boundary: Date;
}): CutoverDecision {
  const {
    tenantId,
    activePeriods,
    allPeriods,
    plan,
    paidBillingRecords,
    boundary,
  } = input;

  const activePaid = activePeriods.filter(
    (period) => period.periodType === 'paid' && period.paymentStatus === 'paid',
  );

  if (activePaid.length === 0) {
    const trialOnly = activePeriods.some(
      (period) => period.periodType === 'trial',
    );
    return {
      action: 'skip',
      tenantId,
      reason: trialOnly ? 'trial_period' : 'no_active_paid_period',
    };
  }

  // One-active partial unique index guarantees at most one active row; the
  // first one is authoritative if a violation somehow pre-exists.
  const legacyActive = activePaid[0];

  if (
    isCalendarMonthAligned(legacyActive.periodStartAt, legacyActive.periodEndAt)
  ) {
    return { action: 'skip', tenantId, reason: 'monthly_aligned' };
  }

  if (!plan) {
    return {
      action: 'skip',
      tenantId,
      reason: 'missing_plan',
      detail:
        'Legacy active paid period has no resolvable plan for the next monthly period.',
    };
  }

  const monthStartAt = yangonMonthStart(boundary);
  const monthEndAt = yangonNextMonthStart(boundary);

  const alreadyCoversBoundary = allPeriods.some(
    (period) =>
      period.monthStartAt &&
      period.monthEndAt &&
      period.monthStartAt.getTime() <= boundary.getTime() &&
      period.monthEndAt.getTime() > boundary.getTime(),
  );
  if (alreadyCoversBoundary) {
    return { action: 'skip', tenantId, reason: 'already_transitioned' };
  }

  // The new monthly period must be covered by a confirmed paid billing record
  // covering its Yangon window; otherwise it is queued pending with a
  // reconciliation note. Legacy paid records that only partially cover the
  // month are surfaced rather than guessed.
  const coveringPaid = paidBillingRecords.find((record) => {
    // Compare billing calendar dates against the month's Yangon calendar
    // dates (date-typed billing ends are the last inclusive day).
    const start = new Date(record.billingPeriodStart).getTime();
    const end = new Date(record.billingPeriodEnd).getTime();
    const monthFirstDay = yangonCalendarDate(monthStartAt).getTime();
    const monthLastDay = yangonCalendarDate(
      new Date(monthEndAt.getTime() - 1),
    ).getTime();
    return start <= monthFirstDay && end >= monthLastDay;
  });

  const billingNotes: string[] = [];
  if (coveringPaid) {
    return {
      action: 'create_next_monthly',
      tenantId,
      planId: plan.id,
      legacyPeriodId: legacyActive.id,
      monthStartAt,
      monthEndAt,
      paymentStatus: 'paid',
      billingRecordId: coveringPaid.id,
      billingNotes,
    };
  }

  billingNotes.push(
    `No confirmed paid billing record covers [${monthStartAt.toISOString()}, ${monthEndAt.toISOString()}). The next monthly period is queued pending and requires owner payment reconciliation before access.`,
  );
  return {
    action: 'create_next_monthly',
    tenantId,
    planId: plan.id,
    legacyPeriodId: legacyActive.id,
    monthStartAt,
    monthEndAt,
    paymentStatus: 'pending',
    billingRecordId: null,
    billingNotes,
  };
}

export type CutoverReport = {
  reportType: 'subscription_period_yangon_cutover';
  format: 'safe_json';
  generatedAt: string;
  boundary: string;
  sourcePrecedence: string[];
  created: Array<{
    tenantId: string;
    tenantCode: string;
    periodId: string;
    planId: string;
    monthStartAt: string;
    monthEndAt: string;
    paymentStatus: string;
    billingRecordId: string | null;
  }>;
  skipped: Array<{
    tenantId: string;
    tenantCode: string;
    reason: CutoverSkipReason;
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

/**
 * Forward-only reconciliation (task 2.7). Safe to run repeatedly: tenants
 * already transitioned (event idempotency key) or already covered by a
 * monthly period are skipped and reported, never double-created. Legacy rows
 * are only annotated with transition metadata — their dates, snapshots, and
 * payment evidence are preserved verbatim.
 */
export async function reconcileYangonCutover(
  dataSource: DataSource,
  options: { boundary?: Date } = {},
): Promise<CutoverReport> {
  const boundary = options.boundary ?? approvedYangonCutoverBoundary();
  const generatedAt = new Date().toISOString();
  const manager = dataSource.manager;

  const report: CutoverReport = {
    reportType: 'subscription_period_yangon_cutover',
    format: 'safe_json',
    generatedAt,
    boundary: boundary.toISOString(),
    sourcePrecedence: ['paid_billing_record', 'pending_reconciliation'],
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
    select: ['id', 'tenantCode', 'companyName', 'subscriptionPlanId'],
  });
  report.summary.tenantsScanned = tenants.length;

  for (const tenant of tenants) {
    const [activePeriods, allPeriods, paidBillingRecords, plan] =
      await Promise.all([
        manager.find(TenantSubscriptionPeriod, {
          where: { tenantId: tenant.id, periodStatus: 'active' },
        }),
        manager.find(TenantSubscriptionPeriod, {
          where: { tenantId: tenant.id },
        }),
        manager.find(TenantBillingRecord, {
          where: { tenantId: tenant.id, paymentStatus: 'paid' },
        }),
        tenant.subscriptionPlanId
          ? manager.findOne(SubscriptionPlan, {
              where: { id: tenant.subscriptionPlanId },
            })
          : Promise.resolve(null),
      ]);

    const decision = decideCutoverForTenant({
      tenantId: tenant.id,
      activePeriods,
      allPeriods,
      plan,
      paidBillingRecords,
      boundary,
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

    const applied = await applyCutoverTransition(
      manager,
      decision,
      tenant.tenantCode,
      boundary,
    );
    if (applied === 'already-applied') {
      report.skipped.push({
        tenantId: decision.tenantId,
        tenantCode: tenant.tenantCode,
        reason: 'already_transitioned',
        detail: 'cutover idempotency event already present',
      });
      report.summary.skipped += 1;
      continue;
    }

    report.created.push({
      tenantId: decision.tenantId,
      tenantCode: tenant.tenantCode,
      periodId: applied.periodId,
      planId: decision.planId,
      monthStartAt: decision.monthStartAt.toISOString(),
      monthEndAt: decision.monthEndAt.toISOString(),
      paymentStatus: decision.paymentStatus,
      billingRecordId: decision.billingRecordId,
    });
    report.summary.created += 1;

    // Surface both the decision-time billing notes and any linkage issues
    // detected on the persisted period so operators see them in the report,
    // not only in the period event metadata.
    const exceptionIssues = [
      ...decision.billingNotes,
      ...applied.linkageIssues,
    ];
    const seen = new Set<string>();
    for (const issue of exceptionIssues) {
      if (seen.has(issue)) continue;
      seen.add(issue);
      report.reconciliationExceptions.push({
        tenantId: decision.tenantId,
        tenantCode: tenant.tenantCode,
        issue,
      });
      report.summary.reconciliationExceptions += 1;
    }
  }

  return report;
}

async function applyCutoverTransition(
  manager: EntityManager,
  decision: Extract<CutoverDecision, { action: 'create_next_monthly' }>,
  tenantCode: string,
  boundary: Date,
): Promise<{ periodId: string; linkageIssues: string[] } | 'already-applied'> {
  const idempotencyKey = `cutover:period:${decision.tenantId}:${boundary.toISOString()}`;
  const existingEvent = await manager.findOne(SubscriptionPeriodEvent, {
    where: { idempotencyKey },
    select: ['id'],
  });
  if (existingEvent) return 'already-applied';

  // Concurrent runs: the partial unique index
  // UQ_subscription_period_events_idempotency is the final guard. If two runs
  // pass the pre-checks simultaneously, the second event insert raises a
  // unique violation and that tenant's transaction rolls back rather than
  // double-creating. This is an ops utility run serially; a per-tenant retry
  // can simply re-run the utility (it will then report already_transitioned).
  return manager.transaction(async (transactionalManager) => {
    const recheck = await transactionalManager
      .getRepository(TenantSubscriptionPeriod)
      .createQueryBuilder('period')
      .where('period.tenant_id = :tenantId', { tenantId: decision.tenantId })
      .andWhere('period.month_start_at <= :boundary', { boundary })
      .andWhere('period.month_end_at > :boundary', { boundary })
      .getCount();
    if (recheck > 0) return 'already-applied';

    const legacyPeriod = await transactionalManager
      .getRepository(TenantSubscriptionPeriod)
      .findOneByOrFail({ id: decision.legacyPeriodId });

    // Preserve the legacy row verbatim; annotate the transition plan only.
    const metadata = {
      ...(legacyPeriod.metadata ?? {}),
      yangonCutover: {
        boundary: boundary.toISOString(),
        plannedAction: 'expire_at_boundary_and_start_monthly',
        nextMonthlyPeriodPending: decision.paymentStatus === 'pending',
        note: 'Legacy non-monthly period preserved as evidence; expiry at the Yangon boundary is handled by the monthly scheduler (Phase 8).',
      },
    };
    await transactionalManager
      .getRepository(TenantSubscriptionPeriod)
      .update(decision.legacyPeriodId, { metadata });

    const plan = await transactionalManager
      .getRepository(SubscriptionPlan)
      .findOneByOrFail({ id: decision.planId });

    const nextSequence = await transactionalManager
      .getRepository(TenantSubscriptionPeriod)
      .createQueryBuilder('period')
      .select('COALESCE(MAX(period.sequence_number), 0) + 1', 'next')
      .where('period.tenant_id = :tenantId', { tenantId: decision.tenantId })
      .getRawOne<{ next: string }>();

    const period = transactionalManager
      .getRepository(TenantSubscriptionPeriod)
      .create({
        tenantId: decision.tenantId,
        planId: decision.planId,
        billingRecordId: decision.billingRecordId,
        periodType: 'paid',
        // A queued next monthly period is always `upcoming`; access is gated
        // by paymentStatus === 'paid' via periodConfersAccess.
        periodStatus: 'upcoming',
        paymentStatus: decision.paymentStatus,
        durationDays: Math.max(
          1,
          Math.round(
            (decision.monthEndAt.getTime() - decision.monthStartAt.getTime()) /
              86_400_000,
          ),
        ),
        periodStartAt: decision.monthStartAt,
        periodEndAt: decision.monthEndAt,
        scheduledStartAt: decision.monthStartAt,
        scheduledEndAt: decision.monthEndAt,
        monthStartAt: decision.monthStartAt,
        monthEndAt: decision.monthEndAt,
        startOption: 'scheduled_prepaid',
        activatedAt: null,
        activationReason: null,
        sequenceNumber: Number(nextSequence?.next ?? 1),
        quotaSnapshot: buildQuotaSnapshot(plan),
        metadata: {
          source: 'yangon_cutover',
          boundary: boundary.toISOString(),
          legacyPeriodId: decision.legacyPeriodId,
        },
      });
    const saved = await transactionalManager
      .getRepository(TenantSubscriptionPeriod)
      .save(period);

    const billingLinkage = await transactionalManager
      .getRepository(TenantBillingRecord)
      .findOneBy({ id: decision.billingRecordId ?? '' });

    const linkageIssues = validatePeriodBillingLinkage({
      period: saved,
      billingRecord: billingLinkage,
    });
    const linkageIssueMessages = linkageIssues.issues.map(
      (issue) => `${issue.code}: ${issue.detail}`,
    );

    await transactionalManager.getRepository(SubscriptionPeriodEvent).save(
      transactionalManager.getRepository(SubscriptionPeriodEvent).create({
        subscriptionPeriodId: saved.id,
        tenantId: decision.tenantId,
        eventType: 'period_created',
        previousStatus: null,
        newStatus: saved.periodStatus,
        actorType: 'system',
        actorId: 'yangon-cutover',
        source: 'yangon_cutover',
        reason:
          'Next monthly period created at approved Yangon cutover boundary',
        idempotencyKey,
        metadata: {
          boundary: boundary.toISOString(),
          legacyPeriodId: decision.legacyPeriodId,
          tenantCode,
          paymentStatus: decision.paymentStatus,
          billingRecordId: decision.billingRecordId,
          linkageIssues: linkageIssues.issues.map((issue) => issue.code),
        },
      }),
    );

    return { periodId: saved.id, linkageIssues: linkageIssueMessages };
  });
}
