import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 10 hardening: each top-up invoice may fund at most one purchase.
 * Nullable legacy links remain allowed, and repeated purchases still work
 * because each purchase receives its own billing record.
 */
export class AddUniqueAddOnBillingRecordLink1782444600000 implements MigrationInterface {
  name = 'AddUniqueAddOnBillingRecordLink1782444600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates = (await queryRunner.query(
      `SELECT "billing_record_id", COUNT(*)::int AS "count" FROM "tenant_subscription_add_on_purchases" WHERE "billing_record_id" IS NOT NULL GROUP BY "billing_record_id" HAVING COUNT(*) > 1`,
    )) as Array<{ billing_record_id: string; count: number }>;

    if (duplicates.length > 0) {
      const summary = duplicates
        .map((row) => `${row.billing_record_id} (${row.count} rows)`)
        .join(', ');
      throw new Error(
        `Cannot add unique top-up billing link; reconcile duplicate billing_record_id rows first: ${summary}`,
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_subscription_add_on_purchases_billing_record" ON "tenant_subscription_add_on_purchases" ("billing_record_id") WHERE "billing_record_id" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_subscription_add_on_purchases_billing_record"`,
    );
  }
}
