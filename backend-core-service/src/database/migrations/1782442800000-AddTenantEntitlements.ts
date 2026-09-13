import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantEntitlements1782442800000 implements MigrationInterface {
  name = 'AddTenantEntitlements1782442800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tenant_entitlements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "plan_id" uuid NOT NULL, "state" character varying(40) NOT NULL, "trial_starts_at" TIMESTAMP WITH TIME ZONE, "trial_ends_at" TIMESTAMP WITH TIME ZONE, "grace_ends_at" TIMESTAMP WITH TIME ZONE, "paid_period_starts_at" TIMESTAMP WITH TIME ZONE, "paid_period_ends_at" TIMESTAMP WITH TIME ZONE, "suspended_at" TIMESTAMP WITH TIME ZONE, "suspension_reason" character varying(160), "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancellation_reason" character varying(160), "reactivation_requested_at" TIMESTAMP WITH TIME ZONE, "reactivation_evidence" jsonb NOT NULL DEFAULT '{}', "version" integer NOT NULL DEFAULT 1, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_tenant_entitlements_state" CHECK ("state" IN ('trial_active', 'trial_grace', 'paid_active', 'payment_grace', 'suspended', 'expired', 'cancelled', 'reactivation_pending')), CONSTRAINT "PK_tenant_entitlements" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_tenant_entitlements_tenant" ON "tenant_entitlements" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_entitlements_state_trial_end" ON "tenant_entitlements" ("state", "trial_ends_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_entitlements_state_grace_end" ON "tenant_entitlements" ("state", "grace_ends_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_entitlements_state_paid_end" ON "tenant_entitlements" ("state", "paid_period_ends_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "FK_tenant_entitlements_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "FK_tenant_entitlements_plan" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "tenant_entitlement_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "entitlement_id" uuid NOT NULL, "tenant_id" uuid NOT NULL, "previous_state" character varying(40), "new_state" character varying(40) NOT NULL, "actor_type" character varying(40) NOT NULL, "actor_id" character varying(120), "source" character varying(80) NOT NULL, "reason" character varying(240) NOT NULL, "idempotency_key" character varying(160), "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_tenant_entitlement_events_previous_state" CHECK ("previous_state" IS NULL OR "previous_state" IN ('trial_active', 'trial_grace', 'paid_active', 'payment_grace', 'suspended', 'expired', 'cancelled', 'reactivation_pending')), CONSTRAINT "CHK_tenant_entitlement_events_new_state" CHECK ("new_state" IN ('trial_active', 'trial_grace', 'paid_active', 'payment_grace', 'suspended', 'expired', 'cancelled', 'reactivation_pending')), CONSTRAINT "PK_tenant_entitlement_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_entitlement_events_entitlement" ON "tenant_entitlement_events" ("entitlement_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_tenant_entitlement_events_idempotency" ON "tenant_entitlement_events" ("idempotency_key") WHERE idempotency_key IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_entitlement_events" ADD CONSTRAINT "FK_tenant_entitlement_events_entitlement" FOREIGN KEY ("entitlement_id") REFERENCES "tenant_entitlements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      INSERT INTO "tenant_entitlements" (
        "tenant_id",
        "plan_id",
        "state",
        "trial_starts_at",
        "trial_ends_at",
        "paid_period_starts_at",
        "paid_period_ends_at",
        "created_at",
        "updated_at"
      )
      SELECT
        tenants."id",
        plans."id",
        CASE
          WHEN tenants."status" = 'suspended' THEN 'suspended'
          WHEN tenants."subscription_end_date" IS NOT NULL AND tenants."subscription_end_date" < CURRENT_DATE THEN 'expired'
          WHEN tenants."subscription_start_date" IS NOT NULL THEN 'trial_active'
          ELSE 'trial_active'
        END,
        COALESCE(tenants."subscription_start_date"::timestamptz, tenants."created_at"),
        COALESCE((tenants."subscription_end_date" + INTERVAL '1 day')::timestamptz, tenants."created_at" + INTERVAL '14 days'),
        NULL,
        NULL,
        now(),
        now()
      FROM "tenants" tenants
      JOIN "subscription_plans" plans
        ON plans."id"::text = tenants."subscription_plan_id"
      WHERE tenants."subscription_plan_id" IS NOT NULL
      ON CONFLICT ("tenant_id") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "tenant_entitlement_events" (
        "entitlement_id",
        "tenant_id",
        "previous_state",
        "new_state",
        "actor_type",
        "actor_id",
        "source",
        "reason",
        "idempotency_key",
        "metadata"
      )
      SELECT
        entitlement."id",
        entitlement."tenant_id",
        NULL,
        entitlement."state",
        'system',
        'migration',
        'system',
        'Migrated tenant subscription fields into central entitlement',
        'migration:tenant-entitlement:' || entitlement."tenant_id"::text,
        jsonb_build_object('migration', '1782442800000-AddTenantEntitlements')
      FROM "tenant_entitlements" entitlement
      WHERE NOT EXISTS (
        SELECT 1
        FROM "tenant_entitlement_events" existing
        WHERE existing."idempotency_key" = 'migration:tenant-entitlement:' || entitlement."tenant_id"::text
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_entitlement_events" DROP CONSTRAINT "FK_tenant_entitlement_events_entitlement"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_tenant_entitlement_events_idempotency"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_tenant_entitlement_events_entitlement"`,
    );
    await queryRunner.query(`DROP TABLE "tenant_entitlement_events"`);
    await queryRunner.query(
      `ALTER TABLE "tenant_entitlements" DROP CONSTRAINT "FK_tenant_entitlements_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_entitlements" DROP CONSTRAINT "FK_tenant_entitlements_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_tenant_entitlements_state_paid_end"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_tenant_entitlements_state_grace_end"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_tenant_entitlements_state_trial_end"`,
    );
    await queryRunner.query(`DROP INDEX "UQ_tenant_entitlements_tenant"`);
    await queryRunner.query(`DROP TABLE "tenant_entitlements"`);
  }
}
