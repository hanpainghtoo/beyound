import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type EntityManager, type Repository } from 'typeorm';

import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import { TenantSubscriptionPeriodUpgradeRevision } from './entities/tenant-subscription-period-upgrade-revision.entity';
import { TenantSubscriptionAddOnPurchase } from '../subscription-add-on/entities/tenant-subscription-add-on-purchase.entity';
import { TenantSubscriptionAddOnComponent } from '../subscription-add-on/entities/tenant-subscription-add-on-component.entity';
import {
  ENTITLEMENT_DIMENSION_KEYS,
  MissingActivePeriodError,
  type DimensionLimits,
  type DimensionQuotaStates,
  type DimensionTotals,
  type EntitlementDimensionKey,
  type EntitlementMissingPeriodCode,
  type ResolvedSubscriptionEntitlement,
} from './subscription-entitlement.types';
import {
  assembleUpgradeEffectiveLimits,
  type SubscriptionQuotaSnapshot,
} from './subscription-period.types';

export type EntitlementResolutionOptions = {
  /** Run repository reads through this transaction manager when provided. */
  manager?: EntityManager;
  /** Testable clock; defaults to `new Date()`. */
  now?: Date;
};

/**
 * Read the typed base capacity for a dimension from either an immutable quota
 * snapshot or a subscription plan (both expose the same field names). Returns
 * `undefined` when the source simply does not carry the field (legacy
 * snapshots captured before Phase 5), `null` for an explicit unlimited value,
 * and a number otherwise. Callers decide how to treat `undefined`.
 */
export function baseLimitForDimension(
  source:
    | Partial<SubscriptionQuotaSnapshot>
    | SubscriptionPlan
    | null
    | undefined,
  dimension: EntitlementDimensionKey,
): number | null | undefined {
  if (!source) return undefined;
  switch (dimension) {
    case 'inbound_messages':
      return (source as Partial<SubscriptionQuotaSnapshot>).inboundMessageLimit;
    case 'outbound_messages':
      return (source as Partial<SubscriptionQuotaSnapshot>)
        .outboundMessageLimit;
    case 'api_requests':
      return (source as Partial<SubscriptionQuotaSnapshot>).apiLimit;
    case 'channel_slots':
      return (source as Partial<SubscriptionQuotaSnapshot>).maxChannels;
    case 'storage_gb':
      return (source as Partial<SubscriptionQuotaSnapshot>).storageLimitGb;
    case 'team_members':
      return (source as Partial<SubscriptionQuotaSnapshot>).maxCsrs;
  }
}

/**
 * Aggregate base limits, active top-up grants, and effective limits for every
 * dimension (tasks 5.4/5.5). Pure and deterministic so it can be unit-tested
 * without a database.
 *
 * - base: immutable snapshot first; the current plan only fills fields a
 *   legacy snapshot never captured (e.g. pre-Phase-5 rows without
 *   `maxChannels`/`storageLimitGb`). The snapshot's explicit `null`
 *   (unlimited) is authoritative and never overridden by the plan.
 * - effective: `base + topUpTotal`, except an unlimited base stays unlimited.
 * - blocked: `effective === 0`.
 */
