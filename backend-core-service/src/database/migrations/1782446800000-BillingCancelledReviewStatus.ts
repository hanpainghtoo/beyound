import { MigrationInterface, QueryRunner } from 'typeorm';

// Plan 56: tenant-withdrawn invoices get their own review status.
// `reject` stays admin-only (platform team decision); `cancelled` means the
// workspace tenant withdrew the request. Both are dead invoices that free
// the billing month in overlap checks. No data rewrite — only the CHECK
// whitelist widens.
export class BillingCancelledReviewStatus1782446800000 implements MigrationInterface {
  name = 'BillingCancelledReviewStatus1782446800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT IF EXISTS "CHK_tenant_billing_records_review_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_review_status"
      CHECK ("review_status" IN ('in_review', 'confirm', 'reject', 'cancelled'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback requires no `cancelled` rows (flip them to `reject` first).
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT IF EXISTS "CHK_tenant_billing_records_review_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_review_status"
      CHECK ("review_status" IN ('in_review', 'confirm', 'reject'))
    `);
  }
}
