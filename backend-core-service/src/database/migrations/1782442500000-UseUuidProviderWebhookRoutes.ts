import { MigrationInterface, QueryRunner } from 'typeorm';

export class UseUuidProviderWebhookRoutes1782442500000 implements MigrationInterface {
  name = 'UseUuidProviderWebhookRoutes1782442500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" ADD "webhook_registration_status" character varying NOT NULL DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" ADD "webhook_registered_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" ADD "webhook_registration_checked_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" ADD "webhook_registration_error_code" character varying`,
    );

    await queryRunner.query(`
      UPDATE "tenant_channels"
      SET
        "webhook_url" = regexp_replace(
          btrim("webhook_url"),
          '/webhooks/([^/?#]+)/[^/?#]+$',
          '/webhooks/\\1/' || "id"::text
        ),
        "webhook_registration_status" = CASE
          WHEN "webhook_url" IS NULL OR btrim("webhook_url") = '' THEN 'pending'
          WHEN btrim("webhook_url") ~ ('/webhooks/[^/?#]+/' || "id"::text || '$') THEN 'pending'
          ELSE 'requires_reregistration'
        END,
        "webhook_registration_checked_at" = NOW()
      WHERE "webhook_url" IS NOT NULL
        AND btrim("webhook_url") <> ''
        AND btrim("webhook_url") ~ '/webhooks/[^/?#]+/[^/?#]+$'
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_tenant_channels_webhook_provider_status" ON "tenant_channels" ("id", "channel_type", "status")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_tenant_channels_webhook_url" ON "tenant_channels" ("webhook_url") WHERE "webhook_url" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_tenant_channels_webhook_url"`);
    await queryRunner.query(
      `DROP INDEX "idx_tenant_channels_webhook_provider_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" DROP COLUMN "webhook_registration_error_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" DROP COLUMN "webhook_registration_checked_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" DROP COLUMN "webhook_registered_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" DROP COLUMN "webhook_registration_status"`,
    );
  }
}
