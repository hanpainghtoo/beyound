import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

export type ReconciliationDimensionTotals = {
  apiRequests: number;
  inboundMessages: number;
  outboundMessages: number;
};

export type SubscriptionReconciliationReport = {
  tenantId: string;
  generatedAt: string;
  activePeriodId: string | null;
  /** Legacy calendar-month billing window used for the comparison. */
  legacyWindow: { periodStart: string; periodEnd: string };
  legacy: ReconciliationDimensionTotals;
  /** Period-scoped totals by `subscription_period_id`; null when no active period. */
  periodScoped: ReconciliationDimensionTotals | null;
  /** Dimensions whose legacy and period-scoped totals differ (shadow evidence). */
  mismatches: {
    dimension: keyof ReconciliationDimensionTotals | '*';
    legacy: number;
    periodScoped: number | null;
    reason?: string;
  }[];
};

/**
 * Shadow/reconciliation report (Plan 9 Phase 5, task 5.9).
 *
 * Compares the legacy calendar-month ledger (billing_period_start/end date
 * window, UTC month) against the new period-scoped ledger
 * (subscription_period_id) without changing production acceptance. New usage
 * rows are dual-written to both, so the report surfaces drift before the
 * enforcement cutover. Historical null-period rows remain readable and are
 * never rewritten.
 */
@Injectable()
export class SubscriptionEntitlementReconciliationService {
  constructor(
    @InjectRepository(TenantUsageEvent)
    private readonly usageRepository: Repository<TenantUsageEvent>,
    private readonly entitlementService: SubscriptionEntitlementService,
  ) {}

  async generate(
    tenantId: string,
    now = new Date(),
  ): Promise<SubscriptionReconciliationReport> {
    const activePeriodId = await this.entitlementService.resolveActivePeriodId(
      tenantId,
      { now },
    );

    const { periodStart, periodEnd } = this.currentMonthlyPeriod(now);
    const [legacy, periodScoped] = await Promise.all([
      this.legacyCalendarMonthTotals(tenantId, periodStart, periodEnd),
      activePeriodId
        ? this.periodScopedTotals(tenantId, activePeriodId)
        : Promise.resolve(null),
    ]);

    return {
      tenantId,
      generatedAt: now.toISOString(),
      activePeriodId,
      legacyWindow: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
      legacy,
      periodScoped,
      mismatches: this.compare(legacy, periodScoped),
    };
  }

  private async legacyCalendarMonthTotals(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ReconciliationDimensionTotals> {
    const [apiRequests, inboundMessages, outboundMessages] = await Promise.all([
      this.sumByBillingWindow(tenantId, 'api_request', periodStart, periodEnd),
      this.sumByBillingWindow(
        tenantId,
        'provider_message',
        periodStart,
        periodEnd,
        'inbound',
      ),
      this.sumByBillingWindow(
        tenantId,
        'provider_message',
        periodStart,
        periodEnd,
        'outbound',
      ),
    ]);
    return { apiRequests, inboundMessages, outboundMessages };
  }

  private async periodScopedTotals(
    tenantId: string,
    periodId: string,
  ): Promise<ReconciliationDimensionTotals> {
    const [apiRequests, inboundMessages, outboundMessages] = await Promise.all([
      this.sumByPeriod(tenantId, 'api_request', periodId),
      this.sumByPeriod(tenantId, 'provider_message', periodId, 'inbound'),
      this.sumByPeriod(tenantId, 'provider_message', periodId, 'outbound'),
    ]);
    return { apiRequests, inboundMessages, outboundMessages };
  }

  private compare(
    legacy: ReconciliationDimensionTotals,
    periodScoped: ReconciliationDimensionTotals | null,
  ): SubscriptionReconciliationReport['mismatches'] {
    if (!periodScoped) {
      return [
        {
          dimension: '*',
          legacy:
            legacy.apiRequests +
            legacy.inboundMessages +
            legacy.outboundMessages,
          periodScoped: null,
          reason: 'No active paid period; no period-scoped ledger exists yet.',
        },
      ];
    }
    const dimensions = [
      'apiRequests',
      'inboundMessages',
      'outboundMessages',
    ] as const;
    return dimensions.flatMap((dimension) => {
      const legacyTotal = legacy[dimension];
      const scopedTotal = periodScoped[dimension];
      return legacyTotal === scopedTotal
        ? []
        : [{ dimension, legacy: legacyTotal, periodScoped: scopedTotal }];
    });
  }

  private async sumByBillingWindow(
    tenantId: string,
    usageType: 'api_request' | 'provider_message',
    periodStart: Date,
    periodEnd: Date,
    direction?: 'inbound' | 'outbound',
  ): Promise<number> {
    const queryBuilder = this.usageRepository
      .createQueryBuilder('usage')
      .select('COALESCE(SUM(usage.quantity), 0)', 'total')
      .where('usage.tenant_id = :tenantId', { tenantId })
      .andWhere('usage.usage_type = :usageType', { usageType })
      .andWhere('usage.billing_period_start = :periodStart', {
        periodStart: this.dateOnly(periodStart),
      })
      .andWhere('usage.billing_period_end = :periodEnd', {
        periodEnd: this.dateOnly(periodEnd),
      });
    if (direction) {
      queryBuilder.andWhere('usage.direction = :direction', { direction });
    }
    const result = await queryBuilder.getRawOne<{ total: string }>();
    return Number(result?.total || 0);
  }

  private async sumByPeriod(
    tenantId: string,
    usageType: 'api_request' | 'provider_message',
    periodId: string,
    direction?: 'inbound' | 'outbound',
  ): Promise<number> {
    const queryBuilder = this.usageRepository
      .createQueryBuilder('usage')
      .select('COALESCE(SUM(usage.quantity), 0)', 'total')
      .where('usage.tenant_id = :tenantId', { tenantId })
      .andWhere('usage.usage_type = :usageType', { usageType })
      .andWhere('usage.subscription_period_id = :periodId', { periodId });
    if (direction) {
      queryBuilder.andWhere('usage.direction = :direction', { direction });
    }
    const result = await queryBuilder.getRawOne<{ total: string }>();
    return Number(result?.total || 0);
  }

  /** Legacy calendar-month billing window (UTC month) for the comparison. */
  private currentMonthlyPeriod(now: Date) {
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    );
    return { periodStart, periodEnd };
  }

  private dateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
