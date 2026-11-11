import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStage2OrderCreationInfrastructure1782447400000 implements MigrationInterface {
  name = 'AddStage2OrderCreationInfrastructure1782447400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "order_settings" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_payment_proofs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
        "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE, "status" varchar NOT NULL DEFAULT 'pending_review',
        "media_link" text NULL, "telegram_file_unique_id" varchar NULL, "mime_type" varchar NULL, "size_bytes" integer NULL,
        "submitted_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewed_at" timestamptz NULL, "reviewer_id" uuid NULL,
        "rejection_reason" text NULL, "source_message_id" varchar NULL, "source_file_id" varchar NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CHK_order_payment_proofs_status" CHECK ("status" IN ('pending_review', 'approved', 'rejected'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_order_payment_proofs_tenant_order" ON "order_payment_proofs" ("tenant_id", "order_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_creation_idempotencies" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "customer_id" uuid NULL REFERENCES "customers"("id") ON DELETE CASCADE, "key" varchar NOT NULL, "request_hash" varchar(64) NOT NULL,
        "order_id" uuid NULL REFERENCES "orders"("id") ON DELETE SET NULL, "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "expires_at" timestamptz NOT NULL, "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UQ_order_creation_idempotencies_tenant_key" UNIQUE ("tenant_id", "key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_order_creation_idempotencies_expires" ON "order_creation_idempotencies" ("expires_at")`,
    );

    // This audit intentionally excludes every legacy order. It is a migration
    // gate: operators receive the exact duplicate groups before the index exists.
    const duplicates = (await queryRunner.query(`
      SELECT tenant_id, customer_id, COUNT(*)::int AS count, ARRAY_AGG(id) AS order_ids
      FROM orders
      WHERE reservation_managed = true AND status IN ('pending_payment', 'rejected') AND customer_id IS NOT NULL
      GROUP BY tenant_id, customer_id HAVING COUNT(*) > 1
    `)) as Array<Record<string, unknown>>;
    if (duplicates.length > 0) {
      throw new Error(
        `Stage 2 active-unpaid duplicate audit failed (managed orders only): ${JSON.stringify(duplicates)}`,
      );
    }
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_orders_managed_active_unpaid_customer"
      ON "orders" ("tenant_id", "customer_id")
      WHERE "reservation_managed" = true AND "status" IN ('pending_payment', 'rejected') AND "customer_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_orders_managed_active_unpaid_customer"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_order_creation_idempotencies_expires"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "order_creation_idempotencies"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_order_payment_proofs_tenant_order"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "order_payment_proofs"`);
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN IF EXISTS "order_settings"`,
    );
  }
}
