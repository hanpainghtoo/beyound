import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan 54: chained period upgrades.
 *
 * Replaces the one-non-cancelled-upgrade-per-period rule
 * (`UQ_subscription_upgrade_revisions_period ... WHERE upgrade_status <>
 * 'cancelled'`) with a pending-only singularity rule: at most one IN-FLIGHT
 * revision (`requested`, `pending_payment`, `pending_approval`) per
 * subscription period. Terminal states (`approved`, `rejected`, `stale`,
 * `cancelled`, `superseded`) never block a new upgrade request, so tenants
 * may upgrade repeatedly within one paid period. Approving a newer revision
 * marks the previously approved one `superseded` at the application layer.
 */
export class UpgradeChaining1782446600000 implements MigrationInterface {
  name = 'UpgradeChaining1782446600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_subscription_upgrade_revisions_period"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_upgrade_revisions_one_pending"
         ON "subscription_period_upgrade_revisions" ("subscription_period_id")
         WHERE "upgrade_status" IN ('requested', 'pending_payment', 'pending_approval')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best-effort only: restoring the single-slot rule fails when chained
    // (multiple non-cancelled) revisions exist — tidy those manually first.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_upgrade_revisions_one_pending"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscription_upgrade_revisions_period"
         ON "subscription_period_upgrade_revisions" ("subscription_period_id")
         WHERE "upgrade_status" <> 'cancelled'`,
    );
  }
}
