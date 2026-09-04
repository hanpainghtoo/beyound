import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfills subscription_plans.allowed_providers for the canonical plan catalog.
 *
 * Migration 1782443200000 (AddInboundOutboundMessageLimitsAndAllowedProviders)
 * added the column with DEFAULT '{messenger}', so every pre-existing plan row —
 * including Business Launch / Business Growth / Enterprise, which are supposed
 * to allow Telegram — was silently locked to Messenger-only. Re-running the
 * seed would correct this (seed.ts / production-bootstrap.data.ts carry the
 * per-tier values), but the seed is not part of the standard deploy path, so
 * environments that existed before that migration are left with Telegram
 * blocked (409 PROVIDER_NOT_ALLOWED_IN_PLAN on managed-bot / channel creation).
 *
 * This migration brings existing rows in line with the seed data. It keys on
 * plan name (the identity the seed uses), only touches the canonical plans,
 * and only updates rows still stuck at the '{messenger}' migration default —
 * so a deliberately-customized allow-list on a canonical-named plan is never
 * clobbered, and operator-created custom plans are left untouched.
 */
export class BackfillPlanAllowedProviders1782443900000 implements MigrationInterface {
  name = 'BackfillPlanAllowedProviders1782443900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "subscription_plans" SET "allowed_providers" = ARRAY['messenger','telegram'] WHERE "name" = 'Business Launch' AND "allowed_providers" = ARRAY['messenger']`,
    );
    await queryRunner.query(
      `UPDATE "subscription_plans" SET "allowed_providers" = ARRAY['messenger','telegram','viber'] WHERE "name" = 'Business Growth' AND "allowed_providers" = ARRAY['messenger']`,
    );
    await queryRunner.query(
      `UPDATE "subscription_plans" SET "allowed_providers" = ARRAY['messenger','telegram','viber','tiktok'] WHERE "name" = 'Enterprise' AND "allowed_providers" = ARRAY['messenger']`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the pre-backfill state (the '{messenger}' migration default).
    await queryRunner.query(
      `UPDATE "subscription_plans" SET "allowed_providers" = ARRAY['messenger'] WHERE "name" IN ('Business Launch', 'Business Growth', 'Enterprise')`,
    );
  }
}
