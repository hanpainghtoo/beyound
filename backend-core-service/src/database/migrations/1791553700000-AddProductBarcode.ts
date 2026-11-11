import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-tenant product barcode.
 *
 * Nullable because existing products predate barcodes, and unique per tenant
 * rather than globally so two tenants may legitimately stock the same EAN.
 * A partial index keeps the constraint cheap and leaves multiple NULL rows
 * legal, which a plain UNIQUE would not.
 */
export class AddProductBarcode1791553700000 implements MigrationInterface {
  name = 'AddProductBarcode1791553700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "barcode" varchar`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_products_tenant_barcode"
         ON "products" ("tenant_id", "barcode")
         WHERE "barcode" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_products_tenant_barcode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "barcode"`,
    );
  }
}
