import { MigrationInterface, QueryRunner } from 'typeorm';

// Plan 25, Migration B (destructive): full cutover is complete — every
// reader/writer uses the review axis. Drops the retired dual-axis columns.
// Requires: backfilled invoice_no/review_status on all rows (Migration A)
// + code switch deployed. Down restores structure, not data.
export class DropRetiredBillingStatusColumns1782445400000 implements MigrationInterface {
  name = 'DropRetiredBillingStatusColumns1782445400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Guard: refuse to drop while any row lacks the new state.
    const unmigrated: Array<{ count: string }> = await queryRunner.query(`
      SELECT COUNT(*) AS "count" FROM "tenant_billing_records"
      WHERE "invoice_no" IS NULL OR "review_status" IS NULL
    `);
    if (Number(unmigrated?.[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot drop retired billing columns: rows without invoice_no/review_status still exist.',
      );
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_tenant_billing_records_invoice_number"`,
    );
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT "CHK_tenant_billing_records_payment_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT "CHK_tenant_billing_records_invoice_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT "CHK_tenant_billing_records_paid_amount"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP COLUMN "invoice_number",
      DROP COLUMN "invoice_status",
      DROP COLUMN "payment_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_review_status"
      CHECK ("review_status" IN ('in_review', 'approve', 'reject'))
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_approved_amount"
      CHECK ("review_status" <> 'approve' OR "amount_paid" = "amount_due")
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ALTER COLUMN "invoice_no" SET NOT NULL,
      ALTER COLUMN "review_status" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_tenant_billing_records_invoice_no"
      ON "tenant_billing_records" ("invoice_no")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_tenant_billing_records_invoice_no"`,
    );
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ALTER COLUMN "invoice_no" DROP NOT NULL,
      ALTER COLUMN "review_status" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT "CHK_tenant_billing_records_approved_amount"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT "CHK_tenant_billing_records_review_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD COLUMN "invoice_number" character varying,
      ADD COLUMN "invoice_status" character varying NOT NULL DEFAULT 'draft',
      ADD COLUMN "payment_status" character varying NOT NULL DEFAULT 'unpaid'
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_invoice_status"
      CHECK ("invoice_status" IN ('draft', 'issued', 'void'))
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_payment_status"
      CHECK ("payment_status" IN ('unpaid', 'paid', 'overdue'))
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_paid_amount"
      CHECK ("payment_status" <> 'paid' OR "amount_paid" = "amount_due")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_tenant_billing_records_invoice_number"
      ON "tenant_billing_records" ("invoice_number")
      WHERE "invoice_number" IS NOT NULL
    `);
  }
}
