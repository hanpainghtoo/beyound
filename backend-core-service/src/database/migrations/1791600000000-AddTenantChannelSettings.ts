import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-tenant channel settings (Telegram bot template toggle).
 *
 * Backfill: every tenant that already runs Telegram commerce (a Telegram
 * channel with telegramShopping.shopEnabled or orderingEnabled set to true,
 * the same population as the read-only query in
 * docs/tenant_settings/telegram_template_stage.md E2) gets
 * telegram_bot_template='commerce'. All other tenants get no row, which
 * reads as template-off.
 */
export class AddTenantChannelSettings1791600000000 implements MigrationInterface {
  name = 'AddTenantChannelSettings1791600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tenant_channel_settings" (
        "tenant_id" uuid NOT NULL,
        "telegram_bot_template" varchar NULL,
        "updated_by" uuid NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_channel_settings_tenant" PRIMARY KEY ("tenant_id"),
        CONSTRAINT "CHK_tenant_channel_settings_template" CHECK ("telegram_bot_template" IN ('commerce'))
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channel_settings" ADD CONSTRAINT "FK_tenant_channel_settings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `INSERT INTO "tenant_channel_settings" ("tenant_id", "telegram_bot_template", "created_at", "updated_at")
       SELECT DISTINCT "c"."tenant_id", 'commerce', now(), now()
       FROM "tenant_channels" "c"
       WHERE "c"."channel_type" = 'telegram'
         AND (("c"."configuration" -> 'telegramShopping' ->> 'shopEnabled') = 'true'
           OR ("c"."configuration" -> 'telegramShopping' ->> 'orderingEnabled') = 'true')`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tenant_channel_settings"`);
  }
}
