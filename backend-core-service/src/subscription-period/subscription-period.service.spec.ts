import {
  DuplicateActivePeriodError,
  resolveStartOption,
  SubscriptionPeriodService,
} from './subscription-period.service';
import { yangonWallClockToUtc } from './yangon-month.util';

describe('resolveStartOption (task 2.12/2.8)', () => {
  // Sep 1 2026 Yangon boundary = 2026-08-31T17:30Z. Use a fixed `now` inside
  // August so next_month is still valid.
  const nowInAugust = new Date('2026-08-15T06:00:00.000Z');
  const afterBoundary = new Date('2026-08-31T18:00:00.000Z'); // Sep 1 00:30 Yangon

  it('assigns scheduled_prepaid when an active paid period exists', () => {
    expect(
      resolveStartOption({
        hasActivePaidPeriod: true,
        requestedStartOption: 'current_month',
        now: nowInAugust,
      }),
    ).toEqual({ ok: true, startOption: 'scheduled_prepaid' });

    // Even a hostile client-supplied next_month is overridden.
    expect(
      resolveStartOption({
        hasActivePaidPeriod: true,
        requestedStartOption: 'next_month',
        now: nowInAugust,
      }),
    ).toEqual({ ok: true, startOption: 'scheduled_prepaid' });
  });

  it('accepts current_month for a first purchase', () => {
    expect(
      resolveStartOption({
        hasActivePaidPeriod: false,
        requestedStartOption: 'current_month',
        now: nowInAugust,
      }),
    ).toEqual({ ok: true, startOption: 'current_month' });
  });

  it('accepts next_month before the Yangon boundary', () => {
    expect(
      resolveStartOption({
        hasActivePaidPeriod: false,
        requestedStartOption: 'next_month',
        now: nowInAugust,
      }),
    ).toEqual({ ok: true, startOption: 'next_month' });
  });

  it('rejects a stale next_month quote after its selected Yangon boundary', () => {
    // The quote refers to September (boundary Sep 1 00:00 Yangon); payment is
    // confirmed after that boundary, so it must be rejected, not activated
    // retroactively.
    const septemberStart = yangonWallClockToUtc(2026, 9, 1);
    expect(
      resolveStartOption({
        hasActivePaidPeriod: false,
        requestedStartOption: 'next_month',
        selectedMonthStartAt: septemberStart,
        now: afterBoundary,
      }),
    ).toEqual({ ok: false, code: 'STALE_NEXT_MONTH' });
  });

  it('requires an explicit start choice for a first purchase', () => {
    expect(
      resolveStartOption({
        hasActivePaidPeriod: false,
        requestedStartOption: undefined,
        now: nowInAugust,
      }),
    ).toEqual({ ok: false, code: 'START_OPTION_REQUIRED' });
  });
});