export function aggregateEffectiveLimits(input: {
  snapshot: SubscriptionQuotaSnapshot;
  plan: SubscriptionPlan | null;
  activeComponents: TenantSubscriptionAddOnComponent[];
}): {
  baseLimits: DimensionLimits;
  activeTopUpComponentTotals: DimensionTotals;
  effectiveLimits: DimensionLimits;
  quotaState: DimensionQuotaStates;
} {
  const { snapshot, plan, activeComponents } = input;

  const activeTopUpComponentTotals = Object.fromEntries(
    ENTITLEMENT_DIMENSION_KEYS.map((key) => [key, 0]),
  ) as DimensionTotals;
  for (const component of activeComponents) {
    if (component.componentType in activeTopUpComponentTotals) {
      activeTopUpComponentTotals[component.componentType] += component.quantity;
    }
  }

  const baseLimits = {} as DimensionLimits;
  const effectiveLimits = {} as DimensionLimits;
  const quotaState = {} as DimensionQuotaStates;

  for (const dimension of ENTITLEMENT_DIMENSION_KEYS) {
    const snapshotValue = baseLimitForDimension(snapshot, dimension);
    const planValue = plan ? baseLimitForDimension(plan, dimension) : undefined;
    // The snapshot is authoritative (including explicit null = unlimited).
    // `undefined` means the legacy snapshot never captured the field, so the
    // current plan fills the gap; capacity dimensions default to 0 (blocked)
    // only when no source defines them at all.
    const base =
      snapshotValue !== undefined
        ? snapshotValue
        : planValue !== undefined
          ? planValue
          : dimension === 'channel_slots' ||
              dimension === 'storage_gb' ||
              dimension === 'team_members'
            ? 0
            : null;

    const topUpTotal = activeTopUpComponentTotals[dimension];
    const effective = base === null ? null : base + topUpTotal;
    baseLimits[dimension] = base;
    effectiveLimits[dimension] = effective;
    quotaState[dimension] = {
      base,
      topUpTotal,
      effective,
      blocked: effective !== null && effective <= 0,
    };
  }

  return {
    baseLimits,
    activeTopUpComponentTotals,
    effectiveLimits,
    quotaState,
  };
}

type ActivePeriodEvaluation =
  | { ok: true; period: TenantSubscriptionPeriod }
  | { ok: false; code: EntitlementMissingPeriodCode; detail: string };

/**
 * One shared resolver for period-scoped quotas (Plan 9 Phase 5, task 5.1).
 *
 * Resolves the tenant's operational entitlement from the purchased-period
 * ledger: exactly one active paid period, current under the Yangon half-open
 * window, with confirmed payment. It loads the immutable base quota snapshot
 * and only paid, active, non-expired top-up purchases/components for that
 * period, then aggregates every dimension independently. Invalid states are
 * rejected with stable `MissingActivePeriodError` codes — it never silently
 * falls back to the current plan or a UTC month.
 */
@Injectable()
export class SubscriptionEntitlementService {
  constructor(
    @InjectRepository(TenantSubscriptionPeriod)
    private readonly periodRepository: Repository<TenantSubscriptionPeriod>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepository: Repository<SubscriptionPlan>,
    @InjectRepository(TenantSubscriptionAddOnPurchase)
    private readonly purchaseRepository: Repository<TenantSubscriptionAddOnPurchase>,
    @InjectRepository(TenantSubscriptionAddOnComponent)
    private readonly componentRepository: Repository<TenantSubscriptionAddOnComponent>,
    @InjectRepository(TenantSubscriptionPeriodUpgradeRevision)
    private readonly upgradeRevisionRepository: Repository<TenantSubscriptionPeriodUpgradeRevision>,
  ) {}

  /**
   * Lightweight period identity used by dual-write call sites (usage service,
   * conversation ingestion). Returns `null` instead of throwing when the
   * tenant has no operational paid period, so legacy writes keep a null
   * `subscription_period_id` and nothing breaks during the transition.
   */
  async resolveActivePeriodId(
    tenantId: string,
    options: EntitlementResolutionOptions = {},
  ): Promise<string | null> {
    const evaluation = await this.evaluateActivePeriod(tenantId, options);
    return evaluation.ok ? evaluation.period.id : null;
  }

  /**
   * Full resolution used by quota-consuming paths and operator debugging.
   * Throws `MissingActivePeriodError` with a stable code when there is no
   * operational paid period and no operational trial period.
   *
   * Plan 14 Phase 3: an operational paid period wins. While a paid period is
   * confirmed but still awaiting Admin activation, an unexpired active trial
   * remains authoritative so the tenant keeps trial access and trial-scoped
   * usage until activation. Other non-operational paid states still propagate
   * their specific error instead of silently falling back to a trial.
   */
  async resolveActiveSubscriptionEntitlement(
    tenantId: string,
    options: EntitlementResolutionOptions = {},
  ): Promise<ResolvedSubscriptionEntitlement> {
    const evaluation = await this.evaluateActivePeriod(tenantId, options);
    if (!evaluation.ok) {
      throw new MissingActivePeriodError(evaluation.code, evaluation.detail);
    }
    return this.buildEntitlement(tenantId, evaluation.period, options);
  }

