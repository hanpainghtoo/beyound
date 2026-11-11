import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds Facebook settings separately because the original settings migration
 * was already executed before Facebook mode was introduced. */
export class AddFacebookModeToTenantChannelSettings1791900000000 implements MigrationInterface {
  name = 'AddFacebookModeToTenantChannelSettings1791900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_channel_settings" ADD COLUMN IF NOT EXISTS "facebook_mode" varchar NOT NULL DEFAULT 'platform_one_click'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channel_settings" ADD COLUMN IF NOT EXISTS "facebook_business_verified" boolean NULL`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'CHK_tenant_channel_settings_facebook_mode'
        ) THEN
          ALTER TABLE "tenant_channel_settings"
            ADD CONSTRAINT "CHK_tenant_channel_settings_facebook_mode"
            CHECK ("facebook_mode" IN ('platform_one_click', 'byo_app'));
        END IF;
      END $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_channel_settings" DROP CONSTRAINT IF EXISTS "CHK_tenant_channel_settings_facebook_mode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channel_settings" DROP COLUMN IF EXISTS "facebook_business_verified"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channel_settings" DROP COLUMN IF EXISTS "facebook_mode"`,
    );
  }
}
