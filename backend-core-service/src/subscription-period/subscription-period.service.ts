import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import { SubscriptionPeriodEvent } from './entities/subscription-period-event.entity';
import {
  buildPeriodSchedule,
  buildQuotaSnapshot,
  type CreateTrialPeriodInput,
  type SubscriptionPeriodActivationReason,
  type SubscriptionPeriodAdminActivationStatus,
  type SubscriptionPeriodEndReason,
  type SubscriptionPeriodPaymentStatus,
  type SubscriptionPeriodStartOption,
  type SubscriptionPeriodSchedule,
  type SubscriptionPeriodStatus,
  type SubscriptionQuotaSnapshot,
} from './subscription-period.types';
import {
  assertPaymentStatusTransition,
  assertPeriodStatusTransition,
} from './subscription-period.transitions';
import { yangonNextMonthStart } from './yangon-month.util';

export type StartOptionResolution =
  | {
      ok: true;
      startOption: SubscriptionPeriodStartOption;
    }
  | {
      ok: false;
      code: 'STALE_NEXT_MONTH' | 'START_OPTION_REQUIRED';
    };

/**
 * Resolve the persisted `startOption` for a new period (tasks 2.3, 2.8).
 *
 * - With an active paid period, the server always assigns
 *   `scheduled_prepaid`; a client-supplied choice is never trusted.
 * - First purchase (no active paid period): tenant picks `current_month` or
 *   `next_month`. A `next_month` quote whose selected month boundary has
 *   already passed is stale and must be rejected — the period must never be
 *   activated retroactively. `selectedMonthStartAt` is the Yangon start of the
 *   month the quote refers to (its scheduled period start); callers must pass
 *   it for confirmation-time validation per the analysis.
 */
export function resolveStartOption(input: {
  hasActivePaidPeriod: boolean;
  requestedStartOption: SubscriptionPeriodStartOption | null | undefined;
  /** Yangon start of the requested `next_month` period (confirmation check). */
  selectedMonthStartAt?: Date;
  now?: Date;
}): StartOptionResolution {
  const { hasActivePaidPeriod, requestedStartOption, selectedMonthStartAt } =
    input;
  const now = input.now ?? new Date();

  if (hasActivePaidPeriod) {
    return { ok: true, startOption: 'scheduled_prepaid' };
  }

  if (requestedStartOption === 'current_month') {
    return { ok: true, startOption: 'current_month' };
  }

  if (requestedStartOption === 'next_month') {
    const targetStart = selectedMonthStartAt ?? yangonNextMonthStart(now);
    if (now.getTime() >= targetStart.getTime()) {
      return { ok: false, code: 'STALE_NEXT_MONTH' };
    }
    return { ok: true, startOption: 'next_month' };
  }

  return { ok: false, code: 'START_OPTION_REQUIRED' };
}

/**
 * Thrown when creating a second active period for a tenant. The database
 * partial unique index `UQ_subscription_periods_one_active` enforces the same
 * invariant; this error surfaces the check deterministically inside the
 * transaction after the pessimistic lock.
 */
export class DuplicateActivePeriodError extends Error {
  constructor(tenantId: string) {
    super(`Tenant ${tenantId} already has an active subscription period.`);
    this.name = 'DuplicateActivePeriodError';
  }
}

export type CreatePaidPeriodInput = {
  tenantId: string;
  plan: SubscriptionPlan;
  monthStartAt: Date;
  monthEndAt: Date;
  /** Optional effective bounds for a paid period that starts after a trial. */
  effectivePeriodStartAt?: Date;
  effectivePeriodEndAt?: Date;
  startOption: SubscriptionPeriodStartOption;
  periodStatus?: SubscriptionPeriodStatus;
  paymentStatus?: SubscriptionPeriodPaymentStatus;
  billingRecordId?: string | null;
  activatedAt?: Date | null;
  activationReason?: SubscriptionPeriodActivationReason | null;
  expiredAt?: Date | null;
  endReason?: SubscriptionPeriodEndReason | null;
  metadata?: Record<string, unknown>;
  actorType?: string;
  actorId?: string;
  /**
   * Plan 13: administrative approval state for the new period. Payment
   * confirmation for business plans passes `pending`; auto-approve (trial)
   * plans pass `approved`. Defaults to `approved` for existing callers
   * (seeds/backfill) so their periods stay operational.
   */
  adminActivationStatus?: SubscriptionPeriodAdminActivationStatus;
  /**
   * Plan 14 Phase 4 (task 4.13): the trial period this paid period converted
   * from. Set on the paid period of a trial-to-business conversion so admin
   * activation can atomically close the trial and apply trial carryover.
   */
  convertedFromPeriodId?: string | null;
};

