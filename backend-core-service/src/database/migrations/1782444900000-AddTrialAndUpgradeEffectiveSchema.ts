import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan 14 Phase 1 (tasks 1.1–1.4, 1.8): trial-period and upgrade-effective
 * schema. Additive only — existing rows are never rewritten:
 *
 * - `tenant_subscription_periods.payment_status` gains `not_required` (trial
 *   only; never a fake paid invoice).
 * - `tenant_subscription_periods.converted_to_period_id` /
 *   `converted_from_period_id` link a trial and its paid conversion pair.
 * - The single one-active invariant is split into one-active-paid +
 *   one-active-trial so a trial and a paid conversion pair can coexist while
 *   the paid period awaits admin activation.
 * - `tenant_usage_events.upgrade_revision_id` records the upgrade revision
 *   that authorized usage at/after `upgrade_effective_at`; historical rows
 *   keep NULL.
 * - New period event types for the trial lifecycle and `upgrade_effective_applied`.
 *
 * Preflight: duplicate active paid periods and duplicate active trial periods
 * fail closed before the new indexes are created.
 */
export class AddTrialAndUpgradeEffectiveSchema1782444900000 implements MigrationInterface {
  name = 'AddTrialAndUpgradeEffectiveSchema1782444900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Preflight: the split one-active invariants must already hold.
    const duplicatePaid = await queryRunner.query(
      `SELECT "tenant_id", COUNT(*) AS "count"
         FROM "tenant_subscription_periods"
        WHERE "period_type" = 'paid' AND "period_status" = 'active'
        GROUP BY "tenant_id"
       HAVING COUNT(*) > 1
        LIMIT 20`,
    );
    if (Array.isArray(duplicatePaid) && duplicatePaid.length > 0) {
      throw new Error(
        `reconcile duplicate active paid subscription periods first (tenants: ${duplicatePaid
          .map((row: { tenant_id?: string }) => row?.tenant_id ?? '?')
          .join(', ')})`,
      );
    }
    const duplicateTrial = await queryRunner.query(
      `SELECT "tenant_id", COUNT(*) AS "count"
         FROM "tenant_subscription_periods"
        WHERE "period_type" = 'trial' AND "period_status" = 'active'
        GROUP BY "tenant_id"
       HAVING COUNT(*) > 1
        LIMIT 20`,
    );
    if (Array.isArray(duplicateTrial) && duplicateTrial.length > 0) {
      throw new Error(
        `reconcile duplicate active trial subscription periods first (tenants: ${duplicateTrial
          .map((row: { tenant_id?: string }) => row?.tenant_id ?? '?')
          .join(', ')})`,
      );
    }

    // 1.1 — payment status gains `not_required` for trial periods.
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods"
         DROP CONSTRAINT "CHK_subscription_period_payment_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods"
         ADD CONSTRAINT "CHK_subscription_period_payment_status"
         CHECK ("payment_status" IN ('pending', 'paid', 'failed', 'refunded', 'not_required'))`,
    );

    // 1.2 — trial-to-paid conversion linkage (nullable, additive).
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods"
         ADD "converted_to_period_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods"
         ADD "converted_from_period_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_periods_converted_to"
         ON "tenant_subscription_periods" ("converted_to_period_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_periods_converted_from"
         ON "tenant_subscription_periods" ("converted_from_period_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" ADD CONSTRAINT "FK_subscription_periods_converted_to" FOREIGN KEY ("converted_to_period_id") REFERENCES "tenant_subscription_periods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" ADD CONSTRAINT "FK_subscription_periods_converted_from" FOREIGN KEY ("converted_from_period_id") REFERENCES "tenant_subscription_periods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // 1.3 — split one-active invariant into paid + trial.
    await queryRunner.query(`DROP INDEX "UQ_subscription_periods_one_active"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscription_periods_one_active_paid"
         ON "tenant_subscription_periods" ("tenant_id")
         WHERE "period_type" = 'paid' AND "period_status" = 'active'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscription_periods_one_active_trial"
         ON "tenant_subscription_periods" ("tenant_id")
         WHERE "period_type" = 'trial' AND "period_status" = 'active'`,
    );

    // 1.8 — usage-boundary linkage (nullable, additive; historical rows NULL).
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" ADD "upgrade_revision_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_usage_events_upgrade_revision"
         ON "tenant_usage_events" ("tenant_id", "upgrade_revision_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" ADD CONSTRAINT "FK_tenant_usage_events_upgrade_revision" FOREIGN KEY ("upgrade_revision_id") REFERENCES "subscription_period_upgrade_revisions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // 1.4 — trial lifecycle + upgrade-effective event types.
    await queryRunner.query(
      `ALTER TABLE "subscription_period_events"
         DROP CONSTRAINT "CHK_subscription_period_event_type"`,
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription_period_events"
         DROP CONSTRAINT "CHK_subscription_period_event_type"`,
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
             'upgrade_revision_created'
           )
         )`,
    );

    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" DROP CONSTRAINT "FK_tenant_usage_events_upgrade_revision"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_tenant_usage_events_upgrade_revision"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" DROP COLUMN "upgrade_revision_id"`,
    );

    await queryRunner.query(
      `DROP INDEX "UQ_subscription_periods_one_active_trial"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_subscription_periods_one_active_paid"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscription_periods_one_active"
         ON "tenant_subscription_periods" ("tenant_id")
         WHERE "period_status" = 'active'`,
    );

    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP CONSTRAINT "FK_subscription_periods_converted_from"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP CONSTRAINT "FK_subscription_periods_converted_to"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_subscription_periods_converted_from"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_subscription_periods_converted_to"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP COLUMN "converted_from_period_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP COLUMN "converted_to_period_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods"
         DROP CONSTRAINT "CHK_subscription_period_payment_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods"
         ADD CONSTRAINT "CHK_subscription_period_payment_status"
         CHECK ("payment_status" IN ('pending', 'paid', 'failed', 'refunded'))`,
    );
  }
}
