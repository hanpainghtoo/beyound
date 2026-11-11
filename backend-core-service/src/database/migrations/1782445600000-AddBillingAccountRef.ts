import { MigrationInterface, QueryRunner } from 'typeorm';

// Plan 25 follow-up (billing-account re-entry, interim step): the billing
// account table belongs to another developer and is not available yet, so
// its PK type and granularity (per-method vs free list) are unknown. Capture
// the reference as a free-text `billing_account_ref` now so payment-account
// info stops leaking into `notes`/metadata. When their table lands, the
// recorded re-entry point applies: nullable `billing_account_id` FK add ->
// backfill matched from these refs -> FK validate. The ref column is
// deliberately NOT typed as uuid/bigint — guessing the PK would force a
// second migration when it is wrong.
export class AddBillingAccountRef1782445600000 implements MigrationInterface {
  name = 'AddBillingAccountRef1782445600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD COLUMN "billing_account_ref" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP COLUMN "billing_account_ref"
    `);
  }
}
