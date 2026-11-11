import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan 36: remove the commercial API quota columns.
 *
 * Business direction is no API limits and no API usage tracking, so
 * `subscription_plans.api_limit` and `tenants.custom_api_limit` are dropped.
 * Historical `tenant_usage_events` rows with `usage_type = 'api_request'`
 * are intentionally left untouched (read-only history).
 *
 * The `api_requests` add-on component CHECK constraints are deliberately NOT
 * narrowed here: legacy catalog/purchase rows may still carry the value and
 * narrowing the constraint would fail the migration on such databases. The
 * application layer rejects new `api_requests` products (validation) and
 * purchases (purchase guard); the narrowed CHECK is a follow-up once data is
 * confirmed clean. The constraints therefore remain a permissive superset.
 *
 * Every structural step is existence-guarded so fresh installs and
 * partially-migrated databases converge to the same shape.
 */
export class RemoveApiQuotaColumns1782446300000 implements MigrationInterface {
  name = 'RemoveApiQuotaColumns1782446300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('subscription_plans', 'api_limit')) {
      await queryRunner.query(
        `ALTER TABLE "subscription_plans" DROP COLUMN "api_limit"`,
      );
    }
    if (await queryRunner.hasColumn('tenants', 'custom_api_limit')) {
      await queryRunner.query(
        `ALTER TABLE "tenants" DROP COLUMN "custom_api_limit"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('tenants', 'custom_api_limit'))) {
      await queryRunner.query(
        `ALTER TABLE "tenants" ADD "custom_api_limit" integer`,
      );
    }
    if (!(await queryRunner.hasColumn('subscription_plans', 'api_limit'))) {
      await queryRunner.query(
        `ALTER TABLE "subscription_plans" ADD "api_limit" integer`,
      );
    }
  }
}
