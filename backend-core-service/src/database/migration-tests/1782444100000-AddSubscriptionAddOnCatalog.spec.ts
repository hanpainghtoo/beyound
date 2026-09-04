import { AddSubscriptionAddOnCatalog1782444100000 } from '../migrations/1782444100000-AddSubscriptionAddOnCatalog';
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

describe('AddSubscriptionAddOnCatalog migration', () => {
  it('creates the three catalog tables with product, component, and event tables', async () => {
    const migration = new AddSubscriptionAddOnCatalog1782444100000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('CREATE TABLE "subscription_add_on_products"');
    expect(all).toContain(
      'CREATE TABLE "subscription_add_on_product_components"',
    );
    expect(all).toContain('CREATE TABLE "subscription_add_on_events"');
  });

  it('enforces the component allow-list and positive quantity', async () => {
    const migration = new AddSubscriptionAddOnCatalog1782444100000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('component_type');
    expect(all).toContain('inbound_messages');
    expect(all).toContain('outbound_messages');
    expect(all).toContain('api_requests');
    expect(all).toContain('channel_slots');
    expect(all).toContain('storage_gb');
    expect(all).toContain('CHECK ("quantity" > 0)');
  });

  it('is additive — it never modifies existing tables', async () => {
    const migration = new AddSubscriptionAddOnCatalog1782444100000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).not.toMatch(
      /ALTER TABLE\s+"(subscription_plans|tenants|tenant_subscription_periods)"/i,
    );
    expect(all).not.toContain('DROP COLUMN');
    expect(all).not.toContain('DROP TABLE');
  });

  it('documents rollback by dropping the three tables', async () => {
    const migration = new AddSubscriptionAddOnCatalog1782444100000();
    const queryRunner = createQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('DROP TABLE "subscription_add_on_events"');
    expect(all).toContain(
      'DROP TABLE "subscription_add_on_product_components"',
    );
    expect(all).toContain('DROP TABLE "subscription_add_on_products"');
  });
});