export type EnsurePaidBillingPeriodInput = CreatePaidPeriodInput & {
  billingRecordId: string;
};

/**
 * Transactional, one-active-safe period creation (task 2.4). Locks the
 * tenant's period rows with `FOR UPDATE`, refuses a second active row, and
 * persists the immutable start choice and monthly window atomically with a
 * `period_created` event.
 */
@Injectable()
export class SubscriptionPeriodService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepository: Repository<SubscriptionPlan>,
  ) {}

  /**
   * Lock the tenant's period rows so concurrent purchases/activations cannot
   * both observe "no active period". Returns the rows (empty for a first
   * purchase; the DB partial unique index remains the final race guard).
   */
  async lockTenantPeriods(
    manager: EntityManager,
    tenantId: string,
  ): Promise<TenantSubscriptionPeriod[]> {
    return manager
      .getRepository(TenantSubscriptionPeriod)
      .createQueryBuilder('period')
      .setLock('pessimistic_write')
      .where('period.tenant_id = :tenantId', { tenantId })
      .getMany();
  }

  async createPaidPeriod(
    input: CreatePaidPeriodInput,
  ): Promise<TenantSubscriptionPeriod> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockTenantPeriods(manager, input.tenantId);
      return this.createPaidPeriodInManager(manager, input);
    });
  }

  /**
   * Create or reuse the period ledger row for one confirmed billing record.
   * The billing-record link is the idempotency boundary: retries of the same
   * payment cannot create a second period or a second entitlement grant.
   */
  async ensurePaidBillingPeriod(
    input: EnsurePaidBillingPeriodInput,
    manager?: EntityManager,
  ): Promise<TenantSubscriptionPeriod> {
    const run = (transactionManager: EntityManager) =>
      this.ensurePaidBillingPeriodInManager(transactionManager, input);
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  private async ensurePaidBillingPeriodInManager(
    manager: EntityManager,
    input: EnsurePaidBillingPeriodInput,
  ): Promise<TenantSubscriptionPeriod> {
    await manager
      .getRepository(TenantBillingRecord)
      .createQueryBuilder('billing')
      .setLock('pessimistic_write')
      .where('billing.id = :billingRecordId', {
        billingRecordId: input.billingRecordId,
      })
      .getOne();
    await this.lockTenantPeriods(manager, input.tenantId);
    const repository = manager.getRepository(TenantSubscriptionPeriod);
    const linkedPeriods = await repository.find({
      where: { billingRecordId: input.billingRecordId },
    });
    if (linkedPeriods.length > 1) {
      throw new ConflictException(
        'Billing record is linked to multiple subscription periods',
      );
    }
    const existing = linkedPeriods[0];

    if (existing) {
      if (existing.tenantId !== input.tenantId) {
        throw new ConflictException(
          'Billing record is already linked to another tenant period',
        );
      }
      if (existing.planId !== input.plan.id) {
        throw new ConflictException(
          'Billing record is already linked to another subscription plan',
        );
      }

      let changed = false;
      if (existing.paymentStatus !== 'paid') {
        assertPaymentStatusTransition(existing.paymentStatus, 'paid');
        existing.paymentStatus = 'paid';
        changed = true;
      }
      if (
        input.periodStatus === 'active' &&
        existing.periodStatus === 'upcoming'
      ) {
        assertPeriodStatusTransition(existing.periodStatus, 'active');
        existing.periodStatus = 'active';
        existing.activatedAt = input.activatedAt ?? new Date();
        existing.activationReason = input.activationReason ?? 'scheduled';
        changed = true;
      } else if (
        input.periodStatus === 'expired' &&
        existing.periodStatus === 'upcoming'
      ) {
        assertPeriodStatusTransition(existing.periodStatus, 'expired');
        existing.periodStatus = 'expired';
        existing.expiredAt = input.expiredAt ?? input.monthEndAt;
        existing.endReason = input.endReason ?? 'scheduled_expiry';
        changed = true;
      }
      const saved = changed ? await repository.save(existing) : existing;
      await this.recordPaymentConfirmedEvent(manager, saved, input);
      return saved;
    }

    const created = await this.createPaidPeriodInManager(manager, input);
    await this.recordPaymentConfirmedEvent(manager, created, input);
    return created;
  }

  /**
   * Plan 14 Phase 2 (tasks 2.1–2.3): resolve exactly one active trial plan
   * server-side. A missing, inactive, malformed, or multiply-selected trial
   * configuration is rejected so onboarding never guesses. Runs through the
   * provided transaction manager when given (registration/onboarding paths).
   */
  async resolveActiveTrialPlan(
    manager?: EntityManager,
  ): Promise<SubscriptionPlan> {
    const repository = manager
      ? manager.getRepository(SubscriptionPlan)
      : this.planRepository;
    const trialPlans = await repository.find({
      where: { planType: 'trial', status: 'active' } as any,
    });
    if (trialPlans.length === 0) {
      throw new NotFoundException(
        'No active trial plan is configured; trial onboarding is unavailable.',
      );
    }
    if (trialPlans.length > 1) {
      throw new ConflictException(
        'Multiple active trial plans are configured; exactly one is required.',
      );
    }
    const violations = validateTrialPlanConfiguration(trialPlans[0]);
    if (violations.length > 0) {
      throw new BadRequestException(
        `Configured trial plan is invalid: ${violations.join('; ')}`,
      );
    }
    return trialPlans[0];
  }

  /**
   * Plan 14 Phase 2 (tasks 2.1–2.3): one shared, idempotent trial
   * provisioning entry point used by self-service registration and Platform
   * Console merchant onboarding. Resolves the single active trial plan,
   * creates exactly one auto-approved trial period, and never creates a
   * duplicate under retries or concurrency (the one-active-trial unique index
   * is the final race guard). Returns the existing trial when already
   * provisioned.
   */
  async ensureTrialPeriodForTenant(
    tenantId: string,
    actor: { type?: string; id?: string } = {},
    options: { manager?: EntityManager; now?: Date } = {},
  ): Promise<TenantSubscriptionPeriod> {
    const plan = await this.resolveActiveTrialPlan(options.manager);
    return this.createTrialPeriod(
      {
        tenantId,
        plan,
        periodStartAt: options.now ?? new Date(),
        durationDays: plan.durationDays,
        actorType: actor.type,
        actorId: actor.id,
      },
      options.manager,
    );
  }

  /**
   * Plan 14 Phase 1 (task 1.5): create exactly one auto-approved trial period
   * for a tenant, separate from the paid-period queue. Idempotent: repeated
   * calls return the existing active trial instead of creating a duplicate.
   * The trial never has a billing record and never uses a Yangon calendar
   * month — its exact elapsed-day bounds are authoritative. An optional
   * transaction manager runs the whole operation inside the caller's
   * transaction (registration/onboarding); otherwise a new transaction opens.
   */
  async createTrialPeriod(
    input: CreateTrialPeriodInput,
    manager?: EntityManager,
  ): Promise<TenantSubscriptionPeriod> {
    const run = (transactionManager: EntityManager) =>
      this.createTrialPeriodInManager(transactionManager, input);
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  private async createTrialPeriodInManager(
    manager: EntityManager,
    input: CreateTrialPeriodInput,
  ): Promise<TenantSubscriptionPeriod> {
    await this.lockTenantPeriods(manager, input.tenantId);
    const repository = manager.getRepository(TenantSubscriptionPeriod);
    const existingTrial = await repository.findOne({
      where: {
        tenantId: input.tenantId,
        periodType: 'trial',
        periodStatus: 'active',
      },
    });
    if (existingTrial) {
      return existingTrial;
    }

    const entity = buildTrialPeriodEntity(input);
    const sequenceNumber = await this.nextSequenceNumber(
      manager,
      input.tenantId,
    );
    const period = repository.create({
      ...entity,
      sequenceNumber,
      activatedAt: new Date(entity.periodStartAt),
      activationReason: 'initial',
      expiredAt: null,
      endReason: null,
    });
    const saved = await repository.save(period);

    await manager.getRepository(SubscriptionPeriodEvent).save(
      manager.getRepository(SubscriptionPeriodEvent).create({
        subscriptionPeriodId: saved.id,
        tenantId: input.tenantId,
        eventType: 'trial_period_created',
        previousStatus: null,
        newStatus: 'active',
        actorType: input.actorType ?? 'system',
        actorId: input.actorId ?? 'subscription-period-service',
        source: 'subscription-period-service',
        reason: `Trial period created for ${input.durationDays} days`,
        idempotencyKey: `trial-period-created:${saved.id}`,
        metadata: {
          planId: input.plan.id,
          periodStartAt: entity.periodStartAt.toISOString(),
          periodEndAt: entity.periodEndAt.toISOString(),
          durationDays: input.durationDays,
        },
      }),
    );

    return saved;
  }

  private async createPaidPeriodInManager(
    manager: EntityManager,
    input: CreatePaidPeriodInput,
  ): Promise<TenantSubscriptionPeriod> {
    // Only PAID periods count toward the one-active-period guard. A trial
    // conversion intentionally creates an active paid period while the trial
    // period remains active (the trial stays authoritative until admin
    // activation), so trial rows must not trip the duplicate-active check.
    const activeCount = await manager
      .getRepository(TenantSubscriptionPeriod)
      .createQueryBuilder('period')
      .where('period.tenant_id = :tenantId', { tenantId: input.tenantId })
      .andWhere("period.period_type = 'paid'")
      .andWhere("period.period_status = 'active'")
      .getCount();

    const periodStatus: SubscriptionPeriodStatus =
      input.periodStatus ??
      (input.startOption === 'current_month' ? 'active' : 'upcoming');

    if (periodStatus === 'active' && activeCount > 0) {
      throw new DuplicateActivePeriodError(input.tenantId);
    }

    const sequenceNumber = await this.nextSequenceNumber(
      manager,
      input.tenantId,
    );

    // Single source for the calendar window contract (task 2.2): the
    // service, cutover, and future resolver all use this shape.
    const schedule: SubscriptionPeriodSchedule = buildPeriodSchedule({
      monthStartAt: input.monthStartAt,
      monthEndAt: input.monthEndAt,
      periodStartAt: input.effectivePeriodStartAt,
      periodEndAt: input.effectivePeriodEndAt,
      activatedAt: input.activatedAt ?? null,
    });

    const period = manager.getRepository(TenantSubscriptionPeriod).create({
      tenantId: input.tenantId,
      planId: input.plan.id,
      billingRecordId: input.billingRecordId ?? null,
      periodType: 'paid',
      periodStatus,
      paymentStatus: input.paymentStatus ?? 'pending',
      adminActivationStatus: input.adminActivationStatus ?? 'approved',
      // Legacy compatibility column: calendar months report their actual
      // day count; new enforcement never reads durationDays.
      durationDays: Math.max(
        1,
        Math.round(
          (schedule.monthEndAt.getTime() - schedule.monthStartAt.getTime()) /
            86_400_000,
        ),
      ),
      periodStartAt: schedule.periodStartAt,
      periodEndAt: schedule.periodEndAt,
      scheduledStartAt: schedule.monthStartAt,
      scheduledEndAt: schedule.monthEndAt,
      monthStartAt: schedule.monthStartAt,
      monthEndAt: schedule.monthEndAt,
      startOption: input.startOption,
      activatedAt: schedule.activatedAt,
      activationReason: input.activationReason ?? null,
      expiredAt: input.expiredAt ?? null,
      endReason: input.endReason ?? null,
      sequenceNumber,
      convertedFromPeriodId: input.convertedFromPeriodId ?? null,

      quotaSnapshot: buildQuotaSnapshot(input.plan),
      metadata: input.metadata ?? {},
    });

    const saved = await manager
      .getRepository(TenantSubscriptionPeriod)
      .save(period);

    await manager.getRepository(SubscriptionPeriodEvent).save(
      manager.getRepository(SubscriptionPeriodEvent).create({
        subscriptionPeriodId: saved.id,
        tenantId: input.tenantId,
        eventType: 'period_created',
        previousStatus: null,
        newStatus: saved.periodStatus,
        actorType: input.actorType ?? 'system',
        actorId: input.actorId ?? 'subscription-period-service',
        source: 'subscription-period-service',
        reason: `Paid period created with startOption=${input.startOption}`,
        idempotencyKey: null,
        metadata: {
          startOption: input.startOption,
          monthStartAt: input.monthStartAt.toISOString(),
          monthEndAt: input.monthEndAt.toISOString(),
          paymentStatus: saved.paymentStatus,
        },
      }),
    );

    return saved;
  }

  private async recordPaymentConfirmedEvent(
    manager: EntityManager,
    period: TenantSubscriptionPeriod,
    input: EnsurePaidBillingPeriodInput,
  ): Promise<void> {
    const eventRepository = manager.getRepository(SubscriptionPeriodEvent);
    const idempotencyKey = `payment-confirmed:billing-record:${input.billingRecordId}`;
    const existingEvent = await eventRepository.findOne({
      where: { idempotencyKey },
    });
    if (existingEvent) return;

    await eventRepository.save(
      eventRepository.create({
        subscriptionPeriodId: period.id,
        tenantId: period.tenantId,
        eventType: 'payment_confirmed',
        previousStatus: null,
        newStatus: period.periodStatus,
        actorType: input.actorType ?? 'system',
        actorId: input.actorId ?? 'subscription-period-service',
        source: 'billing-payment-confirmation',
        reason: 'Billing record payment confirmed',
        idempotencyKey,
        metadata: {
          billingRecordId: input.billingRecordId,
          periodStatus: period.periodStatus,
          paymentStatus: period.paymentStatus,
        },
      }),
    );
  }

  private async nextSequenceNumber(
    manager: EntityManager,
    tenantId: string,
  ): Promise<number> {
    const row = await manager
      .getRepository(TenantSubscriptionPeriod)
      .createQueryBuilder('period')
      .select('COALESCE(MAX(period.sequence_number), 0) + 1', 'next')
      .where('period.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ next: string }>();
    return Number(row?.next ?? 1);
  }

  /**
   * Plan 13 Phase 2 (tasks 2.4–2.8): Platform Admin approval of a paid period.
   *
   * Sets `admin_activation_status = approved` with the actor/time/reason and
   * writes a `period_admin_activation_approved` event. Idempotent: an already
   * approved period returns unchanged. A future period stays `upcoming` — the
   * calendar scheduler activates it at its Yangon boundary (Phase 3 makes the
   * scheduler approval-aware). An expired/cancelled/unpaid period is rejected
   * and never reactivated. `operational` is true only when the period is
   * calendar-active, paid, approved, and inside its half-open window.
   */
  async adminApprovePeriod(
    tenantId: string,
    periodId: string,
    input: { approvedBy?: string | null; reason?: string; now?: Date } = {},
  ): Promise<{ period: TenantSubscriptionPeriod; operational: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockTenantPeriods(manager, tenantId);
      const periodRepository = manager.getRepository(TenantSubscriptionPeriod);
      const period = await periodRepository.findOne({
        where: { id: periodId, tenantId },
      });
      if (!period) {
        throw new NotFoundException('Subscription period not found');
      }
      if (period.periodType !== 'paid') {
        throw new ConflictException(
          'Only paid subscription periods can be admin-activated.',
        );
      }
      if (period.paymentStatus !== 'paid') {
        throw new ConflictException(
          `Period payment is '${period.paymentStatus}'; confirm payment before activation.`,
        );
      }
      if (
        period.periodStatus === 'expired' ||
        period.periodStatus === 'cancelled'
      ) {
        throw new ConflictException(
          `Period is '${period.periodStatus}' and cannot be activated.`,
        );
      }
      if (period.adminActivationStatus === 'approved') {
        return {
          period,
          operational: this.isOperationalPeriod(
            period,
            input.now ?? new Date(),
          ),
        };
      }

      const now = input.now ?? new Date();
      const monthEnd = period.monthEndAt ?? period.periodEndAt;
      if (monthEnd && now.getTime() >= monthEnd.getTime()) {
        throw new ConflictException(
          'Period has already ended; approval is no longer possible and the period cannot be reactivated.',
        );
      }

      period.adminActivationStatus = 'approved';
      period.adminActivatedAt = now;
      period.adminActivatedBy = input.approvedBy ?? null;
      period.adminActivationReason = input.reason?.trim() || 'platform-admin';

      // A fresh paid period scheduled after a trial may already have reached
      // its exact trial-end start when the Admin approves it. Activate it now;
      // future prepaid calendar periods remain upcoming until their boundary.
      const effectiveStart = period.periodStartAt ?? period.monthStartAt;
      if (
        period.periodStatus === 'upcoming' &&
        effectiveStart &&
        now.getTime() >= effectiveStart.getTime()
      ) {
        assertPeriodStatusTransition(period.periodStatus, 'active');
        period.periodStatus = 'active';
        period.activatedAt = now;
        period.activationReason = 'scheduled';
      }
      const saved = await periodRepository.save(period);

      const eventRepository = manager.getRepository(SubscriptionPeriodEvent);
      const idempotencyKey = `period-admin-activation:${period.id}`;
      const existingEvent = await eventRepository.findOne({
        where: { idempotencyKey },
      });
      if (!existingEvent) {
        await eventRepository.save(
          eventRepository.create({
            subscriptionPeriodId: period.id,
            tenantId,
            eventType: 'period_admin_activation_approved',
            previousStatus: null,
            newStatus: period.periodStatus,
            actorType: 'platform_admin',
            actorId: input.approvedBy ?? 'platform-admin',
            source: 'platform-admin-period-activation',
            reason:
              input.reason?.trim() || 'Platform Admin approved the paid period',
            idempotencyKey,
            metadata: {
              adminActivation: {
                previousStatus: 'pending',
                newStatus: 'approved',
                activatedAt: now.toISOString(),
              },
              periodStatus: period.periodStatus,
              paymentStatus: period.paymentStatus,
            },
          }),
        );
      }

      return {
        period: saved,
        operational: this.isOperationalPeriod(saved, now),
      };
    });
  }

  private isOperationalPeriod(
    period: TenantSubscriptionPeriod,
    now: Date,
  ): boolean {
    if (period.periodStatus !== 'active') return false;
    if (period.paymentStatus !== 'paid') return false;
    if (period.adminActivationStatus !== 'approved') return false;
    const startAt = period.periodStartAt ?? period.monthStartAt;
    const endAt = period.periodEndAt ?? period.monthEndAt;
    if (!startAt || !endAt) return false;
    return (
      now.getTime() >= startAt.getTime() && now.getTime() < endAt.getTime()
    );
  }
}

