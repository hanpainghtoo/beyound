import { AddUniquePeriodBillingRecordLink1782444500000 } from '../migrations/1782444500000-AddUniquePeriodBillingRecordLink';

describe('AddUniquePeriodBillingRecordLink1782444500000', () => {
  it('runs duplicate preflight, creates, and removes the partial unique index', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as any;
    const migration = new AddUniquePeriodBillingRecordLink1782444500000();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    expect(queries[0]).toContain('GROUP BY "billing_record_id"');
    expect(queries[1]).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_subscription_periods_billing_record"',
    );
    expect(queries[1]).toContain('WHERE "billing_record_id" IS NOT NULL');
    expect(queries[2]).toContain(
      'DROP INDEX IF EXISTS "UQ_subscription_periods_billing_record"',
    );
  });

  it('blocks index creation when duplicate links are found', async () => {
    const queryRunner = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ billing_record_id: 'billing-1', count: 2 }]),
    } as any;
    const migration = new AddUniquePeriodBillingRecordLink1782444500000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'reconcile duplicate billing_record_id rows first',
    );
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
  });
});
