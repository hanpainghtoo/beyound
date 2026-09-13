import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionPeriods1782443950000 implements MigrationInterface {
  name = 'AddSubscriptionPeriods1782443950000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tenant_subscription_periods" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "plan_id" uuid NOT NULL,
        "billing_record_id" uuid,
        "period_type" character varying NOT NULL DEFAULT 'paid',
        "period_status" character varying NOT NULL DEFAULT 'upcoming',
        "payment_status" character varying NOT NULL DEFAULT 'pending',
        "duration_days" integer NOT NULL,
        "period_start_at" TIMESTAMP WITH TIME ZONE,
        "period_end_at" TIMESTAMP WITH TIME ZONE,
        "scheduled_start_at" TIMESTAMP WITH TIME ZONE,
        "scheduled_end_at" TIMESTAMP WITH TIME ZONE,
        "activated_at" TIMESTAMP WITH TIME ZONE,
        "expired_at" TIMESTAMP WITH TIME ZONE,
        "end_reason" character varying(40),
        "activation_reason" character varying(40),
        "sequence_number" integer NOT NULL,
        "quota_snapshot" jsonb NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_subscription_period_type" CHECK ("period_type" IN ('trial', 'paid')),
        CONSTRAINT "CHK_subscription_period_status" CHECK ("period_status" IN ('upcoming', 'active', 'expired', 'cancelled')),
        CONSTRAINT "CHK_subscription_period_payment_status" CHECK ("payment_status" IN ('pending', 'paid', 'failed', 'refunded')),
        CONSTRAINT "CHK_subscription_period_duration" CHECK ("duration_days" > 0),
        CONSTRAINT "CHK_subscription_period_dates" CHECK (
          "period_start_at" IS NULL
          OR "period_end_at" IS NULL
          OR "period_end_at" > "period_start_at"
        ),
        CONSTRAINT "CHK_subscription_period_end_reason" CHECK (
          "end_reason" IS NULL
          OR "end_reason" IN ('scheduled_expiry', 'early_quota_renewal', 'cancelled')
        ),
        CONSTRAINT "CHK_subscription_period_activation_reason" CHECK (
          "activation_reason" IS NULL
          OR "activation_reason" IN ('initial', 'scheduled', 'early_renewal')
        ),
        CONSTRAINT "CHK_subscription_period_sequence" CHECK ("sequence_number" >= 1),
        CONSTRAINT "PK_tenant_subscription_periods" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_periods_tenant_status" ON "tenant_subscription_periods" ("tenant_id", "period_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_periods_tenant_sequence" ON "tenant_subscription_periods" ("tenant_id", "sequence_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_periods_status_end" ON "tenant_subscription_periods" ("period_status", "period_end_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_periods_billing_record" ON "tenant_subscription_periods" ("billing_record_id")`,
    );
    // Mandatory one-active invariant: at most one active period per tenant.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscription_periods_one_active"
       ON "tenant_subscription_periods" ("tenant_id")
       WHERE "period_status" = 'active'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" ADD CONSTRAINT "FK_subscription_periods_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" ADD CONSTRAINT "FK_subscription_periods_plan" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" ADD CONSTRAINT "FK_subscription_periods_billing_record" FOREIGN KEY ("billing_record_id") REFERENCES "tenant_billing_records"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "subscription_period_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "subscription_period_id" uuid NOT NULL,
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
        CONSTRAINT "CHK_subscription_period_event_type" CHECK (
          "event_type" IN (
            'period_created',
            'payment_confirmed',
            'period_activated',
            'period_expired',
            'period_cancelled',
            'early_renewal_promoted',
            'period_backfilled'
          )
        ),
        CONSTRAINT "CHK_subscription_period_event_status" CHECK (
          "new_status" IS NULL
          OR "new_status" IN ('upcoming', 'active', 'expired', 'cancelled')
        ),
        CONSTRAINT "PK_subscription_period_events" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_period_events_period_created" ON "subscription_period_events" ("subscription_period_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_period_events_tenant_created" ON "subscription_period_events" ("tenant_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscription_period_events_idempotency" ON "subscription_period_events" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_events" ADD CONSTRAINT "FK_subscription_period_events_period" FOREIGN KEY ("subscription_period_id") REFERENCES "tenant_subscription_periods"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_events" ADD CONSTRAINT "FK_subscription_period_events_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Nullable usage linkage: new usage gets a period ID after the cutover;
    // historical rows keep NULL and remain readable as legacy history.
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" ADD "subscription_period_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_usage_events_period" ON "tenant_usage_events" ("tenant_id", "subscription_period_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" ADD CONSTRAINT "FK_tenant_usage_events_subscription_period" FOREIGN KEY ("subscription_period_id") REFERENCES "tenant_subscription_periods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" DROP CONSTRAINT "FK_tenant_usage_events_subscription_period"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_tenant_usage_events_period"`);
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" DROP COLUMN "subscription_period_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_events" DROP CONSTRAINT "FK_subscription_period_events_tenant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_events" DROP CONSTRAINT "FK_subscription_period_events_period"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_subscription_period_events_idempotency"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_subscription_period_events_tenant_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_subscription_period_events_period_created"`,
    );
    await queryRunner.query(`DROP TABLE "subscription_period_events"`);
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP CONSTRAINT "FK_subscription_periods_billing_record"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP CONSTRAINT "FK_subscription_periods_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP CONSTRAINT "FK_subscription_periods_tenant"`,
    );
    await queryRunner.query(`DROP INDEX "UQ_subscription_periods_one_active"`);
    await queryRunner.query(
      `DROP INDEX "IDX_subscription_periods_billing_record"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_subscription_periods_status_end"`);
    await queryRunner.query(
      `DROP INDEX "IDX_subscription_periods_tenant_sequence"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_subscription_periods_tenant_status"`,
    );
    await queryRunner.query(`DROP TABLE "tenant_subscription_periods"`);
  }
}
