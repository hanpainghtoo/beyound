import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan 51 Task 2: customers no longer always come from a channel
 * conversation (walk-in / manual customers), so `customers.channel_id`
 * becomes nullable.
 *
 * Every structural step is existence-guarded so fresh installs and
 * partially-migrated databases converge to the same shape.
 */
export class OptionalCustomerChannel1782446400000 implements MigrationInterface {
  name = 'OptionalCustomerChannel1782446400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('customers', 'channel_id'))) {
      return;
    }
    const columns: Array<{ is_nullable: string }> = await queryRunner.query(
      `SELECT "is_nullable" FROM "information_schema"."columns" WHERE "table_name" = 'customers' AND "column_name" = 'channel_id'`,
    );
    if (columns[0]?.is_nullable === 'NO') {
      await queryRunner.query(
        `ALTER TABLE "customers" ALTER COLUMN "channel_id" DROP NOT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('customers', 'channel_id'))) {
      return;
    }
    // Re-adding NOT NULL is only safe when no NULL rows exist; otherwise
    // the down migration intentionally leaves the column nullable so
    // data created while the constraint was relaxed is preserved.
    const [{ count }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT COUNT(*) AS "count" FROM "customers" WHERE "channel_id" IS NULL`,
    );
    if (count !== '0') {
      return;
    }
    const columns: Array<{ is_nullable: string }> = await queryRunner.query(
      `SELECT "is_nullable" FROM "information_schema"."columns" WHERE "table_name" = 'customers' AND "column_name" = 'channel_id'`,
    );
    if (columns[0]?.is_nullable === 'YES') {
      await queryRunner.query(
        `ALTER TABLE "customers" ALTER COLUMN "channel_id" SET NOT NULL`,
      );
    }
  }
}