describe('SubscriptionPeriodService (task 2.4/2.15)', () => {
  function createService() {
    const saved: any[] = [];
    const manager = {
      getRepository: jest.fn(() => repository),
      transaction: jest.fn((callback: any) => callback(manager)),
    };
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
      getCount: jest.fn().mockResolvedValue(0),
      getRawOne: jest.fn().mockResolvedValue({ next: '1' }),
    };
    const repository = {
      manager,
      create: jest.fn((data: any) => data),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      save: jest.fn(async (data: any) => {
        saved.push(data);
        return { ...data, id: `period-${saved.length}` };
      }),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    const dataSource = { transaction: manager.transaction } as any;
    const planRepository = { find: jest.fn(async () => []) } as any;
    const service = new SubscriptionPeriodService(dataSource, planRepository);
    return { service, manager, repository, queryBuilder, saved };
  }

  const plan = {
    id: 'plan-1',
    name: 'Business Launch',
    durationDays: 30,
    messageQuotaMode: 'combined',
    messageLimit: 20000,
    inboundMessageLimit: 16000,
    outboundMessageLimit: 4000,
    apiLimit: 50000,
    allowedProviders: ['messenger', 'telegram'],
    monthlyPrice: 500000,
  } as any;

  it('locks tenant period rows with pessimistic_write', async () => {
    const { service, manager, queryBuilder } = createService();
    await service.lockTenantPeriods(manager, 'tenant-1');
    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(queryBuilder.getMany).toHaveBeenCalled();
  });

  it('creates a current_month period as active with Yangon month window', async () => {
    const { service, repository, saved } = createService();
    const monthStart = yangonWallClockToUtc(2026, 8, 1);
    const monthEnd = yangonWallClockToUtc(2026, 9, 1);

    await service.createPaidPeriod({
      tenantId: 'tenant-1',
      plan,
      monthStartAt: monthStart,
      monthEndAt: monthEnd,
      startOption: 'current_month',
      paymentStatus: 'paid',
      billingRecordId: 'billing-1',
      activatedAt: new Date('2026-08-05T00:00:00.000Z'),
    });

    const created = saved[0];
    expect(created.startOption).toBe('current_month');
    expect(created.periodStatus).toBe('active');
    expect(created.monthStartAt.getTime()).toBe(monthStart.getTime());
    expect(created.monthEndAt.getTime()).toBe(monthEnd.getTime());
    expect(created.periodStartAt.getTime()).toBe(monthStart.getTime());
    expect(created.periodEndAt.getTime()).toBe(monthEnd.getTime());
    // ActivatedAt is recorded separately from the calendar month start.
    expect(created.activatedAt.toISOString()).toBe('2026-08-05T00:00:00.000Z');
    expect(repository.createQueryBuilder).toHaveBeenCalled();
  });

  it('creates and idempotently confirms a future paid billing period without activating it', async () => {
    const { service, repository, saved } = createService();
    const monthStart = yangonWallClockToUtc(2026, 9, 1);
    const monthEnd = yangonWallClockToUtc(2026, 10, 1);

    await service.ensurePaidBillingPeriod({
      tenantId: 'tenant-1',
      plan,
      monthStartAt: monthStart,
      monthEndAt: monthEnd,
      startOption: 'scheduled_prepaid',
      periodStatus: 'upcoming',
      paymentStatus: 'paid',
      billingRecordId: 'billing-future',
    });

    expect(saved[0]).toMatchObject({
      billingRecordId: 'billing-future',
      periodStatus: 'upcoming',
      paymentStatus: 'paid',
    });
    expect(repository.find).toHaveBeenCalledWith({
      where: { billingRecordId: 'billing-future' },
    });
  });

  it('creates a next_month period as upcoming with scheduled_prepaid persistence', async () => {
    const { service, saved } = createService();
    const monthStart = yangonWallClockToUtc(2026, 9, 1);
    const monthEnd = yangonWallClockToUtc(2026, 10, 1);

    await service.createPaidPeriod({
      tenantId: 'tenant-1',
      plan,
      monthStartAt: monthStart,
      monthEndAt: monthEnd,
      startOption: 'next_month',
      paymentStatus: 'paid',
    });

    const created = saved[0];
    expect(created.periodStatus).toBe('upcoming');
    expect(created.activatedAt).toBeNull();
  });

  it('refuses a second active period after locking', async () => {
    const { service, queryBuilder } = createService();
    queryBuilder.getCount.mockResolvedValueOnce(1);

    await expect(
      service.createPaidPeriod({
        tenantId: 'tenant-1',
        plan,
        monthStartAt: yangonWallClockToUtc(2026, 9, 1),
        monthEndAt: yangonWallClockToUtc(2026, 10, 1),
        startOption: 'current_month',
      }),
    ).rejects.toThrow(DuplicateActivePeriodError);
    expect(queryBuilder.setLock).toHaveBeenCalled();
  });

  it('ignores an active trial period when guarding duplicate active paid periods (trial conversion)', async () => {
    const { service, queryBuilder } = createService();
    queryBuilder.getCount.mockResolvedValueOnce(0);

    await service.createPaidPeriod({
      tenantId: 'tenant-1',
      plan,
      monthStartAt: yangonWallClockToUtc(2026, 9, 1),
      monthEndAt: yangonWallClockToUtc(2026, 10, 1),
      startOption: 'current_month',
      convertedFromPeriodId: 'trial-1',
    });

    // The one-active-period guard must only count PAID periods so a trial
    // conversion can create the paid period while the trial stays active.
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      "period.period_type = 'paid'",
    );
  });
});
