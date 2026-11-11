import { UpgradeChaining1782446600000 } from '../migrations/1782446600000-UpgradeChaining';
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

describe('UpgradeChaining migration', () => {
  it('replaces the single-slot index with a pending-only singularity index', async () => {
    const migration = new UpgradeChaining1782446600000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain(
      'DROP INDEX IF EXISTS "UQ_subscription_upgrade_revisions_period"',
    );
    expect(all).toContain(
      'CREATE UNIQUE INDEX "UQ_upgrade_revisions_one_pending"',
    );
    expect(all).toContain(`'requested', 'pending_payment', 'pending_approval'`);
  });

  it('restores the single-slot index on rollback', async () => {
    const migration = new UpgradeChaining1782446600000();
    const queryRunner = createQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain(
      'DROP INDEX IF EXISTS "UQ_upgrade_revisions_one_pending"',
    );
    expect(all).toContain(
      'CREATE UNIQUE INDEX "UQ_subscription_upgrade_revisions_period"',
    );
    expect(all).toContain(`<> 'cancelled'`);
  });
});
