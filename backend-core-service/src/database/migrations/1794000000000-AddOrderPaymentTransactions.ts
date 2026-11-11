import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * First-class payment ledger. Each submitted payment is an immutable row so
 * partial payments accumulate instead of overwriting a single paid amount.
 * Existing paid orders are backfilled with one `payment` row so the derived
 * payment status stays consistent for historical records.
 */
export class AddOrderPaymentTransactions1794000000000
  implements MigrationInterface
{
  name = 'AddOrderPaymentTransactions1794000000000';

  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "order_payment_transactions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "type" varchar(20) NOT NULL,
        "amount" numeric(12,2) NOT NULL DEFAULT 0,
        "proof_file_id" varchar(255),
        "proof_content_type" varchar(120),
        "proof_size_bytes" integer,
        "previous_payment_status" varchar(40),
        "new_payment_status" varchar(40),
        "reason" text,
        "actor_id" uuid,
        "actor_type" varchar(40) NOT NULL DEFAULT 'tenant_user',
        "idempotency_key" varchar(120),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CHK_order_payment_transactions_type"
          CHECK ("type" IN ('payment', 'reversal', 'status_change'))
      )
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "IDX_order_payment_transactions_tenant_order"
        ON "order_payment_transactions" ("tenant_id", "order_id")
    `);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_order_payment_transactions_idempotency"
        ON "order_payment_transactions" ("tenant_id", "order_id", "idempotency_key")
        WHERE "idempotency_key" IS NOT NULL
    `);
    // Backfill historical paid orders so payment totals derived from the ledger
    // match the legacy `paid_amount` column. No rows are deleted or changed.
    await q.query(`
      INSERT INTO "order_payment_transactions" (
        "tenant_id",
        "order_id",
        "type",
        "amount",
        "previous_payment_status",
        "new_payment_status",
        "reason",
        "actor_type",
        "metadata",
        "created_at"
      )
      SELECT
        o."tenant_id",
        o."id",
        'payment',
        GREATEST(
          COALESCE(o."paid_amount", 0),
          CASE WHEN o."payment_status" = 'paid' THEN COALESCE(o."total_amount", 0) ELSE 0 END
        ),
        'unpaid',
        o."payment_status",
        'Backfilled from legacy order.paid_amount',
        'system',
        '{"legacyBackfill": true}'::jsonb,
        COALESCE(o."created_at", CURRENT_TIMESTAMP)
      FROM "orders" o
      WHERE (
        COALESCE(o."paid_amount", 0) > 0
        OR o."payment_status" = 'paid'
      )
      AND GREATEST(
        COALESCE(o."paid_amount", 0),
        CASE WHEN o."payment_status" = 'paid' THEN COALESCE(o."total_amount", 0) ELSE 0 END
      ) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM "order_payment_transactions" t
        WHERE t."order_id" = o."id"
      )
    `);
  }

  async down(q: QueryRunner) {
    await q.query(
      `DROP INDEX IF EXISTS "UQ_order_payment_transactions_idempotency"`,
    );
    await q.query(
      `DROP INDEX IF EXISTS "IDX_order_payment_transactions_tenant_order"`,
    );
    await q.query(`DROP TABLE IF EXISTS "order_payment_transactions"`);
  }
}
