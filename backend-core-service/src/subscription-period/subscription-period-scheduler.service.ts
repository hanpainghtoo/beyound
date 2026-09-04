import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { DataSource, Repository } from 'typeorm';

import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { TenantEntitlementEvent } from '../entitlement/entities/tenant-entitlement-event.entity';
import { TenantSubscriptionAddOnComponent } from '../subscription-add-on/entities/tenant-subscription-add-on-component.entity';
import { TenantSubscriptionAddOnPurchase } from '../subscription-add-on/entities/tenant-subscription-add-on-purchase.entity';
import { TenantSubscriptionAddOnPurchaseEvent } from '../subscription-add-on/entities/tenant-subscription-add-on-purchase-event.entity';
import { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import { SubscriptionPeriodEvent } from './entities/subscription-period-event.entity';
import { assertPeriodStatusTransition } from './subscription-period.transitions';
import { yangonMonthStart } from './yangon-month.util';

export type SubscriptionPeriodSchedulerResult = {
  tenantsScanned: number;
  tenantsSkipped: number;
  periodsExpired: number;
  periodsActivated: number;
  purchasesExpired: number;
  // Plan 14 Phase 3 (task 3.9): exact-day trial expiry count.
  trialPeriodsExpired: number;
  reconciliationExceptions: number;
};

export type SubscriptionPeriodSchedulerHealth = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  lastResult: SubscriptionPeriodSchedulerResult | null;
};

/**
 * Owns the calendar-month transition at the Yangon boundary (Plan 9 Phase 8).
 *
 * This deliberately does not reuse the older entitlement grace scheduler:
 * that scheduler handles trial/payment-grace policy, while this service owns
 * purchased-period expiry, attached top-up expiry, and scheduled prepaid
 * activation. The interval is opt-in so deployment can be observed before it
 * mutates period state.
 */
