import type { QueryRunner } from 'typeorm';

import { CreateFeatureToggles1782446900000 } from '../migrations/1782446900000-CreateFeatureToggles';

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

describe('CreateFeatureToggles migration', () => {
  it('creates the catalog and per-tenant join tables', async () => {
    const migration = new CreateFeatureToggles1782446900000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('CREATE TABLE "feature_categories"');
    expect(all).toContain('CREATE TABLE "tenant_feature_configs"');
    expect(all).toContain('UQ_feature_categories_key');
    expect(all).toContain('UQ_tenant_feature_configs_tenant_feature');
    expect(all).toContain('ON DELETE CASCADE');
  });

  it('seeds the catalog with inbox locked and deliveries depending on orders', async () => {
    const migration = new CreateFeatureToggles1782446900000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain(`('inbox', 'Inbox & Chat'`);
    expect(all).toContain('NULL, false, 10');
    expect(all).toContain(`'deliveries'`);
    expect(all).toContain(
      `'deliveries', 'Deliveries', 'Delivery runs and delivery assignments. Requires Orders.', 'orders'`,
    );
    expect(all).toContain('ON CONFLICT ("key") DO UPDATE SET');
  });

  it('backfills every existing tenant with all categories enabled', async () => {
    const migration = new CreateFeatureToggles1782446900000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const backfill = queryRunner.queries.find((sql) =>
      sql.includes('CROSS JOIN "feature_categories"'),
    );
    expect(backfill).toBeDefined();
    expect(backfill).toContain('SELECT t."id", fc."id", true');
    expect(backfill).toContain(
      'ON CONFLICT ("tenant_id", "feature_category_id") DO NOTHING',
    );
  });

  it('drops both tables on rollback', async () => {
    const migration = new CreateFeatureToggles1782446900000();
    const queryRunner = createQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    expect(queryRunner.queries).toEqual([
      'DROP TABLE "tenant_feature_configs"',
      'DROP TABLE "feature_categories"',
    ]);
  });
});
