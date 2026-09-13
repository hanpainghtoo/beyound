/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- Lightweight repository doubles keep scheduler transitions focused on state-machine behavior. */
import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { TenantEntitlementEvent } from '../entitlement/entities/tenant-entitlement-event.entity';
import { TenantSubscriptionAddOnComponent } from '../subscription-add-on/entities/tenant-subscription-add-on-component.entity';
import { TenantSubscriptionAddOnPurchase } from '../subscription-add-on/entities/tenant-subscription-add-on-purchase.entity';
import { TenantSubscriptionAddOnPurchaseEvent } from '../subscription-add-on/entities/tenant-subscription-add-on-purchase-event.entity';
import { SubscriptionPeriodEvent } from './entities/subscription-period-event.entity';
import { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import { SubscriptionPeriodSchedulerService } from './subscription-period-scheduler.service';
import { yangonWallClockToUtc } from './yangon-month.util';

type Row = Record<string, any>;

function createHarness(
  initialPeriods: Row[] = [],
  initialPurchases: Row[] = [],
) {
  const periods = [...initialPeriods];
  const purchases = [...initialPurchases];
  const components: Row[] = [];
  const periodEvents: Row[] = [];
  const purchaseEvents: Row[] = [];
  const entitlements: Row[] = [
    {
      id: 'entitlement-1',
      tenantId: 'tenant-1',
      state: 'paid_active',
      planId: 'plan-1',
      paidPeriodStartsAt: augustStart,
      paidPeriodEndsAt: septemberStart,
    },
  ];

  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const repository = (entity: any) => ({
    find: jest.fn(async (options: any = {}) => {
      const rows =
        entity === TenantSubscriptionPeriod
          ? periods
          : entity === TenantSubscriptionAddOnPurchase
            ? purchases
            : entity === TenantSubscriptionAddOnComponent
              ? components
              : entity === TenantEntitlement
                ? entitlements
                : [];
      return rows.filter((row) => matches(row, options.where));
    }),
    findOne: jest.fn(async (options: any = {}) => {
      const rows =
        entity === SubscriptionPeriodEvent
          ? periodEvents
          : entity === TenantSubscriptionAddOnPurchaseEvent
            ? purchaseEvents
            : entity === TenantSubscriptionAddOnPurchase
              ? purchases
              : entity === TenantSubscriptionAddOnComponent
                ? components
                : entity === TenantEntitlement
                  ? entitlements
                  : entity === TenantEntitlementEvent
                    ? []
                    : [];
      return rows.find((row) => matches(row, options.where)) ?? null;
    }),
    create: jest.fn((value: Row) => ({ ...value })),
    save: jest.fn(async (value: Row | Row[]) => {
      const values = Array.isArray(value) ? value : [value];
      for (const row of values) {
        if (entity === TenantSubscriptionPeriod) {
          const existing = periods.find((item) => item.id === row.id);
          if (existing) Object.assign(existing, row);
          else periods.push(row);
        } else if (entity === TenantSubscriptionAddOnPurchase) {
          const existing = purchases.find((item) => item.id === row.id);
          if (existing) Object.assign(existing, row);
          else purchases.push(row);
        } else if (entity === TenantSubscriptionAddOnComponent) {
          const existing = components.find((item) => item.id === row.id);
          if (existing) Object.assign(existing, row);
          else components.push(row);
        } else if (entity === SubscriptionPeriodEvent) {
          periodEvents.push(row);
        } else if (entity === TenantSubscriptionAddOnPurchaseEvent) {
          purchaseEvents.push(row);
        } else if (entity === TenantEntitlement) {
          const existing = entitlements.find((item) => item.id === row.id);
          if (existing) Object.assign(existing, row);
          else entitlements.push(row);
        }
      }
      return value;
    }),
    createQueryBuilder: jest.fn(() => queryBuilder),
  });

  let lastWhereId: string | null = null;
  const queryBuilder = {
    where: jest.fn((_clause: string, params?: { id?: string }) => {
      if (params?.id) lastWhereId = params.id;
      return queryBuilder;
    }),
    orderBy: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => periods),
    getOne: jest.fn(async () =>
      lastWhereId
        ? (periods.find((period) => period.id === lastWhereId) ?? null)
        : (periods[0] ?? null),
    ),
  };
  const repositories = new Map<any, Row>();
  const getRepository = (entity: any) => {
    if (!repositories.has(entity)) repositories.set(entity, repository(entity));
    return repositories.get(entity);
  };
  const manager = { getRepository };
  const dataSource = {
    transaction: jest.fn(async (callback: (value: any) => unknown) =>
      callback(manager),
    ),
  };
  const periodRepository = getRepository(TenantSubscriptionPeriod);
  const service = new SubscriptionPeriodSchedulerService(
    periodRepository as any,
    dataSource as any,
  );

  return {
    service,
    periods,
    purchases,
    components,
    periodEvents,
    purchaseEvents,
    queryBuilder,
    entitlement: entitlements[0],
  };
}