/**
 * Trial entitlements stay outside the paid period queue (task 2.10): they
 * must never produce a paid period row, be targeted by top-ups, or consume
 * purchased-period quota.
 *
 * Plan 14 Phase 1: this remains only a legacy-compatibility read used by the
 * top-up gate until Phase 3 routes trial denial through the period ledger.
 */
export function isTrialEntitlement(
  entitlement: TenantEntitlement | null | undefined,
): boolean {
  return (
    !!entitlement &&
    (entitlement.state === 'trial_active' ||
      entitlement.state === 'trial_grace')
  );
}

/**
 * Plan 14 Phase 1 (task 1.6): validate a plan as a legal trial plan. Returns
 * the list of violations (empty when valid). Used by the plan-level validator
 * and by trial-period provisioning so the server is the single authority.
 */
export function validateTrialPlanConfiguration(
  plan: Pick<
    SubscriptionPlan,
    | 'planType'
    | 'durationDays'
    | 'requestable'
    | 'renewable'
    | 'topUpAllowed'
    | 'autoApprove'
  >,
): string[] {
  if (plan.planType !== 'trial') {
    return ['planType must be trial for a trial plan'];
  }
  const violations: string[] = [];
  if (!Number.isInteger(plan.durationDays) || plan.durationDays <= 0) {
    violations.push('durationDays must be a positive integer for trial plans');
  }
  if (plan.requestable) {
    violations.push('requestable must be false for trial plans');
  }
  if (plan.renewable) {
    violations.push('renewable must be false for trial plans');
  }
  if (plan.topUpAllowed) {
    violations.push('topUpAllowed must be false for trial plans');
  }
  if (!plan.autoApprove) {
    violations.push('autoApprove must be true for trial plans');
  }
  return violations;
}

