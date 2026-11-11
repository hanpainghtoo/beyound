import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan 53: allow unlimited channel / storage / seat capacity on plans.
 *
 * `subscription_plans.max_channels`, `max_agents`, and `storage_limit_gb`
 * become nullable. `NULL` means unlimited (matching the existing inbound /
 * outbound message-limit convention); `0` keeps meaning blocked. Existing
 * rows keep their finite numbers — no backfill. The application layer
 * (snapshot builder, entitlement resolver, enforcement) already treats
 * `null` as unlimited for these dimensions once the columns permit it.
 *
 * Every structural step is existence-guarded so fresh installs and
 * partially-migrated databases converge to the same shape.
 */
export class AllowUnlimitedCapacityDims1782446500000 implements MigrationInterface {
  name = 'AllowUnlimitedCapacityDims1782446500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ALTER COLUMN "max_channels" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ALTER COLUMN "max_agents" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ALTER COLUMN "storage_limit_gb" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "subscription_plans" SET "max_channels" = 0 WHERE "max_channels" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "subscription_plans" SET "max_agents" = 0 WHERE "max_agents" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "subscription_plans" SET "storage_limit_gb" = 0 WHERE "storage_limit_gb" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ALTER COLUMN "max_channels" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ALTER COLUMN "max_agents" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ALTER COLUMN "storage_limit_gb" SET NOT NULL`,
    );
  }
}
