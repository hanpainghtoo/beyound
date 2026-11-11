import { MigrationInterface, QueryRunner } from 'typeorm';

// Plan 30 wrap-up R3: track which tenant user requested each invoice.
// Nullable real FK to tenant_users with SET NULL (user deletion never blocks
// or orphans billing history). No backfill possible — historical rows stay
// NULL. Manual/admin-created rows also stay NULL (no UI entry there).
export class BillingRequestedBy1782446000000 implements MigrationInterface {
  name = 'BillingRequestedBy1782446000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD COLUMN "requested_by" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "FK_tenant_billing_records_requested_by"
      FOREIGN KEY ("requested_by") REFERENCES "tenant_users"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT "FK_tenant_billing_records_requested_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP COLUMN "requested_by"
    `);
  }
}
