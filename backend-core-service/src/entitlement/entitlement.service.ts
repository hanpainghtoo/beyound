import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  LessThanOrEqual,
  Repository,
} from 'typeorm';

import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import {
  TenantEntitlement,
  type EntitlementLifecycleState,
} from './entities/tenant-entitlement.entity';
import { TenantEntitlementEvent } from './entities/tenant-entitlement-event.entity';

export type EntitlementActor = {
  type: 'system' | 'tenant_user' | 'platform_admin' | 'payment';
  id?: string | null;
};

export type EntitlementTransitionSource =
  | 'registration'
  | 'expiry_scheduler'
  | 'payment_activation'
  | 'platform_admin'
  | 'system';

export const operationallyAllowedEntitlementStates: EntitlementLifecycleState[] =
  ['trial_active', 'trial_grace', 'paid_active', 'payment_grace'];

const allowedTransitions: Record<
  EntitlementLifecycleState,
  EntitlementLifecycleState[]
> = {
  trial_active: ['trial_grace', 'paid_active', 'suspended', 'cancelled'],
  trial_grace: ['expired', 'paid_active', 'suspended', 'cancelled'],
  paid_active: ['payment_grace', 'suspended', 'cancelled'],
  payment_grace: ['expired', 'paid_active', 'suspended', 'cancelled'],
  suspended: ['reactivation_pending', 'paid_active', 'cancelled'],
  expired: ['reactivation_pending', 'paid_active', 'cancelled'],
  cancelled: ['reactivation_pending'],
  reactivation_pending: ['paid_active', 'expired', 'cancelled'],
};

export type EntitlementExpirySchedulerHealth = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  lastResult: {
    trialGrace: number;
    trialExpired: number;
    paymentGrace: number;
    paymentExpired: number;
  } | null;
};

