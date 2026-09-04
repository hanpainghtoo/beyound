/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- Repository doubles keep this unit suite focused on reconciliation. */
import { SubscriptionEntitlementReconciliationService } from './subscription-entitlement-reconciliation.service';
import type { SubscriptionEntitlementService } from './subscription-entitlement.service';

const NOW = new Date('2026-09-15T00:00:00.000Z');

function createUsageRepository(rows: Record<string, any>[]) {
  return {
    createQueryBuilder: jest.fn(() => {
      const conditions: Record<string, any>[] = [];
      const pushCondition = (sql: string, params: any) => {
        // TypeORM passes `where('usage.tenant_id = :tenantId', { tenantId })`,
        // so the real value is the single entry of the params object.
        const column = sql.replace(/^usage\./, '').split(' ')[0];
        const value = params ? Object.values(params)[0] : undefined;
        conditions.push({ [column]: value });
      };
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn((sql: string, params: any) => {
          pushCondition(sql, params);
          return queryBuilder;
        }),
        andWhere: jest.fn((sql: string, params: any) => {
          pushCondition(sql, params);
          return queryBuilder;
        }),
        getRawOne: jest.fn(async () => {
          const where = Object.assign({}, ...conditions);
          const total = rows
            .filter((row) =>
              Object.entries(where).every(([key, value]) => row[key] === value),
            )
            .reduce((sum, row) => sum + (row.quantity || 0), 0);
          return { total: String(total) };
        }),
      };
      return queryBuilder;
    }),
  };
}

function createEntitlementService(
  activePeriodId: string | null,
): Pick<SubscriptionEntitlementService, 'resolveActivePeriodId'> {
  return {
    resolveActivePeriodId: jest.fn(async () => activePeriodId),
  };
}

describe('SubscriptionEntitlementReconciliationService (Phase 5, task 5.9)', () => {
  it('compares legacy calendar-month totals with period-scoped totals', async () => {
    const usageRows = [
      {
        tenant_id: 'tenant-1',
        quantity: 100,
        usage_type: 'api_request',
        direction: 'request',
        billing_period_start: '2026-09-01',
        billing_period_end: '2026-10-01',
        subscription_period_id: 'period-1',
      },
      {
        tenant_id: 'tenant-1',
        quantity: 40,
        usage_type: 'provider_message',
        direction: 'inbound',
        billing_period_start: '2026-09-01',
        billing_period_end: '2026-10-01',
        subscription_period_id: 'period-1',
      },
      {
        tenant_id: 'tenant-1',
        quantity: 10,
        usage_type: 'provider_message',
        direction: 'outbound',
        billing_period_start: '2026-09-01',
        billing_period_end: '2026-10-01',
        subscription_period_id: 'period-1',
      },
      // Legacy row with no period identity (historical) — counted in legacy only.
      {
        tenant_id: 'tenant-1',
        quantity: 3,
        usage_type: 'provider_message',
        direction: 'inbound',
        billing_period_start: '2026-09-01',
        billing_period_end: '2026-10-01',
        subscription_period_id: null,
      },
    ];
    const service = new SubscriptionEntitlementReconciliationService(
      createUsageRepository(usageRows) as any,
      createEntitlementService('period-1') as any,
    );

    const report = await service.generate('tenant-1', NOW);

    expect(report.activePeriodId).toBe('period-1');
    expect(report.legacy).toEqual({
      apiRequests: 100,
      inboundMessages: 43,
      outboundMessages: 10,
    });
    expect(report.periodScoped).toEqual({
      apiRequests: 100,
      inboundMessages: 40,
      outboundMessages: 10,
    });
    expect(report.mismatches).toEqual([
      {
        dimension: 'inboundMessages',
        legacy: 43,
        periodScoped: 40,
      },
    ]);
  });

  it('reports a single mismatch entry when there is no active period', async () => {
    const service = new SubscriptionEntitlementReconciliationService(
      createUsageRepository([]) as any,
      createEntitlementService(null) as any,
    );

    const report = await service.generate('tenant-1', NOW);

    expect(report.activePeriodId).toBeNull();
    expect(report.periodScoped).toBeNull();
    expect(report.mismatches).toHaveLength(1);
    expect(report.mismatches[0].dimension).toBe('*');
    expect(report.mismatches[0].reason).toMatch(/no active paid period/i);
  });

  it('reports no mismatches when legacy and period-scoped totals agree', async () => {
    const usageRows = [
      {
        tenant_id: 'tenant-1',
        quantity: 7,
        usage_type: 'provider_message',
        direction: 'inbound',
        billing_period_start: '2026-09-01',
        billing_period_end: '2026-10-01',
        subscription_period_id: 'period-1',
      },
    ];
    const service = new SubscriptionEntitlementReconciliationService(
      createUsageRepository(usageRows) as any,
      createEntitlementService('period-1') as any,
    );

    const report = await service.generate('tenant-1', NOW);

    expect(report.mismatches).toEqual([]);
    expect(report.legacy.inboundMessages).toBe(7);
    expect(report.periodScoped!.inboundMessages).toBe(7);
  });
});
