import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant-scoped registry of customer tag names backing the workspace
 * "Manage Tag" dialog and the new-customer tag picker. Assignment itself
 * stays on the existing `customers.tags` string array — this table only
 * standardizes the vocabulary, with case-insensitive uniqueness per tenant.
 * Deleting a registry row intentionally leaves customers' existing tags
 * untouched.
 */
export class AddCustomerTags1793260000000 implements MigrationInterface {
  name = 'AddCustomerTags1793260000000';

  async up(q: QueryRunner) {
    await q.query(
      `CREATE TABLE IF NOT EXISTS customer_tags (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name varchar(60) NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_tags_tenant_name ON customer_tags(tenant_id, lower(name))`,
    );
  }

  async down(q: QueryRunner) {
    await q.query(`DROP INDEX IF EXISTS uq_customer_tags_tenant_name`);
    await q.query(`DROP TABLE IF EXISTS customer_tags`);
  }
}