  /**
   * Resolve the single operational period with paid precedence (task 3.1).
   * When the tenant has no active paid period, fall back to an operational
   * trial period. A confirmed paid period awaiting Admin activation is the
   * deliberate exception: an unexpired trial remains authoritative until the
   * paid period becomes operational.
   */
  private async evaluateActivePeriod(
    tenantId: string,
    options: EntitlementResolutionOptions,
  ): Promise<ActivePeriodEvaluation> {
    const paid = await this.evaluateActivePaidPeriod(tenantId, options);
    if (paid.ok) return paid;

    // A confirmed but not-yet-activated paid period does not terminate an
    // unexpired trial. The trial remains the operational source of limits and
    // usage until Admin activation makes the paid period authoritative.
    if (paid.code === 'PERIOD_AWAITING_ADMIN_ACTIVATION') {
      const trial = await this.evaluateActiveTrialPeriod(tenantId, options);
      if (trial.ok) return trial;
      return paid;
    }

    if (paid.code !== 'NO_ACTIVE_PAID_PERIOD') return paid;
    return this.evaluateActiveTrialPeriod(tenantId, options);
  }

  /**
   * Plan 14 Phase 3 (task 3.2): resolve an operational trial period using its
   * exact elapsed-day bounds. An active trial whose window has ended returns
   * `TRIAL_EXPIRED` so expired-trial access is blocked without looking like
   * "no period at all".
   */
  private async evaluateActiveTrialPeriod(
    tenantId: string,
    options: EntitlementResolutionOptions,
  ): Promise<ActivePeriodEvaluation> {
    const now = options.now ?? new Date();
    const repository = this.repositoryFor(TenantSubscriptionPeriod, options);
    const periods = await repository.find({
      where: { tenantId, periodType: 'trial', periodStatus: 'active' },
    });
    const activeTrials = periods;
    if (activeTrials.length > 1) {
      return {
        ok: false,
        code: 'MULTIPLE_ACTIVE_PERIODS',
        detail: `Tenant ${tenantId} has ${activeTrials.length} active trial periods; expected at most one.`,
      };
    }
    const period = activeTrials[0];
    if (!period) {
      return {
        ok: false,
        code: 'NO_ACTIVE_PAID_PERIOD',
        detail: `Tenant ${tenantId} has no operational subscription period.`,
      };
    }

    const startAt = period.periodStartAt;
    const endAt = period.periodEndAt;
    if (
      !startAt ||
      !endAt ||
      now.getTime() < startAt.getTime() ||
      now.getTime() >= endAt.getTime()
    ) {
      return {
        ok: false,
        code: 'TRIAL_EXPIRED',
        detail: `Tenant ${tenantId} trial period ${period.id} is not operational at ${now.toISOString()} under its exact elapsed-day window.`,
      };
    }
    if (
      period.paymentStatus !== 'not_required' ||
      period.adminActivationStatus !== 'approved'
    ) {
      return {
        ok: false,
        code: 'NO_ACTIVE_PAID_PERIOD',
        detail: `Tenant ${tenantId} trial period ${period.id} is not operational (payment/admin state).`,
      };
    }
    return { ok: true, period };
  }

