import { MigrationInterface, QueryRunner } from 'typeorm';

// Billing proof-file fix (2026-09-09): `payment_proof_file_id` was declared
// `uuid` in Migration A on the assumption that media file IDs are UUIDs.
// The file service issues opaque string IDs (`file-<ts>-<rand>`), so every
// real payment-proof submission died with
// `invalid input syntax for type uuid` at save time (500). Retype to
// varchar; the column carries no FK/relation. Dev pre-check: 26 rows, 0
// non-null values — nothing to convert.
export class ProofFileIdVarchar1782445900000 implements MigrationInterface {
  name = 'ProofFileIdVarchar1782445900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ALTER COLUMN "payment_proof_file_id" TYPE character varying
      USING "payment_proof_file_id"::text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ALTER COLUMN "payment_proof_file_id" TYPE uuid
      USING "payment_proof_file_id"::uuid
    `);
  }
}
