import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns template rendering on for channels that are already integrated AND
 * shop-enabled (Plan 73, Phase 3). The flag lives in
 * `configuration.telegramShopping.useBotTemplate`, so the renderer (Phase 4a)
 * can distinguish "attached" (mapping row) from "rendering" (flag on).
 * Idempotent: only touches rows missing the key.
 */
export class EnableTemplateFlagForMappedChannels1791700200000 implements MigrationInterface {
  name = 'EnableTemplateFlagForMappedChannels1791700200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "tenant_channels" "c"
       SET "configuration" = jsonb_set(
         "c"."configuration",
         '{telegramShopping,useBotTemplate}',
         'true',
         true
       )
       FROM "tenant_bot_template_channels" "m"
       WHERE "m"."channel_id" = "c"."id"
         AND (("c"."configuration" -> 'telegramShopping' ->> 'shopEnabled') = 'true'
           OR ("c"."configuration" -> 'telegramShopping' ->> 'orderingEnabled') = 'true')
         AND NOT (("c"."configuration" -> 'telegramShopping') ? 'useBotTemplate')`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "tenant_channels" "c"
       SET "configuration" = "c"."configuration" #- '{telegramShopping,useBotTemplate}'
       FROM "tenant_bot_template_channels" "m"
       WHERE "m"."channel_id" = "c"."id"`,
    );
  }
}