  private async evaluateActivePaidPeriod(
    tenantId: string,
    options: EntitlementResolutionOptions,
  ): Promise<ActivePeriodEvaluation> {
    const now = options.now ?? new Date();
    const repository = this.repositoryFor(TenantSubscriptionPeriod, options);

    const periods = await repository.find({
      where: { tenantId, periodType: 'paid', periodStatus: 'active' },
    });
    const activePaid = periods;

    if (activePaid.length > 1) {
      // The DB partial unique index makes this impossible; kept as a loud
      // guard so a data anomaly can never silently pick one of several.
      return {
        ok: false,
        code: 'MULTIPLE_ACTIVE_PERIODS',
        detail: `Tenant ${tenantId} has ${activePaid.length} active paid periods; expected exactly one.`,
      };
    }

    const period = activePaid[0];
    if (!period) {
      return {
        ok: false,
        code: 'NO_ACTIVE_PAID_PERIOD',
        detail: `Tenant ${tenantId} has no active paid subscription period.`,
      };
    }

    // Calendar-month contract: the half-open [monthStartAt, monthEndAt) Yangon
    // window is authoritative; legacy rows without month fields fall back to
    // the period bounds.
    const startAt = period.monthStartAt ?? period.periodStartAt;
    const endAt = period.monthEndAt ?? period.periodEndAt;
    if (
      !startAt ||
      !endAt ||
      now.getTime() < startAt.getTime() ||
      now.getTime() >= endAt.getTime()
    ) {
      return {
        ok: false,
        code: 'PERIOD_OUTSIDE_CALENDAR_WINDOW',
        detail: `Tenant ${tenantId} active period ${period.id} is not current at ${now.toISOString()} under its calendar window.`,
      };
    }

    if (period.paymentStatus === 'refunded') {
      return {
        ok: false,
        code: 'PERIOD_REFUNDED',
        detail: `Tenant ${tenantId} active period ${period.id} has been refunded and grants no operational quota.`,
      };
    }
    if (period.paymentStatus !== 'paid') {
      return {
        ok: false,
        code: 'PERIOD_PAYMENT_NOT_CONFIRMED',
        detail: `Tenant ${tenantId} active period ${period.id} payment is '${period.paymentStatus}'; quota is not operational until payment is confirmed.`,
      };
    }

    // Plan 13/14: a paid calendar-active period grants no paid quota until
    // Platform Admin approval. `evaluateActivePeriod` may intentionally return
    // an active trial instead when that trial has not expired; otherwise this
    // stable awaiting-activation code blocks access without using legacy
    // tenant assignment or entitlement state.
    if (period.adminActivationStatus !== 'approved') {
      return {
        ok: false,
        code: 'PERIOD_AWAITING_ADMIN_ACTIVATION',
        detail: `Tenant ${tenantId} paid period ${period.id} payment is confirmed but awaits Platform Admin activation; quota is not operational until approved.`,
      };
    }

    return { ok: true, period };
  }

