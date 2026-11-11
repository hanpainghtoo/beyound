import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStage1OrderInfrastructure1782447200000 implements MigrationInterface {
  name = 'AddStage1OrderInfrastructure1782447200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // QueryRunner exposes raw rows as any; this migration only needs a count.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const duplicateOrderNumbers = await queryRunner.query(`
      SELECT tenant_id, order_number, COUNT(*)::int AS count
      FROM orders
      WHERE order_number IS NOT NULL
      GROUP BY tenant_id, order_number
      HAVING COUNT(*) > 1
    `);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (duplicateOrderNumbers.length > 0) {
      throw new Error(
        `Stage 1 migration blocked by duplicate tenant order numbers: ${JSON.stringify(duplicateOrderNumbers)}`,
      );
    }
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "reservation_managed" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "expires_at" timestamptz NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "tenants"
        ADD COLUMN IF NOT EXISTS "order_expiry_settings" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_order_counters" (
        "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
        "next_value" bigint NOT NULL DEFAULT 1001,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      INSERT INTO "tenant_order_counters" ("tenant_id", "next_value")
      SELECT t."id", COALESCE(MAX(NULLIF(regexp_replace(o."order_number", '[^0-9]', '', 'g'), '')::bigint), 1000) + 1
      FROM "tenants" t
      LEFT JOIN "orders" o ON o."tenant_id" = t."id"
      GROUP BY t."id"
      ON CONFLICT ("tenant_id") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_orders_tenant_order_number"
      ON "orders" ("tenant_id", "order_number")
      WHERE "order_number" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_item_reservations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
        "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "order_item_id" uuid NOT NULL REFERENCES "order_items"("id") ON DELETE CASCADE,
        "product_id" uuid NOT NULL REFERENCES "products"("id"),
        "quantity" integer NOT NULL CHECK ("quantity" > 0),
        "kind" varchar NOT NULL DEFAULT 'inventory',
        "state" varchar NOT NULL DEFAULT 'active' CHECK ("state" IN ('active', 'converted', 'released')),
        "release_reason" varchar NULL,
        "reserved_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "released_at" timestamptz NULL,
        "converted_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UQ_order_item_reservations_item_kind" UNIQUE ("order_item_id", "kind")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_order_item_reservations_product_state"
      ON "order_item_reservations" ("tenant_id", "product_id", "state")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_movements" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
        "product_id" uuid NOT NULL REFERENCES "products"("id"),
        "order_id" uuid NULL REFERENCES "orders"("id"),
        "delta" integer NOT NULL CHECK ("delta" <> 0),
        "reason" varchar NOT NULL,
        "actor_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_movements_tenant_product_created"
      ON "stock_movements" ("tenant_id", "product_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "stock_movements"');
    await queryRunner.query('DROP TABLE IF EXISTS "order_item_reservations"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_orders_tenant_order_number"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "tenant_order_counters"');
    await queryRunner.query(
      'ALTER TABLE "tenants" DROP COLUMN IF EXISTS "order_expiry_settings"',
    );
    await queryRunner.query(
      'ALTER TABLE "orders" DROP COLUMN IF EXISTS "expires_at", DROP COLUMN IF EXISTS "reservation_managed"',
    );
  }
}
