import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 8: a confirmed billing record may link to exactly one subscription
 * period. The partial index preserves nullable legacy links while preventing
 * concurrent payment retries from creating duplicate period rows.
 */
export class AddUniquePeriodBillingRecordLink1782444500000 implements MigrationInterface {
  name = 'AddUniquePeriodBillingRecordLink1782444500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates = (await queryRunner.query(
      `SELECT "billing_record_id", COUNT(*)::int AS "count" FROM "tenant_subscription_periods" WHERE "billing_record_id" IS NOT NULL GROUP BY "billing_record_id" HAVING COUNT(*) > 1`,
    )) as Array<{ billing_record_id: string; count: number }>;

    if (duplicates.length > 0) {
      const summary = duplicates
        .map((row) => `${row.billing_record_id} (${row.count} rows)`)
        .join(', ');
      throw new Error(
        `Cannot add unique subscription-period billing link; reconcile duplicate billing_record_id rows first: ${summary}`,
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_subscription_periods_billing_record" ON "tenant_subscription_periods" ("billing_record_id") WHERE "billing_record_id" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_subscription_periods_billing_record"`,
    );
  }
}
