import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Live-mode confirmation for BYO Meta apps (human attestation, set from the
 * platform-console checkbox). No backfill: existing rows stay NULL
 * (unconfirmed) until an operator confirms them.
 */
export class AddMetaAppLiveConfirmation1792000000000 implements MigrationInterface {
  name = 'AddMetaAppLiveConfirmation1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "meta_apps" ADD COLUMN "live_confirmed_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "meta_apps" ADD COLUMN "live_confirmed_by" uuid NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "meta_apps" DROP COLUMN IF EXISTS "live_confirmed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meta_apps" DROP COLUMN IF EXISTS "live_confirmed_at"`,
    );
  }
}