const augustStart = yangonWallClockToUtc(2026, 8, 1);
const septemberStart = yangonWallClockToUtc(2026, 9, 1);
const octoberStart = yangonWallClockToUtc(2026, 10, 1);

function period(overrides: Row = {}) {
  return {
    id: 'period-august',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    periodType: 'paid',
    periodStatus: 'active',
    paymentStatus: 'paid',
    adminActivationStatus: 'approved',
    periodStartAt: augustStart,
    periodEndAt: septemberStart,
    monthStartAt: augustStart,
    monthEndAt: septemberStart,
    sequenceNumber: 1,
    metadata: {},
    ...overrides,
  };
}

describe('SubscriptionPeriodSchedulerService (Plan 9 Phase 8)', () => {
  it('expires the active Yangon month, expires attached top-ups, and activates the earliest paid prepaid month', async () => {
    const h = createHarness(
      [
        period(),
        period({
          id: 'period-september',
          periodStatus: 'upcoming',
          periodStartAt: septemberStart,
          periodEndAt: octoberStart,
          monthStartAt: septemberStart,
          monthEndAt: octoberStart,
          sequenceNumber: 2,
        }),
        period({
          id: 'period-october',
          periodStatus: 'upcoming',
          periodStartAt: octoberStart,
          periodEndAt: yangonWallClockToUtc(2026, 11, 1),
          monthStartAt: octoberStart,
          monthEndAt: yangonWallClockToUtc(2026, 11, 1),
          sequenceNumber: 3,
        }),
      ],
      [
        {
          id: 'purchase-1',
          tenantId: 'tenant-1',
          subscriptionPeriodId: 'period-august',
          purchaseStatus: 'active',
          paymentStatus: 'paid',
        },
        {
          id: 'purchase-2',
          tenantId: 'tenant-1',
          subscriptionPeriodId: 'period-august',
          purchaseStatus: 'pending',
          paymentStatus: 'pending',
        },
      ],
    );
    h.components.push(
      {
        id: 'component-1',
        purchaseId: 'purchase-1',
        componentStatus: 'active',
      },
      {
        id: 'component-2',
        purchaseId: 'purchase-2',
        componentStatus: 'pending',
      },
    );

    const result = await h.service.processDuePeriods(septemberStart);

    expect(result).toMatchObject({
      tenantsScanned: 1,
      periodsExpired: 1,
      periodsActivated: 1,
      purchasesExpired: 2,
    });
    expect(h.periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'period-august',
          periodStatus: 'expired',
          expiredAt: septemberStart,
          endReason: 'scheduled_expiry',
        }),
        expect.objectContaining({
          id: 'period-september',
          periodStatus: 'active',
          activatedAt: septemberStart,
          activationReason: 'scheduled',
        }),
        expect.objectContaining({
          id: 'period-october',
          periodStatus: 'upcoming',
        }),
      ]),
    );
    expect(h.purchases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'purchase-1',
          purchaseStatus: 'expired',
        }),
        expect.objectContaining({
          id: 'purchase-2',
          purchaseStatus: 'expired',
        }),
      ]),
    );
    expect(h.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'component-1',
          componentStatus: 'expired',
        }),
        expect.objectContaining({
          id: 'component-2',
          componentStatus: 'expired',
        }),
      ]),
    );
    expect(h.periodEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['period_expired', 'period_activated']),
    );
    expect(h.entitlement).toMatchObject({
      state: 'paid_active',
      planId: 'plan-1',
      paidPeriodStartsAt: septemberStart,
      paidPeriodEndsAt: octoberStart,
    });
  });

  it('does nothing just before the Yangon boundary and processes the exact boundary', async () => {
    const h = createHarness([period()]);

    await expect(
      h.service.processDuePeriods(new Date(septemberStart.getTime() - 1)),
    ).resolves.toMatchObject({ tenantsScanned: 0, periodsExpired: 0 });
    expect(h.periods[0].periodStatus).toBe('active');

    await expect(
      h.service.processDuePeriods(septemberStart),
    ).resolves.toMatchObject({
      periodsExpired: 1,
    });
    expect(h.periods[0].periodStatus).toBe('expired');
  });

  it('leaves a pending upcoming period queued and records a reconciliation exception', async () => {
    const h = createHarness([
      period(),
      period({
        id: 'period-september',
        periodStatus: 'upcoming',
        paymentStatus: 'pending',
        periodStartAt: septemberStart,
        periodEndAt: octoberStart,
        monthStartAt: septemberStart,
        monthEndAt: octoberStart,
        sequenceNumber: 2,
      }),
    ]);

    const result = await h.service.processDuePeriods(septemberStart);

    expect(result).toMatchObject({
      periodsExpired: 1,
      periodsActivated: 0,
      reconciliationExceptions: 1,
    });
    expect(h.periods[1].periodStatus).toBe('upcoming');
  });

  it('expires trial rows via the trial pass but never treats them as paid monthly periods (task 3.11)', async () => {
    const h = createHarness([
      period({
        id: 'trial-period',
        periodType: 'trial',
        paymentStatus: 'not_required',
        adminActivationStatus: 'approved',
        periodEndAt: septemberStart,
        monthEndAt: septemberStart,
      }),
      period(),
      period({
        id: 'period-october',
        periodStatus: 'upcoming',
        periodStartAt: octoberStart,
        periodEndAt: yangonWallClockToUtc(2026, 11, 1),
        monthStartAt: octoberStart,
        monthEndAt: yangonWallClockToUtc(2026, 11, 1),
        sequenceNumber: 2,
      }),
    ]);

    const result = await h.service.processDuePeriods(septemberStart);

    // The trial is expired by the trial pass, not by the paid calendar path.
    expect(result.trialPeriodsExpired).toBe(1);
    expect(result.periodsActivated).toBe(0);
    expect(h.periods[0].periodStatus).toBe('expired');
    expect(h.periods[0].periodType).toBe('trial');
    expect(h.periods[2].periodStatus).toBe('upcoming');
    expect(h.periodEvents).toContainEqual(
      expect.objectContaining({ eventType: 'trial_period_expired' }),
    );
    expect(h.periodEvents).not.toContainEqual(
      expect.objectContaining({ eventType: 'period_activated' }),
    );
  });

  it('does not let a pending current month block a later paid month from its own boundary', async () => {
    const novemberStart = yangonWallClockToUtc(2026, 11, 1);
    const decemberStart = yangonWallClockToUtc(2026, 12, 1);
    const h = createHarness([
      period({
        id: 'period-october',
        periodStartAt: octoberStart,
        periodEndAt: novemberStart,
        monthStartAt: octoberStart,
        monthEndAt: novemberStart,
      }),
      period({
        id: 'period-november',
        periodStatus: 'upcoming',
        paymentStatus: 'pending',
        periodStartAt: novemberStart,
        periodEndAt: decemberStart,
        monthStartAt: novemberStart,
        monthEndAt: decemberStart,
        sequenceNumber: 2,
      }),
      period({
        id: 'period-december',
        periodStatus: 'upcoming',
        periodStartAt: decemberStart,
        periodEndAt: yangonWallClockToUtc(2027, 1, 1),
        monthStartAt: decemberStart,
        monthEndAt: yangonWallClockToUtc(2027, 1, 1),
        sequenceNumber: 3,
      }),
    ]);

    const result = await h.service.processDuePeriods(novemberStart);

    expect(result).toMatchObject({
      periodsExpired: 1,
      periodsActivated: 0,
      reconciliationExceptions: 1,
    });
    expect(h.periods[1].periodStatus).toBe('upcoming');
    expect(h.periods[2].periodStatus).toBe('upcoming');
  });

  it('prevents overlapping scheduler runs and exposes health', async () => {
    const h = createHarness([]);
    const process = jest
      .spyOn(h.service, 'processDuePeriods')
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  tenantsScanned: 0,
                  tenantsSkipped: 0,
                  periodsExpired: 0,
                  periodsActivated: 0,
                  purchasesExpired: 0,
                  trialPeriodsExpired: 0,
                  reconciliationExceptions: 0,
                }),
              10,
            ),
          ),
      );

    const first = h.service.runOnce(septemberStart);
    const second = h.service.runOnce(septemberStart);
    await Promise.all([first, second]);

    expect(process).toHaveBeenCalledTimes(1);
    expect(h.service.getHealth()).toMatchObject({
      running: false,
      lastResult: { periodsActivated: 0 },
      lastError: null,
    });
  });

  it('does not expose or use the legacy early-renewal activation reason', async () => {
    const h = createHarness([
      period(),
      period({
        id: 'period-september',
        periodStatus: 'upcoming',
        periodStartAt: septemberStart,
        periodEndAt: octoberStart,
        monthStartAt: septemberStart,
        monthEndAt: octoberStart,
        sequenceNumber: 2,
      }),
    ]);

    await h.service.processDuePeriods(septemberStart);

    expect(h.periods[1].activationReason).toBe('scheduled');
    expect(h.periodEvents).not.toContainEqual(
      expect.objectContaining({ eventType: 'early_renewal_promoted' }),
    );
  });

  it('does not activate an upcoming paid period that awaits Platform Admin approval', async () => {
    const h = createHarness([
      period(),
      period({
        id: 'period-september',
        periodStatus: 'upcoming',
        periodStartAt: septemberStart,
        periodEndAt: octoberStart,
        monthStartAt: septemberStart,
        monthEndAt: octoberStart,
        sequenceNumber: 2,
        paymentStatus: 'paid',
        adminActivationStatus: 'pending',
      }),
    ]);

    const result = await h.service.processDuePeriods(septemberStart);

    // The August period expires normally, but the paid-but-unapproved
    // September period must stay queued: no activation event, no entitlement
    // projection to paid_active.
    expect(result).toMatchObject({
      periodsExpired: 1,
      periodsActivated: 0,
    });
    expect(h.periods[1].periodStatus).toBe('upcoming');
    expect(h.periodEvents).not.toContainEqual(
      expect.objectContaining({
        idempotencyKey: 'period-activation:period-september',
      }),
    );
    expect(h.entitlement.state).toBe('payment_grace');
  });

  it('expires a due trial period at its exact day boundary without touching paid periods (task 3.9/3.11)', async () => {
    const trialEndAt = new Date('2026-08-20T00:00:00.000Z');
    const h = createHarness([
      period({
        id: 'trial-period',
        periodType: 'trial',
        periodStatus: 'active',
        paymentStatus: 'not_required',
        adminActivationStatus: 'approved',
        periodStartAt: new Date('2026-07-21T00:00:00.000Z'),
        periodEndAt: trialEndAt,
        monthStartAt: null,
        monthEndAt: null,
      }),
    ]);

    const result = await h.service.processDuePeriods(
      new Date('2026-08-20T01:00:00.000Z'),
    );

    expect(result).toMatchObject({
      trialPeriodsExpired: 1,
      periodsExpired: 0,
      periodsActivated: 0,
    });
    expect(h.periods[0]).toMatchObject({
      id: 'trial-period',
      periodType: 'trial',
      periodStatus: 'expired',
      endReason: 'scheduled_expiry',
    });
    expect(h.periodEvents).toContainEqual(
      expect.objectContaining({
        eventType: 'trial_period_expired',
        idempotencyKey: 'trial-expiry:trial-period',
        newStatus: 'expired',
      }),
    );
  });

  it('does not expire an active trial before its exact end boundary', async () => {
    const h = createHarness([
      period({
        id: 'trial-period',
        periodType: 'trial',
        periodStatus: 'active',
        paymentStatus: 'not_required',
        adminActivationStatus: 'approved',
        periodStartAt: new Date('2026-07-21T00:00:00.000Z'),
        periodEndAt: new Date('2026-08-20T00:00:00.000Z'),
        monthStartAt: null,
        monthEndAt: null,
      }),
    ]);

    const result = await h.service.processDuePeriods(
      new Date('2026-08-19T23:59:59.000Z'),
    );

    expect(result.trialPeriodsExpired).toBe(0);
    expect(h.periods[0].periodStatus).toBe('active');
    expect(h.periodEvents).toHaveLength(0);
  });
});
