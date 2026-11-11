import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan 9 Phase 3 (task 3.1): add the reusable top-up (add-on) catalog.
 *
 * Additive only — creates two new tables plus an event log:
 * - `subscription_add_on_products` — sellable bundles (code, name, price...).
 * - `subscription_add_on_product_components` — normalized typed quota child
 *   rows (inbound/outbound messages, api_requests, channel_slots, storage_gb).
 * - `subscription_add_on_events` — idempotent audit trail for catalog
 *   mutations (create/update/publish/archive/component changes).
 *
 * Catalog rows grant no quota on their own; purchase and attachment happen in
 * a later phase. No existing table is modified.
 */
export class AddSubscriptionAddOnCatalog1782444100000 implements MigrationInterface {
  name = 'AddSubscriptionAddOnCatalog1782444100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "subscription_add_on_products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "price" numeric(10,2) NOT NULL DEFAULT 0,
        "currency" character varying NOT NULL DEFAULT 'MMK',
        "status" character varying NOT NULL DEFAULT 'inactive',
        "version" integer NOT NULL DEFAULT 1,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_subscription_add_on_products_code" UNIQUE ("code"),
        CONSTRAINT "CHK_subscription_add_on_products_status" CHECK ("status" IN ('active', 'inactive', 'archived')),
        CONSTRAINT "CHK_subscription_add_on_products_price" CHECK ("price" >= 0),
        CONSTRAINT "PK_subscription_add_on_products" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_add_on_products_status"
        ON "subscription_add_on_products" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE "subscription_add_on_product_components" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "component_type" character varying(40) NOT NULL,
        "quantity" integer NOT NULL,
        "unit" character varying(20) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_subscription_add_on_product_components_product_type" UNIQUE ("product_id", "component_type"),
        CONSTRAINT "CHK_subscription_add_on_product_components_type" CHECK ("component_type" IN ('inbound_messages', 'outbound_messages', 'api_requests', 'channel_slots', 'storage_gb')),
        CONSTRAINT "CHK_subscription_add_on_product_components_unit" CHECK ("unit" IN ('messages', 'requests', 'channels', 'gb')),
        CONSTRAINT "CHK_subscription_add_on_product_components_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "FK_subscription_add_on_product_components_product" FOREIGN KEY ("product_id") REFERENCES "subscription_add_on_products"("id") ON DELETE CASCADE,
        CONSTRAINT "PK_subscription_add_on_product_components" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_add_on_product_components_product"
        ON "subscription_add_on_product_components" ("product_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "subscription_add_on_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid,
        "event_type" character varying(40) NOT NULL,
        "actor_type" character varying(40) NOT NULL,
        "actor_id" character varying(120),
        "source" character varying(80) NOT NULL,
        "reason" character varying(240) NOT NULL,
        "idempotency_key" character varying(160),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_subscription_add_on_events_type" CHECK ("event_type" IN ('add_on_product_created', 'add_on_product_updated', 'add_on_product_published', 'add_on_product_archived', 'add_on_product_deleted', 'add_on_product_component_changed')),
        -- NULLable + SET NULL so the delete audit event survives the product
        -- row deletion instead of being cascade-removed with it.
        CONSTRAINT "FK_subscription_add_on_events_product" FOREIGN KEY ("product_id") REFERENCES "subscription_add_on_products"("id") ON DELETE SET NULL,
        CONSTRAINT "PK_subscription_add_on_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_add_on_events_product_created"
        ON "subscription_add_on_events" ("product_id", "created_at")
    `);
    // Partial unique index so replaying the same admin mutation with the same
    // key is a no-op (matches the entity's @Index with a WHERE clause).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscription_add_on_events_idempotency"
       ON "subscription_add_on_events" ("idempotency_key")
       WHERE "idempotency_key" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "subscription_add_on_events"`);
    await queryRunner.query(
      `DROP TABLE "subscription_add_on_product_components"`,
    );
    await queryRunner.query(`DROP TABLE "subscription_add_on_products"`);
  }
}
