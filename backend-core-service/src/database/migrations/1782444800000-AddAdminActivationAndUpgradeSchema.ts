import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan 13 Phase 1 (tasks 1.1–1.9): administrative approval and upgrade schema.
 *
 * Additive only — existing rows are never rewritten:
 * - `tenant_subscription_periods.admin_activation_status` defaults to
 *   `approved` so already-operational tenants stay operational during rollout;
 *   newly confirmed payments set `pending` and require a Platform Admin action
 *   (Phase 2). `revoked` is reserved for a future decision.
 * - `admin_activated_at` / `admin_activated_by` / `admin_activation_reason`
 *   record the approving actor and time.
 * - `subscription_period_upgrade_revisions` holds the immutable previous and
 *   target plan snapshots, the effective boundary, and the eligible
 *   inbound/outbound/API carryover for the one-upgrade-per-current-period rule.
 * - New period event types for admin approval and the upgrade lifecycle.
 *
 * Preflight: the migration fails closed when duplicate active periods already
 * exist (the one-active invariant must hold before the new approval state is
 * layered on).
 */
export class AddAdminActivationAndUpgradeSchema1782444800000 implements MigrationInterface {
  name = 'AddAdminActivationAndUpgradeSchema1782444800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Preflight: one active period per tenant must already hold.
    const duplicateActive = await queryRunner.query(
      `SELECT "tenant_id", COUNT(*) AS "count"
         FROM "tenant_subscription_periods"
        WHERE "period_status" = 'active'
        GROUP BY "tenant_id"
       HAVING COUNT(*) > 1
        LIMIT 20`,
    );
    if (Array.isArray(duplicateActive) && duplicateActive.length > 0) {
      throw new Error(
        `reconcile duplicate active subscription periods first (tenants: ${duplicateActive
          .map((row: { tenant_id?: string }) => row?.tenant_id ?? '?')
          .join(', ')})`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods"
         ADD "admin_activation_status" character varying(40) NOT NULL DEFAULT 'approved'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods"
         ADD CONSTRAINT "CHK_subscription_period_admin_activation"
         CHECK ("admin_activation_status" IN ('pending', 'approved', 'revoked'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods"
         ADD "admin_activated_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods"
         ADD "admin_activated_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods"
         ADD "admin_activation_reason" character varying(240)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_periods_tenant_admin_activation"
         ON "tenant_subscription_periods" ("tenant_id", "admin_activation_status")`,
    );

    await queryRunner.query(
      `CREATE TABLE "subscription_period_upgrade_revisions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "subscription_period_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "billing_record_id" uuid,
        "previous_plan_id" uuid NOT NULL,
        "upgraded_plan_id" uuid NOT NULL,
        "previous_plan_snapshot" jsonb NOT NULL,
        "upgraded_plan_snapshot" jsonb NOT NULL,
        "upgrade_status" character varying(40) NOT NULL DEFAULT 'requested',
        "upgrade_requested_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "upgrade_effective_at" TIMESTAMP WITH TIME ZONE,
        "carryover" jsonb NOT NULL DEFAULT '{}',
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "approved_by" uuid,
        "rejection_reason" character varying(240),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_subscription_upgrade_status" CHECK (
          "upgrade_status" IN (
            'requested',
            'pending_payment',
            'pending_approval',
            'approved',
            'rejected',
            'stale',
            'cancelled'
          )
        ),
        CONSTRAINT "PK_subscription_period_upgrade_revisions" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_upgrade_revisions_period_created"
         ON "subscription_period_upgrade_revisions" ("subscription_period_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_upgrade_revisions_tenant_created"
         ON "subscription_period_upgrade_revisions" ("tenant_id", "created_at")`,
    );
    // One non-cancelled upgrade per current period (Phase 2 request path writes
    // this table; terminal rejected/stale rows keep the slot occupied).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscription_upgrade_revisions_period"
         ON "subscription_period_upgrade_revisions" ("subscription_period_id")
         WHERE "upgrade_status" <> 'cancelled'`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions" ADD CONSTRAINT "FK_subscription_upgrade_revisions_period" FOREIGN KEY ("subscription_period_id") REFERENCES "tenant_subscription_periods"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions" ADD CONSTRAINT "FK_subscription_upgrade_revisions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions" ADD CONSTRAINT "FK_subscription_upgrade_revisions_previous_plan" FOREIGN KEY ("previous_plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions" ADD CONSTRAINT "FK_subscription_upgrade_revisions_upgraded_plan" FOREIGN KEY ("upgraded_plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions" ADD CONSTRAINT "FK_subscription_upgrade_revisions_billing_record" FOREIGN KEY ("billing_record_id") REFERENCES "tenant_billing_records"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // Plan 13 Phase 1: subscription plan type and trial/business configuration.
    await queryRunner.query(
      `ALTER TABLE "subscription_plans"
         ADD "plan_type" character varying(20) NOT NULL DEFAULT 'business'`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans"
         ADD CONSTRAINT "CHK_subscription_plan_type" CHECK ("plan_type" IN ('business', 'trial'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans"
         ADD "requestable" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans"
         ADD "renewable" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans"
         ADD "top_up_allowed" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans"
         ADD "auto_approve" boolean NOT NULL DEFAULT false`,
    );

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
             'period_backfilled'
           )
         )`,
    );

    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP CONSTRAINT "CHK_subscription_plan_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN "auto_approve"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN "top_up_allowed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN "renewable"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN "requestable"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN "plan_type"`,
    );

    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions" DROP CONSTRAINT "FK_subscription_upgrade_revisions_billing_record"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions" DROP CONSTRAINT "FK_subscription_upgrade_revisions_upgraded_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions" DROP CONSTRAINT "FK_subscription_upgrade_revisions_previous_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions" DROP CONSTRAINT "FK_subscription_upgrade_revisions_tenant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_period_upgrade_revisions" DROP CONSTRAINT "FK_subscription_upgrade_revisions_period"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_subscription_upgrade_revisions_period"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_subscription_upgrade_revisions_tenant_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_subscription_upgrade_revisions_period_created"`,
    );
    await queryRunner.query(
      `DROP TABLE "subscription_period_upgrade_revisions"`,
    );

    await queryRunner.query(
      `DROP INDEX "IDX_subscription_periods_tenant_admin_activation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP CONSTRAINT "CHK_subscription_period_admin_activation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP COLUMN "admin_activation_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP COLUMN "admin_activated_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP COLUMN "admin_activated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_subscription_periods" DROP COLUMN "admin_activation_status"`,
    );
  }
}