  private async buildEntitlement(
    tenantId: string,
    period: TenantSubscriptionPeriod,
    options: EntitlementResolutionOptions,
  ): Promise<ResolvedSubscriptionEntitlement> {
    const now = options.now ?? new Date();

    const plan = await this.repositoryFor(SubscriptionPlan, options).findOne({
      where: { id: period.planId },
    });

    // Only paid, active, non-expired purchases of this exact period grant
    // capacity; pending, failed, cancelled, and expired bundles never count.
    const purchases = await this.repositoryFor(
      TenantSubscriptionAddOnPurchase,
      options,
    ).find({ where: { tenantId, subscriptionPeriodId: period.id } });
    const activePurchaseIds = purchases
      .filter(
        (purchase) =>
          purchase.purchaseStatus === 'active' &&
          purchase.paymentStatus === 'paid' &&
          now.getTime() < purchase.expiresAt.getTime(),
      )
      .map((purchase) => purchase.id);

    let activeComponents: TenantSubscriptionAddOnComponent[] = [];
    if (activePurchaseIds.length > 0) {
      const components = await this.repositoryFor(
        TenantSubscriptionAddOnComponent,
        options,
      ).find({ where: { purchaseId: In(activePurchaseIds) } });
      activeComponents = components.filter(
        (component) =>
          component.componentStatus === 'active' &&
          now.getTime() < component.expiresAt.getTime(),
      );
    }

    const snapshot = period.quotaSnapshot;

    // Plan 14 Phase 4 (tasks 4.1/4.2): an approved upgrade revision makes the
    // upgraded snapshot authoritative. The original period snapshot is never
    // mutated — the revision preserves both snapshots and the one-time
    // eligible carryover, and the resolver folds them into the effective
    // entitlement here.
    const revision = await this.repositoryFor(
      TenantSubscriptionPeriodUpgradeRevision,
      options,
    ).findOne({
      where: { subscriptionPeriodId: period.id, upgradeStatus: 'approved' },
    });

    const baseSnapshot: SubscriptionQuotaSnapshot = revision
      ? revision.upgradedPlanSnapshot
      : snapshot;

    const aggregated = aggregateEffectiveLimits({
      snapshot: baseSnapshot,
      plan: plan ?? null,
      activeComponents,
    });

    let effectiveLimits = aggregated.effectiveLimits;
    let quotaState = aggregated.quotaState;
    if (revision) {
      const effectiveSnapshot = assembleUpgradeEffectiveLimits({
        upgradedSnapshot: baseSnapshot,
        carryover: revision.carryover,
        activeTopUpComponentTotals: aggregated.activeTopUpComponentTotals,
      });
      effectiveLimits = {
        inbound_messages: effectiveSnapshot.inboundMessageLimit,
        outbound_messages: effectiveSnapshot.outboundMessageLimit,
        api_requests: effectiveSnapshot.apiLimit,
        channel_slots: effectiveSnapshot.maxChannels,
        storage_gb: effectiveSnapshot.storageLimitGb,
        team_members: effectiveSnapshot.maxCsrs,
      };
      quotaState = ENTITLEMENT_DIMENSION_KEYS.reduce((acc, dimension) => {
        acc[dimension] = {
          base: aggregated.baseLimits[dimension],
          topUpTotal: aggregated.activeTopUpComponentTotals[dimension],
          effective: effectiveLimits[dimension],
          blocked:
            effectiveLimits[dimension] !== null &&
            effectiveLimits[dimension] <= 0,
        };
        return acc;
      }, {} as DimensionQuotaStates);
    }

    return {
      tenantId,
      activePeriodId: period.id,
      periodType: period.periodType,
      planId: revision ? revision.upgradedPlanId : period.planId,
      periodStartAt: period.periodStartAt,
      periodEndAt: period.periodEndAt,
      activatedAt: period.activatedAt,
      periodStatus: period.periodStatus,
      paymentStatus: period.paymentStatus,
      paymentState:
        period.paymentStatus === 'paid'
          ? 'paid'
          : period.paymentStatus === 'refunded'
            ? 'refunded'
            : period.paymentStatus === 'failed'
              ? 'failed'
              : period.paymentStatus === 'not_required'
                ? 'not_required'
                : 'pending',
      planSnapshot: baseSnapshot,
      baseLimits: aggregated.baseLimits,
      activeTopUpComponentTotals: aggregated.activeTopUpComponentTotals,
      effectiveLimits,
      quotaState,
      upgradeRevisionId: revision?.id ?? null,
      carryover: revision?.carryover ?? null,
    };
  }

  private repositoryFor(
    entity: any,
    options: EntitlementResolutionOptions,
  ): Repository<any> {
    if (options.manager) {
      return options.manager.getRepository(entity);
    }
    switch (entity) {
      case TenantSubscriptionPeriod:
        return this.periodRepository;
      case SubscriptionPlan:
        return this.planRepository;
      case TenantSubscriptionAddOnPurchase:
        return this.purchaseRepository;
      case TenantSubscriptionAddOnComponent:
        return this.componentRepository;
      case TenantSubscriptionPeriodUpgradeRevision:
        return this.upgradeRevisionRepository;
      default:
        return this.componentRepository;
    }
  }
}
