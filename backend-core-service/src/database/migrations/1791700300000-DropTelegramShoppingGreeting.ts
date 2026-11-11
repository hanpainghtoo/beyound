import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the superseded `telegramShopping.greeting` key (Plan 73, Phase 5).
 * Greetings now render from the bot template (custom label) or the default
 * formula; nothing has written this key (no API, UI, or script sets it).
 * Media caches, currency, and all flags are untouched.
 */
export class DropTelegramShoppingGreeting1791700300000 implements MigrationInterface {
  name = 'DropTelegramShoppingGreeting1791700300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "tenant_channels"
       SET "configuration" = "configuration" #- '{telegramShopping,greeting}'
       WHERE (("configuration" -> 'telegramShopping') ? 'greeting')`,
    );
  }

  async down(): Promise<void> {
    // Intentional no-op: the key is superseded; restoring it would
    // resurrect a dead read path (removed from ShoppingSettings).
  }
}