@Injectable()
export class EntitlementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EntitlementService.name);
  private scheduler: NodeJS.Timeout | null = null;
  private schedulerRunning = false;
  private schedulerHealth: EntitlementExpirySchedulerHealth = {
    enabled: process.env.ENTITLEMENT_EXPIRY_SCHEDULER_ENABLED !== 'false',
    running: false,
    intervalMs: Number.parseInt(
      process.env.ENTITLEMENT_EXPIRY_INTERVAL_MS || '300000',
      10,
    ),
    lastStartedAt: null,
    lastCompletedAt: null,
    lastFailedAt: null,
    lastError: null,
    lastResult: null,
  };

  constructor(
    @InjectRepository(TenantEntitlement)
    private readonly entitlementRepository: Repository<TenantEntitlement>,
    @InjectRepository(TenantEntitlementEvent)
    private readonly eventRepository: Repository<TenantEntitlementEvent>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepository: Repository<SubscriptionPlan>,
    private readonly dataSource: DataSource,
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
      void this.runExpirySchedulerOnce();
    }, intervalMs);
    this.scheduler.unref?.();
    void this.runExpirySchedulerOnce();
  }

  onModuleDestroy() {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
  }

  getExpirySchedulerHealth(): EntitlementExpirySchedulerHealth {
    return {
      ...this.schedulerHealth,
      running: this.schedulerRunning,
      lastResult: this.schedulerHealth.lastResult
        ? { ...this.schedulerHealth.lastResult }
        : null,
    };
  }

  async createInitialTrial(input: {
    tenantId: string;
    planId: string;
    trialStartsAt: Date;
    trialDays: number;
    actor: EntitlementActor;
    manager?: EntityManager;
  }): Promise<TenantEntitlement> {
    const manager = input.manager ?? this.dataSource.manager;
    const existing = await manager.getRepository(TenantEntitlement).findOne({
      where: { tenantId: input.tenantId },
    });
    if (existing) return existing;

    const plan = await manager.getRepository(SubscriptionPlan).findOne({
      where: { id: input.planId, status: 'active' },
    });
    if (!plan) {
      throw new BadRequestException(
        'The selected subscription plan is no longer available',
      );
    }

    const trialEndsAt = new Date(input.trialStartsAt);
    trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + input.trialDays);

    const entitlement = manager.getRepository(TenantEntitlement).create({
      tenantId: input.tenantId,
      planId: input.planId,
      state: 'trial_active',
      trialStartsAt: input.trialStartsAt,
      trialEndsAt,
      graceEndsAt: null,
      paidPeriodStartsAt: null,
      paidPeriodEndsAt: null,
      suspendedAt: null,
      suspensionReason: null,
      cancelledAt: null,
      cancellationReason: null,
      reactivationRequestedAt: null,
      reactivationEvidence: {},
    });
    const saved = await manager
      .getRepository(TenantEntitlement)
      .save(entitlement);
    await this.recordEvent(manager, saved, null, saved.state, {
      actor: input.actor,
      source: 'registration',
      reason: 'Initial server-approved trial entitlement created',
      idempotencyKey: `registration:${input.tenantId}`,
      metadata: { trialDays: input.trialDays },
    });
    return saved;
  }

  async getTenantEntitlement(tenantId: string): Promise<TenantEntitlement> {
    const entitlement = await this.entitlementRepository.findOne({
      where: { tenantId },
    });
    if (!entitlement) {
      throw new NotFoundException('Tenant entitlement is not configured');
    }
    return entitlement;
  }

  async assertTenantCanOperate(tenantId: string): Promise<TenantEntitlement> {
    const entitlement = await this.getTenantEntitlement(tenantId);
    if (!operationallyAllowedEntitlementStates.includes(entitlement.state)) {
      throw new ForbiddenException(
        `Tenant entitlement is ${entitlement.state}`,
      );
    }
    return entitlement;
  }

  async transition(input: {
    tenantId: string;
    toState: EntitlementLifecycleState;
    actor: EntitlementActor;
    source: EntitlementTransitionSource;
    reason: string;
    idempotencyKey?: string | null;
    now?: Date;
    patch?: Partial<TenantEntitlement>;
  }): Promise<TenantEntitlement> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TenantEntitlement);
      const entitlement = await repository.findOne({
        where: { tenantId: input.tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entitlement) {
        throw new NotFoundException('Tenant entitlement is not configured');
      }
      if (entitlement.state === input.toState) return entitlement;
      this.assertTransitionAllowed(entitlement.state, input.toState);

      const previousState = entitlement.state;
      Object.assign(entitlement, input.patch ?? {});
      entitlement.state = input.toState;
      const saved = await repository.save(entitlement);
      await this.recordEvent(manager, saved, previousState, input.toState, {
        actor: input.actor,
        source: input.source,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey ?? null,
        metadata: { transitionedAt: (input.now ?? new Date()).toISOString() },
      });
      return saved;
    });
  }

  async processExpiry(
    now = new Date(),
    graceDays = 7,
  ): Promise<{
    trialGrace: number;
    trialExpired: number;
    paymentGrace: number;
    paymentExpired: number;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TenantEntitlement);
      const due = await repository.find({
        where: [
          { state: 'trial_active', trialEndsAt: LessThanOrEqual(now) },
          { state: 'trial_grace', graceEndsAt: LessThanOrEqual(now) },
          { state: 'paid_active', paidPeriodEndsAt: LessThanOrEqual(now) },
          { state: 'payment_grace', graceEndsAt: LessThanOrEqual(now) },
        ],
        lock: { mode: 'pessimistic_write' },
      });
      const result = {
        trialGrace: 0,
        trialExpired: 0,
        paymentGrace: 0,
        paymentExpired: 0,
      };
      for (const entitlement of due) {
        const previousState = entitlement.state;
        let nextState: EntitlementLifecycleState | null = null;
        if (entitlement.state === 'trial_active') {
          nextState = 'trial_grace';
          entitlement.graceEndsAt = this.addUtcDays(now, graceDays);
          result.trialGrace += 1;
        } else if (entitlement.state === 'trial_grace') {
          nextState = 'expired';
          result.trialExpired += 1;
        } else if (entitlement.state === 'paid_active') {
          nextState = 'payment_grace';
          entitlement.graceEndsAt = this.addUtcDays(now, graceDays);
          result.paymentGrace += 1;
        } else if (entitlement.state === 'payment_grace') {
          nextState = 'expired';
          result.paymentExpired += 1;
        }
        if (!nextState) continue;
        entitlement.state = nextState;
        const saved = await repository.save(entitlement);
        await this.recordEvent(manager, saved, previousState, nextState, {
          actor: { type: 'system', id: 'expiry-scheduler' },
          source: 'expiry_scheduler',
          reason: `Automatic ${previousState} expiry transition`,
          idempotencyKey: `expiry:${saved.id}:${previousState}:${nextState}:${now.toISOString()}`,
          metadata: {},
        });
      }
      return result;
    });
  }

  async runExpirySchedulerOnce(
    now = new Date(),
  ): Promise<EntitlementExpirySchedulerHealth> {
    if (this.schedulerRunning) {
      return this.getExpirySchedulerHealth();
    }
    this.schedulerRunning = true;
    this.schedulerHealth.lastStartedAt = now.toISOString();
    try {
      const result = await this.processExpiry(now);
      this.schedulerHealth.lastResult = result;
      this.schedulerHealth.lastCompletedAt = new Date().toISOString();
      this.schedulerHealth.lastError = null;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown entitlement expiry scheduler failure';
      this.schedulerHealth.lastFailedAt = new Date().toISOString();
      this.schedulerHealth.lastError = message;
      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.schedulerRunning = false;
    }
    return this.getExpirySchedulerHealth();
  }

  async activatePaidPeriod(input: {
    tenantId: string;
    planId: string;
    paidPeriodStartsAt: Date;
    paidPeriodEndsAt: Date;
    actor: EntitlementActor;
    paymentEvidence: Record<string, unknown>;
    idempotencyKey: string;
    manager?: EntityManager;
  }): Promise<TenantEntitlement> {
    const activate = async (manager: EntityManager) => {
      const duplicateEvent = await manager
        .getRepository(TenantEntitlementEvent)
        .findOne({
          where: { idempotencyKey: input.idempotencyKey },
        });
      if (duplicateEvent) {
        const existing = await manager
          .getRepository(TenantEntitlement)
          .findOne({
            where: { tenantId: input.tenantId },
          });
        if (!existing) {
          throw new NotFoundException('Tenant entitlement is not configured');
        }
        return existing;
      }
      const plan = await manager.getRepository(SubscriptionPlan).findOne({
        where: { id: input.planId, status: 'active' },
      });
      if (!plan) {
        throw new BadRequestException(
          'The selected subscription plan is no longer available',
        );
      }
      const repository = manager.getRepository(TenantEntitlement);
      const entitlement = await repository.findOne({
        where: { tenantId: input.tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entitlement) {
        const created = repository.create({
          tenantId: input.tenantId,
          planId: input.planId,
          state: 'paid_active',
          trialStartsAt: null,
          trialEndsAt: null,
          graceEndsAt: null,
          paidPeriodStartsAt: input.paidPeriodStartsAt,
          paidPeriodEndsAt: input.paidPeriodEndsAt,
          suspendedAt: null,
          suspensionReason: null,
          cancelledAt: null,
          cancellationReason: null,
          reactivationRequestedAt: null,
          reactivationEvidence: input.paymentEvidence,
        });
        const saved = await repository.save(created);
        await this.recordEvent(manager, saved, null, 'paid_active', {
          actor: input.actor,
          source: 'payment_activation',
          reason: 'Payment evidence activated entitlement',
          idempotencyKey: input.idempotencyKey,
          metadata: input.paymentEvidence,
        });
        return saved;
      }
      if (entitlement.state !== 'paid_active') {
        this.assertTransitionAllowed(entitlement.state, 'paid_active');
      }
      const previousState = entitlement.state;
      entitlement.planId = input.planId;
      entitlement.state = 'paid_active';
      entitlement.paidPeriodStartsAt = input.paidPeriodStartsAt;
      entitlement.paidPeriodEndsAt = input.paidPeriodEndsAt;
      entitlement.graceEndsAt = null;
      entitlement.reactivationRequestedAt = null;
      entitlement.reactivationEvidence = input.paymentEvidence;
      const saved = await repository.save(entitlement);
      await this.recordEvent(manager, saved, previousState, 'paid_active', {
        actor: input.actor,
        source: 'payment_activation',
        reason: 'Payment evidence activated entitlement',
        idempotencyKey: input.idempotencyKey,
        metadata: input.paymentEvidence,
      });
      return saved;
    };

    if (input.manager) {
      return activate(input.manager);
    }
    return this.dataSource.transaction(activate);
  }

  async findOperationallyBlockedTenantIds(
    tenantIds: string[],
  ): Promise<string[]> {
    if (tenantIds.length === 0) return [];
    const entitlements = await this.entitlementRepository.find({
      where: {
        tenantId: In(tenantIds),
      },
      select: ['tenantId', 'state'],
    });
    const byTenantId = new Map(
      entitlements.map((entitlement) => [
        entitlement.tenantId,
        entitlement.state,
      ]),
    );
    return tenantIds.filter((tenantId) => {
      const state = byTenantId.get(tenantId);
      return !state || !operationallyAllowedEntitlementStates.includes(state);
    });
  }

  private assertTransitionAllowed(
    fromState: EntitlementLifecycleState,
    toState: EntitlementLifecycleState,
  ) {
    if (!allowedTransitions[fromState]?.includes(toState)) {
      throw new BadRequestException(
        `Invalid entitlement transition ${fromState} -> ${toState}`,
      );
    }
  }

  private addUtcDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private async recordEvent(
    manager: EntityManager,
    entitlement: TenantEntitlement,
    previousState: EntitlementLifecycleState | null,
    newState: EntitlementLifecycleState,
    input: {
      actor: EntitlementActor;
      source: EntitlementTransitionSource;
      reason: string;
      idempotencyKey?: string | null;
      metadata: Record<string, unknown>;
    },
  ) {
    const event = manager.getRepository(TenantEntitlementEvent).create({
      entitlementId: entitlement.id,
      tenantId: entitlement.tenantId,
      previousState,
      newState,
      actorType: input.actor.type,
      actorId: input.actor.id ?? null,
      source: input.source,
      reason: input.reason.slice(0, 240),
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: input.metadata,
    });
    await manager.getRepository(TenantEntitlementEvent).save(event);
  }
}
