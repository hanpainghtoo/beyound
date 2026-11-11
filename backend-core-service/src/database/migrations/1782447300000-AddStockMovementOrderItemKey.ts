import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStockMovementOrderItemKey1782447300000 implements MigrationInterface {
  name = 'AddStockMovementOrderItemKey1782447300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN IF NOT EXISTS "order_item_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD CONSTRAINT "FK_stock_movements_order_item"
      FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_stock_movements_order_item_reason"
      ON "stock_movements" ("order_item_id", "reason")
      WHERE "order_item_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_stock_movements_order_item_reason"',
    );
    await queryRunner.query(
      'ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "FK_stock_movements_order_item"',
    );
    await queryRunner.query(
      'ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "order_item_id"',
    );
  }
}
