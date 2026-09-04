import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantBillingRecords1782441800000 implements MigrationInterface {
  name = 'AddTenantBillingRecords1782441800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tenant_billing_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "subscription_plan_id" uuid, "invoice_number" character varying, "billing_period_start" date NOT NULL, "billing_period_end" date NOT NULL, "invoice_status" character varying NOT NULL DEFAULT 'draft', "payment_status" character varying NOT NULL DEFAULT 'unpaid', "amount_due" numeric(12,2) NOT NULL DEFAULT '0', "amount_paid" numeric(12,2) NOT NULL DEFAULT '0', "currency" character varying NOT NULL DEFAULT 'MMK', "due_date" date, "paid_at" TIMESTAMP, "notes" text, "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_tenant_billing_records" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_billing_records_tenant_period" ON "tenant_billing_records" ("tenant_id", "billing_period_start", "billing_period_end")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_billing_records_invoice_status" ON "tenant_billing_records" ("invoice_status", "payment_status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_billing_records" ADD CONSTRAINT "FK_tenant_billing_records_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_billing_records" ADD CONSTRAINT "FK_tenant_billing_records_subscription_plan" FOREIGN KEY ("subscription_plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_billing_records" DROP CONSTRAINT "FK_tenant_billing_records_subscription_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_billing_records" DROP CONSTRAINT "FK_tenant_billing_records_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_tenant_billing_records_invoice_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_tenant_billing_records_tenant_period"`,
    );
    await queryRunner.query(`DROP TABLE "tenant_billing_records"`);
  }
}
