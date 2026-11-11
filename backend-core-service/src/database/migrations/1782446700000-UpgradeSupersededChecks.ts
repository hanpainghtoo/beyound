import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan 54 follow-up: widen the upgrade status/event CHECK constraints for
 * chained upgrades.
 *
 * The chaining migration (`1782446600000-UpgradeChaining`) swapped the unique
 * index but left `CHK_subscription_upgrade_status` enumerating only the
 * pre-chain statuses, so approving a second upgrade failed when superseding
 * the first (`new row violates check constraint`). The
 * `CHK_subscription_period_event_type` likewise lacked the new
 * `upgrade_superseded` event and would have failed one statement later.
 *
 * Both drops are `IF EXISTS` (matching `BillingCancelledReviewStatus`). A
 * database that was previously maintained with `DB_SYNCHRONIZE=true` never
 * had these constraints at all: TypeORM's `synchronize` reconciles the schema
 * against entity metadata, and CHECK constraints cannot be expressed there, so
 * it drops them. An unconditional `DROP CONSTRAINT` then aborted the entire run
 * with `42704 undefined_object` and rolled back every pending migration. The
 * subsequent `ADD CONSTRAINT` still installs the widened definition, so the end
 * state is correct either way.
 */
export class UpgradeSupersededChecks1782446700000 implements MigrationInterface {
  name = 'UpgradeSupersededChecks1782446700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions"
         DROP CONSTRAINT IF EXISTS "CHK_subscription_upgrade_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions"
         ADD CONSTRAINT "CHK_subscription_upgrade_status"
         CHECK (
           "upgrade_status" IN (
             'requested',
             'pending_payment',
             'pending_approval',
             'approved',
             'rejected',
             'stale',
             'cancelled',
             'superseded'
           )
         )`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_events"
         DROP CONSTRAINT IF EXISTS "CHK_subscription_period_event_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_events"
         ADD CONSTRAINT "CHK_subscription_period_event_type"
         CHECK (
           "event_type" IN (
             'period_created',
             'payment_confirmed',
             'period_activated',
             'period_expired',
             'period_cancelled',
             'early_renewal_promoted',
             'period_backfilled',
             'period_admin_activation_approved',
             'upgrade_requested',
             'upgrade_payment_confirmed',
             'upgrade_approved',
             'upgrade_rejected',
             'upgrade_stale',
             'upgrade_cancelled',
             'upgrade_revision_created',
             'upgrade_superseded',
             'trial_period_created',
             'trial_period_expired',
             'trial_conversion_requested',
             'trial_conversion_payment_confirmed',
             'trial_conversion_approved',
             'trial_period_closed_on_conversion',
             'trial_conversion_stale',
             'upgrade_effective_applied'
           )
         )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best-effort only: restoring the pre-chain checks fails when
    // `superseded` rows or events exist — tidy those manually first.
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions"
         DROP CONSTRAINT IF EXISTS "CHK_subscription_upgrade_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions"
         ADD CONSTRAINT "CHK_subscription_upgrade_status"
         CHECK (
           "upgrade_status" IN (
             'requested',
             'pending_payment',
             'pending_approval',
             'approved',
             'rejected',
             'stale',
             'cancelled'
           )
         )`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_events"
         DROP CONSTRAINT IF EXISTS "CHK_subscription_period_event_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_events"
         ADD CONSTRAINT "CHK_subscription_period_event_type"
         CHECK (
           "event_type" IN (
             'period_created',
             'payment_confirmed',
             'period_activated',
             'period_expired',
             'period_cancelled',
             'early_renewal_promoted',
             'period_backfilled',
             'period_admin_activation_approved',
             'upgrade_requested',
             'upgrade_payment_confirmed',
             'upgrade_approved',
             'upgrade_rejected',
             'upgrade_stale',
             'upgrade_cancelled',
             'upgrade_revision_created',
             'trial_period_created',
             'trial_period_expired',
             'trial_conversion_requested',
             'trial_conversion_payment_confirmed',
             'trial_conversion_approved',
             'trial_period_closed_on_conversion',
             'trial_conversion_stale',
             'upgrade_effective_applied'
           )
         )`,
    );
  }
}
