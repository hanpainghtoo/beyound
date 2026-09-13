import { AddSubscriptionAddOnPurchase1782444200000 } from '../migrations/1782444200000-AddSubscriptionAddOnPurchase';
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

describe('AddSubscriptionAddOnPurchase migration', () => {
  it('creates the purchase, component, and event tables', async () => {
    const migration = new AddSubscriptionAddOnPurchase1782444200000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain(
      'CREATE TABLE "tenant_subscription_add_on_purchases"',
    );
    expect(all).toContain(
      'CREATE TABLE "tenant_subscription_add_on_components"',
    );
    expect(all).toContain(
      'CREATE TABLE "tenant_subscription_add_on_purchase_events"',
    );
  });

  it('enforces status allow-lists and the positive component quantity', async () => {
    const migration = new AddSubscriptionAddOnPurchase1782444200000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('pending');
    expect(all).toContain('CHECK ("purchase_price" >= 0)');
    expect(all).toContain('CHECK ("quantity" > 0)');
    expect(all).toContain("'add_on_purchase_created'");
    expect(all).toContain("'add_on_payment_confirmed'");
    expect(all).toContain("'add_on_activated'");
    expect(all).toContain("'add_on_expired'");
    expect(all).toContain("'add_on_cancelled'");
    // No refund event type exists in this release.
    expect(all).not.toContain('refund');
  });

  it('enforces tenant ownership FKs and idempotency partial unique indexes', async () => {
    const migration = new AddSubscriptionAddOnPurchase1782444200000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain(
      'CONSTRAINT "FK_subscription_add_on_purchases_tenant"',
    );
    expect(all).toContain(
      'CONSTRAINT "FK_subscription_add_on_purchases_period"',
    );
    expect(all).toContain(
      'CONSTRAINT "FK_subscription_add_on_purchases_product"',
    );
    expect(all).toContain(
      'CONSTRAINT "FK_subscription_add_on_purchases_billing_record"',
    );
    expect(all).toContain(
      'CREATE UNIQUE INDEX "UQ_subscription_add_on_purchases_idempotency"',
    );
    expect(all).toContain(
      'CREATE UNIQUE INDEX "UQ_subscription_add_on_purchase_events_idempotency"',
    );
  });

  it('is additive — it never modifies existing tables', async () => {
    const migration = new AddSubscriptionAddOnPurchase1782444200000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).not.toMatch(
      /ALTER TABLE\s+"(subscription_plans|tenants|tenant_subscription_periods|subscription_add_on_products)"/i,
    );
    expect(all).not.toContain('DROP COLUMN');
    expect(all).not.toContain('DROP TABLE');
  });

  it('documents rollback by dropping the three tables', async () => {
    const migration = new AddSubscriptionAddOnPurchase1782444200000();
    const queryRunner = createQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain(
      'DROP TABLE "tenant_subscription_add_on_purchase_events"',
    );
    expect(all).toContain('DROP TABLE "tenant_subscription_add_on_components"');
    expect(all).toContain('DROP TABLE "tenant_subscription_add_on_purchases"');
  });
});
