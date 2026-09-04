import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTelegramChannelCertificationFields1782442700000 implements MigrationInterface {
  name = 'AddTelegramChannelCertificationFields1782442700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" ADD "provider_account_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" ADD "credentials_verified_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" ADD "first_inbound_verified_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" ADD "last_inbound_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" ADD "last_outbound_at" TIMESTAMP`,
    );

    await queryRunner.query(`
      UPDATE "tenant_channels"
      SET "provider_account_id" = COALESCE(
        NULLIF("configuration"->>'telegramBotId', ''),
        NULLIF("configuration"->'verifiedIdentity'->>'botId', ''),
        NULLIF("configuration"->'verifiedIdentity'->>'id', '')
      )
      WHERE "channel_type" = 'telegram'
        AND "provider_account_id" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_tenant_channels_active_telegram_bot"
      ON "tenant_channels" ("channel_type", "provider_account_id")
      WHERE "channel_type" = 'telegram'
        AND "provider_account_id" IS NOT NULL
        AND "status" NOT IN ('inactive', 'disabled')
        AND "connection_status" NOT IN ('disabled', 'locally_disabled_provider_cleanup_pending')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "uq_tenant_channels_active_telegram_bot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" DROP COLUMN "last_outbound_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" DROP COLUMN "last_inbound_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" DROP COLUMN "first_inbound_verified_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" DROP COLUMN "credentials_verified_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" DROP COLUMN "provider_account_id"`,
    );
  }
}
