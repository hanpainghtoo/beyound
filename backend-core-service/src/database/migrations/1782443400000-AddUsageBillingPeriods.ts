import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsageBillingPeriods1782443400000 implements MigrationInterface {
  name = 'AddUsageBillingPeriods1782443400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_usage_events"
      ADD "billing_period_start" date,
      ADD "billing_period_end" date
    `);
    await queryRunner.query(`
      UPDATE "tenant_usage_events"
      SET
        "billing_period_start" = date_trunc('month', "occurred_at" AT TIME ZONE 'UTC')::date,
        "billing_period_end" = (date_trunc('month', "occurred_at" AT TIME ZONE 'UTC') + interval '1 month')::date
      WHERE "billing_period_start" IS NULL OR "billing_period_end" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_usage_events"
      ALTER COLUMN "billing_period_start" SET NOT NULL,
      ALTER COLUMN "billing_period_end" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tenant_usage_events_tenant_period_type"
      ON "tenant_usage_events" ("tenant_id", "billing_period_start", "billing_period_end", "usage_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_tenant_usage_events_tenant_period_type"`,
    );
    await queryRunner.query(`
      ALTER TABLE "tenant_usage_events"
      DROP COLUMN "billing_period_end",
      DROP COLUMN "billing_period_start"
    `);
  }
}
