import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds default bot templates for commerce-enabled tenants (Plan 73,
 * Phase 2): one default template + the 5 legacy-menu fields per tenant with
 * `telegram_bot_template = 'commerce'` and no default yet, plus integration
 * mapping rows for their already shop-enabled Telegram channels.
 *
 * All three inserts are idempotent (NOT EXISTS guards) so re-running is
 * safe. `down` is intentionally a no-op: reverting must not destroy tenant
 * template data that Phase 3 lets tenants customize.
 */
export class BackfillDefaultBotTemplates1791700100000 implements MigrationInterface {
  name = 'BackfillDefaultBotTemplates1791700100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `INSERT INTO "tenant_bot_templates" ("id", "tenant_id", "name", "is_default", "created_at", "updated_at")
       SELECT uuid_generate_v4(), "s"."tenant_id", 'Default', true, now(), now()
       FROM "tenant_channel_settings" "s"
       WHERE "s"."telegram_bot_template" = 'commerce'
         AND NOT EXISTS (
           SELECT 1 FROM "tenant_bot_templates" "b"
           WHERE "b"."tenant_id" = "s"."tenant_id" AND "b"."is_default"
         )`,
    );
    await queryRunner.query(
      `INSERT INTO "tenant_bot_template_fields" ("id", "template_id", "key", "sort", "layout", "visible", "condition", "value")
       SELECT uuid_generate_v4(), "b"."id", "f"."key", "f"."sort", "f"."layout", true, "f"."condition", '{}'
       FROM "tenant_bot_templates" "b"
       CROSS JOIN (VALUES
         ('greeting', 0, 'full', NULL::varchar),
         ('products', 1, 'full', NULL::varchar),
         ('shop_info', 2, 'half', NULL::varchar),
         ('orders', 3, 'half', 'requires_ordering'),
         ('agent', 4, 'full', NULL::varchar)
       ) AS "f"("key", "sort", "layout", "condition")
       WHERE "b"."is_default"
         AND NOT EXISTS (
           SELECT 1 FROM "tenant_bot_template_fields" "x"
           WHERE "x"."template_id" = "b"."id"
         )`,
    );
    await queryRunner.query(
      `INSERT INTO "tenant_bot_template_channels" ("template_id", "channel_id", "tenant_id", "created_at")
       SELECT "b"."id", "c"."id", "c"."tenant_id", now()
       FROM "tenant_channels" "c"
       JOIN "tenant_bot_templates" "b"
         ON "b"."tenant_id" = "c"."tenant_id" AND "b"."is_default"
       WHERE "c"."channel_type" = 'telegram'
         AND (("c"."configuration" -> 'telegramShopping' ->> 'shopEnabled') = 'true'
           OR ("c"."configuration" -> 'telegramShopping' ->> 'orderingEnabled') = 'true')
         AND NOT EXISTS (
           SELECT 1 FROM "tenant_bot_template_channels" "m"
           WHERE "m"."channel_id" = "c"."id"
         )`,
    );
  }

  async down(): Promise<void> {
    // Intentional no-op: see class comment. Reverting must not destroy
    // tenant template rows that later phases let tenants customize.
  }
}
