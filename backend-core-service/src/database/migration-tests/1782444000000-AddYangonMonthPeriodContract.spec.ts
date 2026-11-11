import { AddYangonMonthPeriodContract1782444000000 } from '../migrations/1782444000000-AddYangonMonthPeriodContract';
import type { QueryRunner } from 'typeorm';

type TestQueryRunner = {
  queries: string[];
  query: jest.Mock<Promise<unknown[]>, [string]>;
};

function createQueryRunner(): TestQueryRunner {
  const queries: string[] = [];
  return {
    queries,
    query: jest.fn((sql: string): Promise<unknown[]> => {
      queries.push(sql);
      return Promise.resolve([]);
    }),
  };
}

describe('AddYangonMonthPeriodContract migration', () => {
  it('adds the Yangon calendar-month columns and start_option', async () => {
    const migration = new AddYangonMonthPeriodContract1782444000000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('ADD "month_start_at" TIMESTAMP WITH TIME ZONE');
    expect(all).toContain('ADD "month_end_at" TIMESTAMP WITH TIME ZONE');
    expect(all).toContain('ADD "start_option" character varying(40)');
    expect(all).toContain(
      `CHK_subscription_period_start_option" CHECK ("start_option" IN ('current_month', 'next_month', 'scheduled_prepaid'))`,
    );
    expect(all).toContain('CHK_subscription_period_month_dates');
    expect(all).toContain('IDX_subscription_periods_upcoming_month_end');
  });

  it('is additive — it never rewrites legacy rows', async () => {
    const migration = new AddYangonMonthPeriodContract1782444000000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    // No UPDATE/SET of existing period dates or snapshots.
    expect(all).not.toMatch(/UPDATE\s+"tenant_subscription_periods"/i);
    expect(all).not.toMatch(/SET\s+"month_start_at"/i);
    expect(all).not.toContain('DROP COLUMN');
    expect(all).not.toContain('DROP TABLE');
  });

  it('documents rollback by dropping the columns and constraints', async () => {
    const migration = new AddYangonMonthPeriodContract1782444000000();
    const queryRunner = createQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain(
      'DROP INDEX "IDX_subscription_periods_upcoming_month_end"',
    );
    expect(all).toContain(
      'DROP CONSTRAINT "CHK_subscription_period_month_dates"',
    );
    expect(all).toContain(
      'DROP CONSTRAINT "CHK_subscription_period_start_option"',
    );
    expect(all).toContain('DROP COLUMN "start_option"');
    expect(all).toContain('DROP COLUMN "month_end_at"');
    expect(all).toContain('DROP COLUMN "month_start_at"');
  });
});
