import { MigrationInterface, QueryRunner } from 'typeorm';

// Plan 31 Task 3: billing_account_id FK re-entry. The other team's
// billing_accounts table landed (uuid PK), unblocking the interim noted
// since Plan 25. Nullable FK (history + non-account invoices stay NULL);
// the interim billing_account_ref column is KEPT for now (drop later).
// Backfill matches metadata.selectedPaymentAccountId (written since the
// request-payment page started sending real ids) to existing accounts.
export class BillingAccountId1782446100000 implements MigrationInterface {
  name = 'BillingAccountId1782446100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD COLUMN "billing_account_id" uuid
    `);
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "billing_account_id" = ("metadata"->>'selectedPaymentAccountId')::uuid
      WHERE "metadata" ? 'selectedPaymentAccountId'
        AND ("metadata"->>'selectedPaymentAccountId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        AND EXISTS (
          SELECT 1 FROM "billing_accounts"
          WHERE "id" = ("metadata"->>'selectedPaymentAccountId')::uuid
        )
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "FK_tenant_billing_records_billing_account"
      FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT "FK_tenant_billing_records_billing_account"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP COLUMN "billing_account_id"
    `);
  }
}