/**
 * Plan 14 Phase 1 (task 1.7): trial operational validity with exact expiry.
 * A trial is operational only while `now < period_end_at`; no renewal, no
 * automatic grace period. Trial periods use exact elapsed-day bounds, so this
 * helper reads `period_end_at` directly (never the calendar month fields).
 */
export function isTrialOperational(input: {
  period: Pick<
    TenantSubscriptionPeriod,
    | 'periodType'
    | 'periodStatus'
    | 'paymentStatus'
    | 'adminActivationStatus'
    | 'periodStartAt'
    | 'periodEndAt'
  >;
  now?: Date;
}): boolean {
  const { period } = input;
  const now = input.now ?? new Date();
  if (period.periodType !== 'trial') return false;
  if (period.periodStatus !== 'active') return false;
  if (period.paymentStatus !== 'not_required') return false;
  if (period.adminActivationStatus !== 'approved') return false;
  if (!period.periodStartAt || !period.periodEndAt) return false;
  return (
    now.getTime() >= period.periodStartAt.getTime() &&
    now.getTime() < period.periodEndAt.getTime()
  );
}

/**
 * Plan 14 Phase 1 (task 1.7): exact trial expiry. `true` when the trial has
 * ended (now >= period_end_at). No grace window.
 */
export function isTrialExpired(input: {
  period: Pick<TenantSubscriptionPeriod, 'periodEndAt'>;
  now?: Date;
}): boolean {
  const endAt = input.period.periodEndAt;
  if (!endAt) return false;
  return (input.now ?? new Date()).getTime() >= endAt.getTime();
}

