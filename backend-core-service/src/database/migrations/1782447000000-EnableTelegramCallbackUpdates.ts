import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableTelegramCallbackUpdates1782447000000 implements MigrationInterface {
  name = 'EnableTelegramCallbackUpdates1782447000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE tenant_channels
      SET configuration = jsonb_set(COALESCE(configuration, '{}'::jsonb), '{telegramWebhook,allowedUpdates}', '["message", "callback_query"]'::jsonb, true),
          webhook_registration_status = CASE WHEN channel_type = 'telegram' AND webhook_registration_status = 'registered' THEN 'requires_reregistration' ELSE webhook_registration_status END
      WHERE channel_type = 'telegram'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE tenant_channels
      SET configuration = configuration #- '{telegramWebhook,allowedUpdates}',
          webhook_registration_status = CASE WHEN channel_type = 'telegram' AND webhook_registration_status = 'requires_reregistration' THEN 'registered' ELSE webhook_registration_status END
      WHERE channel_type = 'telegram'
    `);
  }
}
