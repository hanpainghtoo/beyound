import { MigrationInterface, QueryRunner } from 'typeorm';

const MESSENGER_SHARED_ROUTING_SEGMENT =
  process.env.MESSENGER_PROVIDER_APP_ROUTING_ID ||
  process.env.META_PROVIDER_APP_ROUTING_ID ||
  'shared';

function escapeRegexForPostgres(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class UseSharedMessengerWebhookRoute1782443700000 implements MigrationInterface {
  name = 'UseSharedMessengerWebhookRoute1782443700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const segment = escapeRegexForPostgres(MESSENGER_SHARED_ROUTING_SEGMENT);

    await queryRunner.query(`
      UPDATE "tenant_channels"
      SET "webhook_url" = regexp_replace(
        "webhook_url",
        '(/webhooks/messenger/)[^/?#]+$',
        '$1${segment}'
      )
      WHERE "channel_type" = 'messenger'
        AND "webhook_url" IS NOT NULL
        AND "webhook_url" ~ '/webhooks/messenger/[^/?#]+$'
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_tenant_channels_webhook_url"`,
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_tenant_channels_webhook_url"
      ON "tenant_channels" ("webhook_url")
      WHERE "webhook_url" IS NOT NULL AND "channel_type" <> 'messenger'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_tenant_channels_webhook_url"`,
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_tenant_channels_webhook_url"
      ON "tenant_channels" ("webhook_url")
      WHERE "webhook_url" IS NOT NULL
    `);
  }
}
