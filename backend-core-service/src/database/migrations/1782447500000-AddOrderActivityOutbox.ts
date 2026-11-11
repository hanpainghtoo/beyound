import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderActivityOutbox1782447500000 implements MigrationInterface {
  name = 'AddOrderActivityOutbox1782447500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "domain_events" ADD COLUMN IF NOT EXISTS "processed_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_domain_events_unprocessed_order" ON "domain_events" ("created_at") WHERE "processed_at" IS NULL AND "event_type" IN ('order.placed','order.payment_submitted','order.confirmed','order.rejected','order.cancelled','order.expired')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_domain_events_unprocessed_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "domain_events" DROP COLUMN IF EXISTS "processed_at"`,
    );
  }
}
