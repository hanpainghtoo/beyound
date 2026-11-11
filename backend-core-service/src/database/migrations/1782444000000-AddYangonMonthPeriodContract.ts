import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan 9 Phase 2 (tasks 2.2, 2.3): add the Yangon calendar-month contract to
 * tenant subscription periods.
 *
 * Additive only:
 * - `month_start_at` / `month_end_at` — the authoritative Yangon calendar
 *   month window (half-open `[monthStartAt, monthEndAt)`).
 * - `start_option` — persisted first-purchase / queueing choice
 *   (`current_month | next_month | scheduled_prepaid`), immutable after
 *   payment confirmation.
 *
 * Existing legacy rows keep NULL for the new columns; the forward-only cutover
 * (Phase 2 task 2.7) transitions them without rewriting their dates.
 */
export class AddYangonMonthPeriodContract1782444000000 implements MigrationInterface {
  name = 'AddYangonMonthPeriodContract1782444000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" ADD "month_start_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" ADD "month_end_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" ADD "start_option" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" ADD CONSTRAINT "CHK_subscription_period_start_option" CHECK ("start_option" IN ('current_month', 'next_month', 'scheduled_prepaid'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" ADD CONSTRAINT "CHK_subscription_period_month_dates" CHECK ("month_start_at" IS NULL OR "month_end_at" IS NULL OR "month_end_at" > "month_start_at")`,
    );
    // Scheduler (Phase 8) scans upcoming periods ordered by their Yangon month
    // end; the partial index keeps that scan narrow.
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_periods_upcoming_month_end" ON "tenant_subscription_periods" ("month_end_at") WHERE "period_status" = 'upcoming'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_subscription_periods_upcoming_month_end"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP CONSTRAINT "CHK_subscription_period_month_dates"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP CONSTRAINT "CHK_subscription_period_start_option"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP COLUMN "start_option"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP COLUMN "month_end_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP COLUMN "month_start_at"`,
    );
  }
}
