import { UpgradeSupersededChecks1782446700000 } from '../migrations/1782446700000-UpgradeSupersededChecks';
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

describe('UpgradeSupersededChecks migration', () => {
  it('widens both CHECK constraints with the superseded values', async () => {
    const migration = new UpgradeSupersededChecks1782446700000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('DROP CONSTRAINT "CHK_subscription_upgrade_status"');
    expect(all).toContain(`'superseded'`);
    expect(all).toContain(
      'DROP CONSTRAINT "CHK_subscription_period_event_type"',
    );
    expect(all).toContain(`'upgrade_superseded'`);
  });

  it('restores the pre-chain checks on rollback', async () => {
    const migration = new UpgradeSupersededChecks1782446700000();
    const queryRunner = createQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('DROP CONSTRAINT "CHK_subscription_upgrade_status"');
    expect(all).toContain(
      'DROP CONSTRAINT "CHK_subscription_period_event_type"',
    );
    expect(all).toContain(
      'ADD CONSTRAINT "CHK_subscription_period_event_type"',
    );
    expect(all).not.toContain(`'upgrade_superseded'`);
  });
});
