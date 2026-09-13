import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingIntegrityConstraints1782443500000 implements MigrationInterface {
  name = 'AddBillingIntegrityConstraints1782443500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_tenant_billing_records_invoice_number"
      ON "tenant_billing_records" ("invoice_number")
      WHERE "invoice_number" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_invoice_status"
      CHECK ("invoice_status" IN ('draft', 'issued', 'void'))
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_payment_status"
      CHECK ("payment_status" IN ('unpaid', 'partially_paid', 'paid', 'overdue', 'waived'))
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_period"
      CHECK ("billing_period_end" > "billing_period_start")
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_amounts"
      CHECK (
        "amount_due" >= 0
        AND "amount_paid" >= 0
        AND "amount_paid" <= "amount_due"
        AND "amount_due" = round("amount_due", 2)
        AND "amount_paid" = round("amount_paid", 2)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_paid_amount"
      CHECK ("payment_status" <> 'paid' OR "amount_paid" = "amount_due")
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_currency"
      CHECK ("currency" ~ '^[A-Z]{3}$')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_billing_records" DROP CONSTRAINT "CHK_tenant_billing_records_currency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_billing_records" DROP CONSTRAINT "CHK_tenant_billing_records_paid_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_billing_records" DROP CONSTRAINT "CHK_tenant_billing_records_amounts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_billing_records" DROP CONSTRAINT "CHK_tenant_billing_records_period"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_billing_records" DROP CONSTRAINT "CHK_tenant_billing_records_payment_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_billing_records" DROP CONSTRAINT "CHK_tenant_billing_records_invoice_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_tenant_billing_records_invoice_number"`,
    );
  }
}
