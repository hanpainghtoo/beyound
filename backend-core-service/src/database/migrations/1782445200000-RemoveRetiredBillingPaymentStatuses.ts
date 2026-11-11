import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveRetiredBillingPaymentStatuses1782445200000 implements MigrationInterface {
  name = 'RemoveRetiredBillingPaymentStatuses1782445200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Defensive data fix (Plan 24): no writer produces these statuses
    // anymore — full-payment-only business. Map to the closest live status
    // so the narrowed CHECK below holds on every environment.
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "payment_status" = 'unpaid'
      WHERE "payment_status" = 'partially_paid'
    `);
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "payment_status" = 'paid'
      WHERE "payment_status" = 'waived'
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT "CHK_tenant_billing_records_payment_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_payment_status"
      CHECK ("payment_status" IN ('unpaid', 'paid', 'overdue'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT "CHK_tenant_billing_records_payment_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_payment_status"
      CHECK ("payment_status" IN ('unpaid', 'partially_paid', 'paid', 'overdue', 'waived'))
    `);
    // Note: data mapped in up() is not restored (no record of prior values).
  }
}
