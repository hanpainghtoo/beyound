import { MigrationInterface, QueryRunner } from 'typeorm';

// Plan 26 (billing dueDate removal, full scope): the prepaid model never
// used `due_date` — no frontend entrance, no manual-create form, all
// tenant-created rows NULL, and activation is gated by `confirm`, not by
// date. Drop the column together with the reminder/overdue/suspend
// machinery built on it (service + controller + frontends removed alongside).
export class DropBillingDueDate1782445700000 implements MigrationInterface {
  name = 'DropBillingDueDate1782445700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP COLUMN "due_date"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD COLUMN "due_date" date
    `);
  }
}
