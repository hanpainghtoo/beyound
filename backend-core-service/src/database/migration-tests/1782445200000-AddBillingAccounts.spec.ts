import type { QueryRunner } from 'typeorm';

import { AddBillingAccounts1782445200000 } from '../migrations/1782445200000-AddBillingAccounts';

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

describe('AddBillingAccounts migration', () => {
  it('creates billing accounts with audit FKs and soft-delete indexes', async () => {
    const migration = new AddBillingAccounts1782445200000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('CREATE TABLE "billing_accounts"');
    expect(all).toContain('"account_no" character varying');
    expect(all).toContain('"phno" character varying');
    expect(all).toContain('"is_active" boolean NOT NULL DEFAULT true');
    expect(all).toContain('CHK_billing_accounts_type');
    expect(all).toContain('FK_billing_accounts_created_by');
    expect(all).toContain('FK_billing_accounts_updated_by');
    expect(all).toContain('IDX_billing_accounts_active_type_public');
  });

  it('drops only the billing account schema on rollback', async () => {
    const migration = new AddBillingAccounts1782445200000();
    const queryRunner = createQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('DROP TABLE "billing_accounts"');
    expect(all).toContain('DROP INDEX "IDX_billing_accounts_account_name"');
  });
});
