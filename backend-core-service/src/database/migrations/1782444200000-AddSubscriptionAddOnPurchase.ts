import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan 9 Phase 4 (tasks 4.1/4.2): top-up purchase, component, and lifecycle
 * event tables.
 *
 * Additive only — creates three new tables:
 * - `tenant_subscription_add_on_purchases` — one immutable bundle grant per
 *   confirmed payment, attached to the tenant's active paid period, with a
 *   product price/currency snapshot and authoritative billing linkage
 *   (`billing_record_id`, task 4.1). No unique constraint on
 *   (tenant, period, product): repeated purchases stack by design.
 * - `tenant_subscription_add_on_components` — normalized child snapshots of
 *   every product component at purchase time (typed dimension, quantity,
 *   unit, and the same target-period expiry as the parent).
 * - `tenant_subscription_add_on_purchase_events` — idempotent lifecycle audit
 *   trail (created, payment-confirmed, activated, expired, cancelled).
 *
 * Tenant ownership is enforced by FK + service checks; refund actions are out
 * of scope for this release and no refund event type exists.
 */
export class AddSubscriptionAddOnPurchase1782444200000 implements MigrationInterface {
  name = 'AddSubscriptionAddOnPurchase1782444200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenant_subscription_add_on_purchases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "subscription_period_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "billing_record_id" uuid,
        "purchase_price" numeric(10,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'MMK',
        "payment_status" character varying NOT NULL DEFAULT 'pending',
        "purchase_status" character varying NOT NULL DEFAULT 'pending',
        "effective_at" TIMESTAMP WITH TIME ZONE,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "idempotency_key" character varying(160),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_subscription_add_on_purchases_payment_status" CHECK ("payment_status" IN ('pending', 'paid', 'failed')),
        CONSTRAINT "CHK_subscription_add_on_purchases_purchase_status" CHECK ("purchase_status" IN ('pending', 'active', 'expired', 'cancelled')),
        CONSTRAINT "CHK_subscription_add_on_purchases_price" CHECK ("purchase_price" >= 0),
        CONSTRAINT "FK_subscription_add_on_purchases_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscription_add_on_purchases_period" FOREIGN KEY ("subscription_period_id") REFERENCES "tenant_subscription_periods"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_subscription_add_on_purchases_product" FOREIGN KEY ("product_id") REFERENCES "subscription_add_on_products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_subscription_add_on_purchases_billing_record" FOREIGN KEY ("billing_record_id") REFERENCES "tenant_billing_records"("id") ON DELETE SET NULL,
        CONSTRAINT "PK_subscription_add_on_purchases" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_add_on_purchases_tenant_created"
        ON "tenant_subscription_add_on_purchases" ("tenant_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_add_on_purchases_period"
        ON "tenant_subscription_add_on_purchases" ("subscription_period_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_add_on_purchases_product"
        ON "tenant_subscription_add_on_purchases" ("product_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_add_on_purchases_status_end"
        ON "tenant_subscription_add_on_purchases" ("purchase_status", "expires_at")
    `);
    // One purchase request/payment event is idempotent; the same product may
    // still be purchased repeatedly under different keys.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscription_add_on_purchases_idempotency"
       ON "tenant_subscription_add_on_purchases" ("idempotency_key")
       WHERE "idempotency_key" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "tenant_subscription_add_on_components" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "purchase_id" uuid NOT NULL,
        "component_type" character varying(40) NOT NULL,
        "quantity" integer NOT NULL,
        "unit" character varying(20) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "component_status" character varying NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_subscription_add_on_components_type" CHECK ("component_type" IN ('inbound_messages', 'outbound_messages', 'api_requests', 'channel_slots', 'storage_gb')),
        CONSTRAINT "CHK_subscription_add_on_components_unit" CHECK ("unit" IN ('messages', 'requests', 'channels', 'gb')),
        CONSTRAINT "CHK_subscription_add_on_components_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "CHK_subscription_add_on_components_status" CHECK ("component_status" IN ('pending', 'active', 'expired')),
        CONSTRAINT "FK_subscription_add_on_components_purchase" FOREIGN KEY ("purchase_id") REFERENCES "tenant_subscription_add_on_purchases"("id") ON DELETE CASCADE,
        CONSTRAINT "PK_subscription_add_on_components" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_add_on_components_purchase"
        ON "tenant_subscription_add_on_components" ("purchase_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_subscription_add_on_purchase_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "purchase_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "event_type" character varying(40) NOT NULL,
        "previous_status" character varying(40),
        "new_status" character varying(40),
        "actor_type" character varying(40) NOT NULL,
        "actor_id" character varying(120),
        "source" character varying(80) NOT NULL,
        "reason" character varying(240) NOT NULL,
        "idempotency_key" character varying(160),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_subscription_add_on_purchase_events_type" CHECK ("event_type" IN ('add_on_purchase_created', 'add_on_payment_confirmed', 'add_on_activated', 'add_on_expired', 'add_on_cancelled')),
        CONSTRAINT "FK_subscription_add_on_purchase_events_purchase" FOREIGN KEY ("purchase_id") REFERENCES "tenant_subscription_add_on_purchases"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscription_add_on_purchase_events_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "PK_subscription_add_on_purchase_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_add_on_purchase_events_purchase_created"
        ON "tenant_subscription_add_on_purchase_events" ("purchase_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_add_on_purchase_events_tenant_created"
        ON "tenant_subscription_add_on_purchase_events" ("tenant_id", "created_at")
    `);
    // A payment/activation can only be granted once per idempotency key.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscription_add_on_purchase_events_idempotency"
       ON "tenant_subscription_add_on_purchase_events" ("idempotency_key")
       WHERE "idempotency_key" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE "tenant_subscription_add_on_purchase_events"`,
    );
    await queryRunner.query(
      `DROP TABLE "tenant_subscription_add_on_components"`,
    );
    await queryRunner.query(
      `DROP TABLE "tenant_subscription_add_on_purchases"`,
    );
  }
}
