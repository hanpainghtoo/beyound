import { AddTenantUserNormalizedEmailIdentity1782442400000 } from '../migrations/1782442400000-AddTenantUserNormalizedEmailIdentity';
import type { QueryRunner } from 'typeorm';

type TestQueryRunner = {
  queries: string[];
  query: jest.Mock<Promise<unknown[]>, [string]>;
};

function createQueryRunner(
  duplicates: Array<{ normalized_email: string; duplicate_count: string }> = [],
): TestQueryRunner {
  const queries: string[] = [];
  return {
    queries,
    query: jest.fn((sql: string): Promise<unknown[]> => {
      queries.push(sql);
      if (sql.includes('HAVING COUNT(*) > 1'))
        return Promise.resolve(duplicates);
      return Promise.resolve([]);
    }),
  };
}

describe('AddTenantUserNormalizedEmailIdentity migration', () => {
  it('backfills normalized emails and creates the unique constraint for clean data', async () => {
    const migration = new AddTenantUserNormalizedEmailIdentity1782442400000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    expect(queryRunner.queries.join('\n')).toContain(
      `ADD "normalized_email" character varying(320)`,
    );
    expect(queryRunner.queries.join('\n')).toContain(
      `SET "normalized_email" = lower(btrim("email"))`,
    );
    expect(queryRunner.queries.join('\n')).toContain(
      `CREATE UNIQUE INDEX "uq_tenant_users_normalized_email"`,
    );
    expect(queryRunner.queries.join('\n')).toContain(
      `CREATE INDEX "idx_tenant_users_normalized_email_lookup"`,
    );
  });

  it('fails clearly when duplicate normalized emails exist', async () => {
    const migration = new AddTenantUserNormalizedEmailIdentity1782442400000();
    const queryRunner = createQueryRunner([
      { normalized_email: 'owner@example.com', duplicate_count: '2' },
    ]);

    await expect(
      migration.up(queryRunner as unknown as QueryRunner),
    ).rejects.toThrow(
      'Cannot add global tenant-user normalized email uniqueness while duplicates exist',
    );
    expect(queryRunner.queries.join('\n')).not.toContain(
      `CREATE UNIQUE INDEX "uq_tenant_users_normalized_email"`,
    );
  });

  it('documents rollback by dropping the lookup and unique indexes with the column', async () => {
    const migration = new AddTenantUserNormalizedEmailIdentity1782442400000();
    const queryRunner = createQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    expect(queryRunner.queries).toEqual([
      `DROP INDEX "idx_tenant_users_normalized_email_lookup"`,
      `DROP INDEX "uq_tenant_users_normalized_email"`,
      `ALTER TABLE "tenant_users" DROP COLUMN "normalized_email"`,
    ]);
  });
});