/**
 * Plan 14 Phase 1 (task 1.5): create a trial period row from a validated
 * trial plan. This is deliberately separate from `createPaidPeriod`: it never
 * accepts a billing record, never uses a Yangon calendar month, and always
 * writes `period_type = trial`, `payment_status = not_required`, and
 * `admin_activation_status = approved`. Callers must still persist the row
 * through the same period repository; this builds the entity value.
 */
export function buildTrialPeriodEntity(input: CreateTrialPeriodInput): {
  tenantId: string;
  planId: string;
  periodType: 'trial';
  periodStatus: 'active';
  paymentStatus: 'not_required';
  adminActivationStatus: 'approved';
  billingRecordId: null;
  durationDays: number;
  periodStartAt: Date;
  periodEndAt: Date;
  monthStartAt: null;
  monthEndAt: null;
  startOption: null;
  quotaSnapshot: SubscriptionQuotaSnapshot;
  metadata: Record<string, unknown>;
} {
  const violations = validateTrialPlanConfiguration(input.plan);
  if (violations.length > 0) {
    throw new BadRequestException(
      `Invalid trial plan configuration: ${violations.join('; ')}`,
    );
  }
  if (!Number.isInteger(input.durationDays) || input.durationDays <= 0) {
    throw new BadRequestException(
      'Trial durationDays must be a positive integer.',
    );
  }
  const periodEndAt = new Date(input.periodStartAt);
  periodEndAt.setUTCDate(periodEndAt.getUTCDate() + input.durationDays);
  return {
    tenantId: input.tenantId,
    planId: input.plan.id,
    periodType: 'trial',
    periodStatus: 'active',
    paymentStatus: 'not_required',
    adminActivationStatus: 'approved',
    billingRecordId: null,
    durationDays: input.durationDays,
    periodStartAt: new Date(input.periodStartAt),
    periodEndAt,
    monthStartAt: null,
    monthEndAt: null,
    startOption: null,
    quotaSnapshot: buildQuotaSnapshot(input.plan),
    metadata: input.metadata ?? {},
  };
}

/** Contract assertion helper used by callers that mutate a period. */
export function assertPeriodMutation(
  fromStatus: SubscriptionPeriodStatus,
  toStatus: SubscriptionPeriodStatus,
  fromPayment: SubscriptionPeriodPaymentStatus,
  toPayment: SubscriptionPeriodPaymentStatus,
): void {
  assertPeriodStatusTransition(fromStatus, toStatus);
  assertPaymentStatusTransition(fromPayment, toPayment);
}
