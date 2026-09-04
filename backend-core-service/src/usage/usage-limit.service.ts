import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { EntityManager, Repository } from 'typeorm';
import { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';
import { TenantUsageEvent } from './entities/tenant-usage-event.entity';
import { SubscriptionEntitlementService } from '../subscription-period/subscription-entitlement.service';
import type { ResolvedSubscriptionEntitlement } from '../subscription-period/subscription-entitlement.types';
import {
  yangonCalendarDate,
  yangonMonthEnd,
  yangonMonthStart,
} from '../subscription-period/yangon-month.util';

type UsageType = 'api_request' | 'provider_message';

type ApiUsageInput = {
  requestMethod?: string;
  requestPath?: string;
  sourceRequestId?: string;
  source?: string;
  metadata?: Record<string, any>;
};

type ProviderMessageUsageInput = {
  channelId?: string;
  provider?: string;
  direction: 'inbound' | 'outbound' | 'callback';
  quantity?: number;
  source?: string;
  sourceEventId?: string | null;
  sourceMessageId?: string | null;
  metadata?: Record<string, any>;
  now?: Date;
};

export const billableUsagePolicy = {
  api_request: 'Bill one unit for each accepted tenant API request.',
  provider_message_inbound:
    'Bill one unit only after a unique inbound provider event creates a durable message.',
  provider_message_outbound:
    'Bill one unit when a CSR outbound send is accepted and persisted; later provider failed or delivery_unknown states do not create additional usage.',
  provider_message_callback:
    'Provider delivery/read callbacks are non-billable status updates.',
} as const;

export const usageLimitPolicy = {
  entitlementSource: 'tenant_entitlements',
  overageBehavior: 'hard_limit',
  graceBehavior:
    'Entitlement grace states keep access open but do not grant usage overage beyond the active plan/custom limits.',
} as const;

@Injectable()
export class UsageLimitService {
  constructor(
    @InjectRepository(TenantUsageEvent)
    private usageRepository: Repository<TenantUsageEvent>,
    private readonly entitlementService: SubscriptionEntitlementService,
  ) {}

  async trackApiRequest(tenantId: string, input: ApiUsageInput = {}) {
    return this.recordUsageWithLimit(
      {
        tenantId,
        usageType: 'api_request',
        direction: 'request',
        quantity: 1,
        source: input.source || 'http_api',
        sourceRequestId: input.sourceRequestId || `api-request:${randomUUID()}`,
        requestMethod: input.requestMethod || null,
        requestPath: input.requestPath || null,
        metadata: input.metadata || {},
      },
      'api_request',
      1,
    );
  }

  async trackProviderMessage(
    tenantId: string,
    input: ProviderMessageUsageInput,
  ) {
    if (input.direction === 'callback') {
      return { accepted: true, billable: false };
    }
    const quantity = this.normalizedQuantity(input.quantity);
    return this.recordUsageWithLimit(
      {
        tenantId,
        channelId: input.channelId || null,
        provider: input.provider || null,
        usageType: 'provider_message',
        direction: input.direction,
        quantity,
        source: input.source || 'provider_message',
        sourceEventId: input.sourceEventId || null,
        sourceMessageId: input.sourceMessageId || null,
        metadata: input.metadata || {},
      },
      'provider_message',
      quantity,
      input.direction,
    );
  }

  async assertProviderMessageUsageAvailable(
    tenantId: string,
    quantity = 1,
    options: {
      manager?: EntityManager;
      direction?: 'inbound' | 'outbound' | 'callback';
      now?: Date;
    } = {},
  ) {
    if (options.direction === 'callback') {
      return undefined;
    }
    return this.assertUsageAvailable(
      tenantId,
      'provider_message',
      this.normalizedQuantity(quantity),
      options,
    );
  }

  /** Persist a usage row in an already-open transaction after its quota check. */
  async recordProviderMessageInTransaction(
    manager: EntityManager,
    tenantId: string,
    input: ProviderMessageUsageInput,
    reservation?: {
      activePeriodId?: string | null;
      upgradeRevisionId?: string | null;
    },
  ) {
    if (input.direction === 'callback') {
      return { accepted: true, billable: false };
    }
    const { periodStart, periodEnd } = this.currentYangonPeriod(input.now);
    const periodId = reservation?.activePeriodId ?? null;
    const usage = manager.create(TenantUsageEvent, {
      tenantId,
      channelId: input.channelId || null,
      provider: input.provider || null,
      usageType: 'provider_message',
      direction: input.direction,
      quantity: this.normalizedQuantity(input.quantity),
      source: input.source || 'provider_message',
      sourceEventId: input.sourceEventId || null,
      sourceMessageId: input.sourceMessageId || null,
      requestMethod: null,
      requestPath: null,
      billingPeriodStart: yangonCalendarDate(periodStart),
      billingPeriodEnd: yangonCalendarDate(periodEnd),
      subscriptionPeriodId: periodId,
      upgradeRevisionId: reservation?.upgradeRevisionId ?? null,
      metadata: input.metadata || {},
    });
    return manager.save(TenantUsageEvent, usage);
  }

  async markProviderMessageNonBillable(
    tenantId: string,
    sourceMessageId: string,
    manager?: EntityManager,
  ) {
    const repository = manager
      ? manager.getRepository(TenantUsageEvent)
      : this.usageRepository;
    const usage = await repository.findOne({
      where: { tenantId, sourceMessageId, usageType: 'provider_message' },
    });
    if (!usage) return { updated: false };
    usage.quantity = 0;
    usage.metadata = {
      ...(usage.metadata || {}),
      billable: false,
      nonBillableReason: 'channel_disabled_before_provider_dispatch',
      nonBillableAt: new Date().toISOString(),
    };
    await repository.save(usage);
    return { updated: true, usageEventId: usage.id };
  }

  async getUsageSummary(tenantId: string, now = new Date()) {
    return this.getPeriodScopedUsageSummary(tenantId, now);
  }

  private async recordUsageWithLimit(
    input: Partial<TenantUsageEvent> & { tenantId: string },
    usageType: UsageType,
    quantity: number,
    direction?: 'inbound' | 'outbound' | 'request',
  ) {
    return this.usageRepository.manager.transaction(async (manager) => {
      const reservation = await this.assertPeriodUsageAvailable(
        input.tenantId,
        usageType,
        quantity,
        direction,
        manager,
      );
      const usage = manager.create(TenantUsageEvent, {
        ...input,
        billingPeriodStart: yangonCalendarDate(reservation.periodStart),
        billingPeriodEnd: yangonCalendarDate(reservation.periodEnd),
        subscriptionPeriodId: reservation.activePeriodId,
        upgradeRevisionId: reservation.upgradeRevisionId ?? null,
      });
      return manager.save(TenantUsageEvent, usage);
    });
  }

  private async assertUsageAvailable(
    tenantId: string,
    usageType: UsageType,
    quantity: number,
    options: {
      manager?: EntityManager;
      direction?: 'inbound' | 'outbound' | 'callback';
      now?: Date;
    } = {},
  ) {
    if (options.manager) {
      return this.assertPeriodUsageAvailable(
        tenantId,
        usageType,
        quantity,
        options.direction === 'callback' ? undefined : options.direction,
        options.manager,
        options.now,
      );
    }
    return this.usageRepository.manager.transaction((manager) =>
      this.assertPeriodUsageAvailable(
        tenantId,
        usageType,
        quantity,
        options.direction === 'callback' ? undefined : options.direction,
        manager,
        options.now,
      ),
    );
  }

  private async assertPeriodUsageAvailable(
    tenantId: string,
    usageType: UsageType,
    quantity: number,
    direction: 'inbound' | 'outbound' | 'request' | undefined,
    manager: EntityManager,
    now = new Date(),
  ) {
    const periods = await manager
      .getRepository(TenantSubscriptionPeriod)
      .createQueryBuilder('period')
      .setLock('pessimistic_write')
      .where('period.tenant_id = :tenantId', { tenantId })
      .getMany();
    let entitlement: ResolvedSubscriptionEntitlement;
    try {
      entitlement =
        await this.entitlementService.resolveActiveSubscriptionEntitlement(
          tenantId,
          { manager, now },
        );
    } catch (error: unknown) {
      const missingPeriod =
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'MissingActivePeriodError'
          ? (error as { code?: string })
          : null;
      if (missingPeriod?.code === 'PERIOD_PAYMENT_NOT_CONFIRMED') {
        throw new HttpException(
          {
            code: 'SUBSCRIPTION_PAYMENT_REQUIRED',
            message: 'Confirmed payment is required for the active period.',
            activePeriodId: null,
          },
          HttpStatus.CONFLICT,
        );
      }
      if (missingPeriod?.code === 'PERIOD_AWAITING_ADMIN_ACTIVATION') {
        throw new HttpException(
          {
            code: 'SUBSCRIPTION_PERIOD_AWAITING_ACTIVATION',
            message:
              'Payment is confirmed but the subscription period awaits Platform Admin activation.',
            activePeriodId: null,
          },
          HttpStatus.CONFLICT,
        );
      }
      if (missingPeriod?.code === 'TRIAL_EXPIRED') {
        throw new HttpException(
          {
            code: 'TRIAL_EXPIRED',
            message:
              'The trial period has ended; request a business plan to continue using the workspace.',
            activePeriodId: null,
          },
          HttpStatus.CONFLICT,
        );
      }
      if (missingPeriod) throw this.periodNotActiveError();
      throw error;
    }
    const activePeriod = periods.find(
      (period) => period.id === entitlement.activePeriodId,
    );
    const periodStart =
      activePeriod?.monthStartAt ?? activePeriod?.periodStartAt;
    const periodEnd = activePeriod?.monthEndAt ?? activePeriod?.periodEndAt;
    if (!activePeriod || !periodStart || !periodEnd) {
      throw this.periodNotActiveError();
    }

    const dimension =
      usageType === 'api_request'
        ? 'api_requests'
        : direction === 'inbound'
          ? 'inbound_messages'
          : 'outbound_messages';
    const limit = entitlement.effectiveLimits[dimension];
    const used = await this.sumUsageByPeriod(
      tenantId,
      usageType,
      entitlement.activePeriodId,
      manager,
      direction,
    );
    if (limit !== null && used + quantity > limit) {
      throw this.limitExceededError(
        usageType,
        limit,
        used,
        quantity,
        periodStart,
        periodEnd,
        direction,
        entitlement.activePeriodId,
      );
    }
    return {
      activePeriodId: entitlement.activePeriodId,
      upgradeRevisionId: entitlement.upgradeRevisionId ?? null,
      periodStart,
      periodEnd,
      used,
      limit,
    };
  }

  /**
   * Period-scoped usage sum (task 5.6): totals for one `subscription_period_id`.
   * Used by the shadow/reconciliation report and feature-flagged reads.
   */
  async sumUsageByPeriod(
    tenantId: string,
    usageType: UsageType,
    periodId: string,
    manager?: EntityManager,
    direction?: 'inbound' | 'outbound' | 'request',
  ) {
    const queryBuilder = manager
      ? manager.createQueryBuilder(TenantUsageEvent, 'usage')
      : this.usageRepository.createQueryBuilder('usage');
    queryBuilder
      .select('COALESCE(SUM(usage.quantity), 0)', 'total')
      .where('usage.tenant_id = :tenantId', { tenantId })
      .andWhere('usage.usage_type = :usageType', { usageType })
      .andWhere("COALESCE(usage.metadata ->> 'billable', 'true') <> 'false'")
      .andWhere('usage.subscription_period_id = :periodId', { periodId });
    if (direction) {
      queryBuilder.andWhere('usage.direction = :direction', { direction });
    }
    const result = await queryBuilder.getRawOne<{ total: string }>();
    return Number(result?.total || 0);
  }

  private async getPeriodScopedUsageSummary(tenantId: string, now: Date) {
    const entitlement =
      await this.entitlementService.resolveActiveSubscriptionEntitlement(
        tenantId,
        { now },
      );
    const [apiUsed, inboundUsed, outboundUsed] = await Promise.all([
      this.sumUsageByPeriod(
        tenantId,
        'api_request',
        entitlement.activePeriodId,
      ),
      this.sumUsageByPeriod(
        tenantId,
        'provider_message',
        entitlement.activePeriodId,
        undefined,
        'inbound',
      ),
      this.sumUsageByPeriod(
        tenantId,
        'provider_message',
        entitlement.activePeriodId,
        undefined,
        'outbound',
      ),
    ]);
    return {
      tenantId,
      policy: usageLimitPolicy,
      scope: 'period_scoped',
      activePeriodId: entitlement.activePeriodId,
      planId: entitlement.planId,
      periodStart: entitlement.periodStartAt?.toISOString() ?? null,
      periodEnd: entitlement.periodEndAt?.toISOString() ?? null,
      baseLimits: entitlement.baseLimits,
      activeTopUpComponentTotals: entitlement.activeTopUpComponentTotals,
      effectiveLimits: entitlement.effectiveLimits,
      apiRequests: this.limitState(
        apiUsed,
        entitlement.effectiveLimits.api_requests,
      ),
      inboundMessages: this.limitState(
        inboundUsed,
        entitlement.effectiveLimits.inbound_messages,
      ),
      outboundMessages: this.limitState(
        outboundUsed,
        entitlement.effectiveLimits.outbound_messages,
      ),
    };
  }

  private limitExceededError(
    usageType: UsageType,
    limit: number,
    used: number,
    quantity: number,
    periodStart: Date,
    periodEnd: Date,
    direction?: 'inbound' | 'outbound' | 'request',
    activePeriodId?: string,
  ) {
    const code =
      usageType === 'api_request'
        ? 'API_USAGE_LIMIT_REACHED'
        : direction === 'inbound'
          ? 'INBOUND_MESSAGE_QUOTA_EXHAUSTED'
          : direction === 'outbound'
            ? 'OUTBOUND_MESSAGE_QUOTA_EXHAUSTED'
            : 'MESSAGE_USAGE_LIMIT_REACHED';
    return new HttpException(
      {
        code,
        message:
          code === 'API_USAGE_LIMIT_REACHED'
            ? 'Tenant API usage limit reached'
            : code === 'INBOUND_MESSAGE_QUOTA_EXHAUSTED'
              ? 'Tenant inbound message quota exhausted'
              : code === 'OUTBOUND_MESSAGE_QUOTA_EXHAUSTED'
                ? 'Tenant outbound message quota exhausted'
                : 'Tenant message usage limit reached',
        usageType,
        dimension:
          usageType === 'api_request'
            ? 'api_requests'
            : direction === 'inbound'
              ? 'inbound_messages'
              : direction === 'outbound'
                ? 'outbound_messages'
                : 'messages',
        limit,
        used,
        remaining: Math.max(limit - used, 0),
        requested: quantity,
        activePeriodId: activePeriodId ?? null,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        expiresAt: periodEnd.toISOString(),
        policy: usageLimitPolicy,
        remediation: 'Purchase an eligible top-up for the active period.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private periodNotActiveError() {
    return new HttpException(
      {
        code: 'SUBSCRIPTION_PERIOD_NOT_ACTIVE',
        message: 'Tenant has no active paid subscription period.',
        remediation: 'Activate or pay for the current monthly subscription.',
      },
      HttpStatus.CONFLICT,
    );
  }

  private normalizedQuantity(quantity = 1) {
    const parsed = Number(quantity);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  }

  private currentYangonPeriod(now = new Date()) {
    return {
      periodStart: yangonMonthStart(now),
      periodEnd: yangonMonthEnd(now),
    };
  }

  private limitState(used: number, limit: number | null) {
    return {
      used,
      limit,
      remaining: limit === null ? null : Math.max(limit - used, 0),
      limitReached: limit !== null && used >= limit,
    };
  }
}