@Injectable()
export class SubscriptionPeriodSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SubscriptionPeriodSchedulerService.name);
  private scheduler: NodeJS.Timeout | null = null;
  private schedulerRunning = false;
  private schedulerHealth: SubscriptionPeriodSchedulerHealth = {
    enabled: process.env.SUBSCRIPTION_PERIOD_SCHEDULER_ENABLED === 'true',
    running: false,
    intervalMs: Number.parseInt(
      process.env.SUBSCRIPTION_PERIOD_SCHEDULER_INTERVAL_MS || '300000',
      10,
    ),
    lastStartedAt: null,
    lastCompletedAt: null,
    lastFailedAt: null,
    lastError: null,
    lastResult: null,
  };

  constructor(
    @InjectRepository(TenantSubscriptionPeriod)
    private readonly periodRepository: Repository<TenantSubscriptionPeriod>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    if (!this.schedulerHealth.enabled) return;
    const intervalMs =
      Number.isFinite(this.schedulerHealth.intervalMs) &&
      this.schedulerHealth.intervalMs > 0
        ? this.schedulerHealth.intervalMs
        : 300000;
    this.schedulerHealth.intervalMs = intervalMs;
    this.scheduler = setInterval(() => {
      void this.runOnce();
    }, intervalMs);
    this.scheduler.unref?.();
    void this.runOnce();
  }

  onModuleDestroy() {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
  }

  getHealth(): SubscriptionPeriodSchedulerHealth {
    return {
      ...this.schedulerHealth,
      running: this.schedulerRunning,
      lastResult: this.schedulerHealth.lastResult
        ? { ...this.schedulerHealth.lastResult }
        : null,
    };
  }

  async runOnce(now = new Date()): Promise<SubscriptionPeriodSchedulerHealth> {
    if (this.schedulerRunning) return this.getHealth();

    this.schedulerRunning = true;
    this.schedulerHealth.lastStartedAt = now.toISOString();
    try {
      const result = await this.processDuePeriods(now);
      this.schedulerHealth.lastResult = result;
      this.schedulerHealth.lastCompletedAt = new Date().toISOString();
      this.schedulerHealth.lastError = null;
      this.logger.log(
        `Scheduler tick completed: scanned=${result.tenantsScanned} expired=${result.periodsExpired} activated=${result.periodsActivated} trialsExpired=${result.trialPeriodsExpired} purchasesExpired=${result.purchasesExpired} skipped=${result.tenantsSkipped} errors=${result.reconciliationExceptions}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown subscription period scheduler failure';
      this.schedulerHealth.lastFailedAt = new Date().toISOString();
      this.schedulerHealth.lastError = message;
      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.schedulerRunning = false;
    }
    return this.getHealth();
  }

  async processDuePeriods(
    now = new Date(),
  ): Promise<SubscriptionPeriodSchedulerResult> {
    const candidates = await this.periodRepository.find({
      where: { periodStatus: 'active' },
    });
    const upcomingCandidates = await this.periodRepository.find({
      where: { periodStatus: 'upcoming' },
    });
    const dueUpcomingPeriods = upcomingCandidates.filter(
      (period) =>
        period.periodType === 'paid' &&
        period.paymentStatus === 'paid' &&
        period.adminActivationStatus === 'approved' &&
        this.isDueToStart(period, now) &&
        !this.isDue(period, now),
    );
    const tenantIds = Array.from(
      new Set(
        candidates
          .filter(
            (period) => period.periodType === 'paid' && this.isDue(period, now),
          )
          .map((period) => period.tenantId),
      ),
    );
    // Plan 14 Phase 3 (task 3.11): trial expiry is processed in its own pass
    // so the paid calendar-month scheduler never treats a trial period as a
    // monthly prepaid period.
    const dueTrialPeriods = candidates.filter(
      (period) => period.periodType === 'trial' && this.isDue(period, now),
    );
    const result: SubscriptionPeriodSchedulerResult = {
      tenantsScanned: tenantIds.length,
      tenantsSkipped: 0,
      periodsExpired: 0,
      periodsActivated: 0,
      purchasesExpired: 0,
      trialPeriodsExpired: 0,
      reconciliationExceptions: 0,
    };

    for (const trialPeriod of dueTrialPeriods) {
      try {
        const expired = await this.processTrialExpiry(trialPeriod, now);
        if (expired) result.trialPeriodsExpired += 1;
      } catch (error) {
        result.reconciliationExceptions += 1;
        this.logger.error(
          `Trial expiry skipped for period ${trialPeriod.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    // Scheduled fresh-after-trial periods use their exact trial-end
    // `period_start_at`, not only the first day of the Yangon month. Process
    // them independently from month-boundary expiry so a paid, approved plan
    // becomes active immediately when the trial ends.
    for (const upcomingPeriod of dueUpcomingPeriods) {
      try {
        const activated = await this.processDueUpcomingPeriod(
          upcomingPeriod,
          now,
        );
        if (activated) result.periodsActivated += 1;
      } catch (error) {
        result.reconciliationExceptions += 1;
        this.logger.error(
          `Scheduled paid period activation skipped for ${upcomingPeriod.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    for (const tenantId of tenantIds) {
      try {
        const transition = await this.processTenant(tenantId, now);
        result.periodsExpired += transition.periodExpired ? 1 : 0;
        result.periodsActivated += transition.periodActivated ? 1 : 0;
        result.purchasesExpired += transition.purchasesExpired;
        result.reconciliationExceptions += transition.reconciliationException
          ? 1
          : 0;
      } catch (error) {
        result.tenantsSkipped += 1;
        result.reconciliationExceptions += 1;
        this.logger.error(
          `Subscription period transition skipped for tenant ${tenantId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    return result;
  }

  private async processTenant(tenantId: string, now: Date) {
    return this.dataSource.transaction(async (manager) => {
      const periodRepository = manager.getRepository(TenantSubscriptionPeriod);
      const entitlementRepository = manager.getRepository(TenantEntitlement);
      const entitlementEventRepository = manager.getRepository(
        TenantEntitlementEvent,
      );
      const periods = await periodRepository
        .createQueryBuilder('period')
        .where('period.tenant_id = :tenantId', { tenantId })
        .orderBy('period.sequence_number', 'ASC')
        .setLock('pessimistic_write')
        .getMany();

      const activePeriods = periods.filter(
        (period) =>
          period.periodType === 'paid' && period.periodStatus === 'active',
      );
      if (activePeriods.length > 1) {
        throw new Error(
          `Tenant ${tenantId} has ${activePeriods.length} active periods; scheduler will not guess an authoritative row.`,
        );
      }
      const current = activePeriods[0];
      if (!current || !this.isDue(current, now)) {
        return {
          periodExpired: false,
          periodActivated: false,
          purchasesExpired: 0,
          reconciliationException: false,
        };
      }

      const expiryKey = `period-expiry:${current.id}`;
      const periodEventRepository = manager.getRepository(
        SubscriptionPeriodEvent,
      );
      const existingExpiryEvent = await periodEventRepository.findOne({
        where: { idempotencyKey: expiryKey },
      });
      if (!existingExpiryEvent) {
        assertPeriodStatusTransition(current.periodStatus, 'expired');
        current.periodStatus = 'expired';
        current.expiredAt = now;
        current.endReason = 'scheduled_expiry';
        await periodRepository.save(current);
        await periodEventRepository.save(
          periodEventRepository.create({
            subscriptionPeriodId: current.id,
            tenantId,
            eventType: 'period_expired',
            previousStatus: 'active',
            newStatus: 'expired',
            actorType: 'system',
            actorId: 'subscription-period-scheduler',
            source: 'subscription-period-scheduler',
            reason: 'Active calendar-month period expired at Yangon boundary',
            idempotencyKey: expiryKey,
            metadata: {
              expiredAt: now.toISOString(),
              monthEndAt: current.monthEndAt?.toISOString() ?? null,
            },
          }),
        );
      }

      const currentYangonMonthStart = yangonMonthStart(now);
      const entitlement = await entitlementRepository.findOne({
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      let reconciliationException = !entitlement;
      if (entitlement) {
        const nextPaidPeriod = periods
          .filter(
            (period) =>
              period.periodType === 'paid' &&
              period.periodStatus === 'upcoming' &&
              period.paymentStatus === 'paid' &&
              period.adminActivationStatus === 'approved' &&
              this.periodStart(period).getTime() ===
                currentYangonMonthStart.getTime() &&
              now.getTime() < this.periodEnd(period).getTime(),
          )
          .sort((left, right) => left.sequenceNumber - right.sequenceNumber)[0];
        const previousState = entitlement.state;
        if (nextPaidPeriod) {
          entitlement.state = 'paid_active';
          entitlement.planId = nextPaidPeriod.planId;
          entitlement.paidPeriodStartsAt = this.periodStart(nextPaidPeriod);
          entitlement.paidPeriodEndsAt = this.periodEnd(nextPaidPeriod);
          entitlement.graceEndsAt = null;
          entitlement.suspendedAt = null;
          entitlement.suspensionReason = null;
          entitlement.reactivationRequestedAt = null;
          entitlement.reactivationEvidence = {
            source: 'subscription-period-scheduler',
            periodId: nextPaidPeriod.id,
            activatedAt: now.toISOString(),
          };
        } else {
          entitlement.state = 'payment_grace';
          entitlement.paidPeriodStartsAt = this.periodStart(current);
          entitlement.paidPeriodEndsAt = this.periodEnd(current);
          entitlement.graceEndsAt = this.addUtcDays(now, 7);
          entitlement.suspensionReason = 'No paid upcoming calendar period';
        }
        await entitlementRepository.save(entitlement);
        await entitlementEventRepository.save(
          entitlementEventRepository.create({
            entitlementId: entitlement.id,
            tenantId,
            previousState,
            newState: entitlement.state,
            actorType: 'system',
            actorId: 'subscription-period-scheduler',
            source: 'expiry_scheduler',
            reason: nextPaidPeriod
              ? 'Active entitlement projected to the newly activated Yangon period'
              : 'Active period expired without a paid upcoming period; payment grace applied',
            idempotencyKey: `period-projection:${current.id}:${nextPaidPeriod?.id ?? 'payment-grace'}`,
            metadata: {
              periodId: nextPaidPeriod?.id ?? current.id,
              transitionedAt: now.toISOString(),
            },
          }),
        );
      }

      const purchases = await manager
        .getRepository(TenantSubscriptionAddOnPurchase)
        .find({ where: { tenantId, subscriptionPeriodId: current.id } });
      let purchasesExpired = 0;
      const purchaseEventRepository = manager.getRepository(
        TenantSubscriptionAddOnPurchaseEvent,
      );
      const componentRepository = manager.getRepository(
        TenantSubscriptionAddOnComponent,
      );
      const purchaseRepository = manager.getRepository(
        TenantSubscriptionAddOnPurchase,
      );
      for (const purchase of purchases) {
        if (['cancelled', 'expired'].includes(purchase.purchaseStatus)) {
          continue;
        }
        const purchaseKey = `period-expiry:${current.id}:purchase:${purchase.id}`;
        const existingPurchaseEvent = await purchaseEventRepository.findOne({
          where: { idempotencyKey: purchaseKey },
        });
        if (existingPurchaseEvent) continue;

        const previousPurchaseStatus = purchase.purchaseStatus;
        purchase.purchaseStatus = 'expired';
        await purchaseRepository.save(purchase);
        const components = await componentRepository.find({
          where: { purchaseId: purchase.id },
        });
        for (const component of components) {
          component.componentStatus = 'expired';
          await componentRepository.save(component);
        }
        await purchaseEventRepository.save(
          purchaseEventRepository.create({
            purchaseId: purchase.id,
            tenantId,
            eventType: 'add_on_expired',
            previousStatus:
              previousPurchaseStatus === 'active' ? 'active' : 'pending',
            newStatus: 'expired',
            actorType: 'system',
            actorId: 'subscription-period-scheduler',
            source: 'subscription-period-scheduler',
            reason: 'Top-up expired with its target calendar-month period',
            idempotencyKey: purchaseKey,
            metadata: { expiredAt: now.toISOString(), periodId: current.id },
          }),
        );
        purchasesExpired += 1;
      }

      const currentMonthUpcoming = periods
        .filter(
          (period) =>
            period.periodType === 'paid' &&
            period.periodStatus === 'upcoming' &&
            this.periodStart(period).getTime() ===
              currentYangonMonthStart.getTime() &&
            now.getTime() < this.periodEnd(period).getTime(),
        )
        .sort((left, right) => left.sequenceNumber - right.sequenceNumber);
      const upcoming = currentMonthUpcoming.find(
        (period) =>
          period.paymentStatus === 'paid' &&
          period.adminActivationStatus === 'approved',
      );

      let periodActivated = false;
      reconciliationException =
        reconciliationException ||
        (currentMonthUpcoming.length > 0 && !upcoming);
      if (upcoming) {
        const activationKey = `period-activation:${upcoming.id}`;
        const existingActivationEvent = await periodEventRepository.findOne({
          where: { idempotencyKey: activationKey },
        });
        if (!existingActivationEvent) {
          assertPeriodStatusTransition(upcoming.periodStatus, 'active');
          upcoming.periodStatus = 'active';
          upcoming.activatedAt = now;
          upcoming.activationReason = 'scheduled';
          await periodRepository.save(upcoming);
          await periodEventRepository.save(
            periodEventRepository.create({
              subscriptionPeriodId: upcoming.id,
              tenantId,
              eventType: 'period_activated',
              previousStatus: 'upcoming',
              newStatus: 'active',
              actorType: 'system',
              actorId: 'subscription-period-scheduler',
              source: 'subscription-period-scheduler',
              reason:
                'Earliest paid prepaid period activated at Yangon boundary',
              idempotencyKey: activationKey,
              metadata: {
                activatedAt: now.toISOString(),
                monthStartAt: this.periodStart(upcoming).toISOString(),
              },
            }),
          );
          periodActivated = true;
        }
      }

      return {
        periodExpired: !existingExpiryEvent,
        periodActivated,
        purchasesExpired,
        reconciliationException,
      };
    });
  }

  private async processDueUpcomingPeriod(
    candidate: TenantSubscriptionPeriod,
    now: Date,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const periodRepository = manager.getRepository(TenantSubscriptionPeriod);
      const eventRepository = manager.getRepository(SubscriptionPeriodEvent);
      const periods = await periodRepository
        .createQueryBuilder('period')
        .where('period.tenant_id = :tenantId', { tenantId: candidate.tenantId })
        .setLock('pessimistic_write')
        .getMany();
      const period = periods.find((row) => row.id === candidate.id);
      if (!period || period.periodType !== 'paid') return false;
      if (
        period.periodStatus !== 'upcoming' ||
        period.paymentStatus !== 'paid' ||
        period.adminActivationStatus !== 'approved' ||
        !this.isDueToStart(period, now) ||
        this.isDue(period, now)
      ) {
        return false;
      }
      if (
        periods.some(
          (row) =>
            row.id !== period.id &&
            row.periodType === 'paid' &&
            row.periodStatus === 'active',
        )
      ) {
        return false;
      }

      assertPeriodStatusTransition(period.periodStatus, 'active');
      period.periodStatus = 'active';
      period.activatedAt = now;
      period.activationReason = 'scheduled';
      await periodRepository.save(period);

      const activationKey = `period-activation:${period.id}`;
      const existingActivationEvent = await eventRepository.findOne({
        where: { idempotencyKey: activationKey },
      });
      if (!existingActivationEvent) {
        await eventRepository.save(
          eventRepository.create({
            subscriptionPeriodId: period.id,
            tenantId: period.tenantId,
            eventType: 'period_activated',
            previousStatus: 'upcoming',
            newStatus: 'active',
            actorType: 'system',
            actorId: 'subscription-period-scheduler',
            source: 'subscription-period-scheduler',
            reason: 'Paid period activated at its scheduled effective start',
            idempotencyKey: activationKey,
            metadata: {
              activatedAt: now.toISOString(),
              periodStartAt: this.periodStart(period).toISOString(),
              scheduledAfterTrial:
                period.metadata?.purchaseMode === 'after_trial',
            },
          }),
        );
      }

      const entitlementRepository = manager.getRepository(TenantEntitlement);
      const entitlementEventRepository = manager.getRepository(
        TenantEntitlementEvent,
      );
      const entitlement = await entitlementRepository.findOne({
        where: { tenantId: period.tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (entitlement) {
        const previousState = entitlement.state;
        entitlement.state = 'paid_active';
        entitlement.planId = period.planId;
        entitlement.paidPeriodStartsAt = this.periodStart(period);
        entitlement.paidPeriodEndsAt = this.periodEnd(period);
        entitlement.graceEndsAt = null;
        entitlement.suspendedAt = null;
        entitlement.suspensionReason = null;
        entitlement.reactivationRequestedAt = null;
        entitlement.reactivationEvidence = {
          source: 'subscription-period-scheduler',
          periodId: period.id,
          activatedAt: now.toISOString(),
        };
        await entitlementRepository.save(entitlement);
        const projectionKey = `period-projection-start:${period.id}`;
        const existingProjection = await entitlementEventRepository.findOne({
          where: { idempotencyKey: projectionKey },
        });
        if (!existingProjection) {
          await entitlementEventRepository.save(
            entitlementEventRepository.create({
              entitlementId: entitlement.id,
              tenantId: period.tenantId,
              previousState,
              newState: 'paid_active',
              actorType: 'system',
              actorId: 'subscription-period-scheduler',
              source: 'period_activation',
              reason: 'Scheduled paid period became the effective entitlement',
              idempotencyKey: projectionKey,
              metadata: { periodId: period.id, activatedAt: now.toISOString() },
            }),
          );
        }
      }
      return true;
    });
  }

  /**
   * Plan 14 Phase 3 (task 3.9): exact-day trial expiry. Locks the trial row,
   * marks it `expired` at `period_end_at`, and writes a `trial_period_expired`
   * event idempotently. A trial never grants grace, never renews, and never
   * transitions into a paid period row — conversion creates a separate paid
   * period (Phase 4).
   */
  private async processTrialExpiry(
    trialPeriod: TenantSubscriptionPeriod,
    now: Date,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const periodRepository = manager.getRepository(TenantSubscriptionPeriod);
      const eventRepository = manager.getRepository(SubscriptionPeriodEvent);
      const locked = await periodRepository
        .createQueryBuilder('period')
        .where('period.id = :id', { id: trialPeriod.id })
        .setLock('pessimistic_write')
        .getOne();
      if (!locked || locked.periodType !== 'trial') return false;
      if (locked.periodStatus !== 'active') return false;
      if (!this.isDue(locked, now)) return false;

      const expiryKey = `trial-expiry:${locked.id}`;
      const existing = await eventRepository.findOne({
        where: { idempotencyKey: expiryKey },
      });
      if (existing) return false;

      assertPeriodStatusTransition(locked.periodStatus, 'expired');
      locked.periodStatus = 'expired';
      locked.expiredAt = now;
      locked.endReason = 'scheduled_expiry';
      await periodRepository.save(locked);

      const entitlementRepository = manager.getRepository(TenantEntitlement);
      const entitlementEventRepository = manager.getRepository(
        TenantEntitlementEvent,
      );
      const entitlement = await entitlementRepository.findOne({
        where: { tenantId: locked.tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (entitlement && entitlement.state === 'trial_active') {
        const previousState = entitlement.state;
        entitlement.state = 'expired';
        entitlement.version = (entitlement.version ?? 0) + 1;
        await entitlementRepository.save(entitlement);
        await entitlementEventRepository.save(
          entitlementEventRepository.create({
            entitlementId: entitlement.id,
            tenantId: locked.tenantId,
            previousState,
            newState: 'expired',
            actorType: 'system',
            actorId: 'subscription-period-scheduler',
            source: 'subscription-period-scheduler',
            reason: 'Trial period expired at its exact day boundary',
          }),
        );
      }

      await eventRepository.save(
        eventRepository.create({
          subscriptionPeriodId: locked.id,
          tenantId: locked.tenantId,
          eventType: 'trial_period_expired',
          previousStatus: 'active',
          newStatus: 'expired',
          actorType: 'system',
          actorId: 'subscription-period-scheduler',
          source: 'subscription-period-scheduler',
          reason: 'Trial period expired at its exact day boundary',
          idempotencyKey: expiryKey,
          metadata: {
            expiredAt: now.toISOString(),
            periodEndAt: locked.periodEndAt?.toISOString() ?? null,
          },
        }),
      );
      return true;
    });
  }

  private isDue(period: TenantSubscriptionPeriod, now: Date) {
    return this.periodEnd(period).getTime() <= now.getTime();
  }

  private isDueToStart(period: TenantSubscriptionPeriod, now: Date) {
    return this.periodStart(period).getTime() <= now.getTime();
  }

  private periodStart(period: TenantSubscriptionPeriod) {
    return period.periodStartAt ?? period.monthStartAt ?? new Date(0);
  }

  private periodEnd(period: TenantSubscriptionPeriod) {
    return period.periodEndAt ?? period.monthEndAt ?? new Date(0);
  }

  private addUtcDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }
}
