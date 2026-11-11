import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant bot templates (Phase 1, Plan 73). Content-only customization for the
 * Telegram commerce flow: templates, ordered fields (menu buttons/texts),
 * and per-channel integration mapping. Nothing reads these tables yet;
 * rendering migration lands in Phase 4a.
 */
export class CreateTenantBotTemplates1791700000000 implements MigrationInterface {
  name = 'CreateTenantBotTemplates1791700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tenant_bot_templates" (
        "id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "name" varchar NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "updated_by" uuid NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_bot_templates" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_templates" ADD CONSTRAINT "FK_tenant_bot_templates_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_tenant_bot_templates_default" ON "tenant_bot_templates" ("tenant_id") WHERE "is_default"`,
    );

    await queryRunner.query(
      `CREATE TABLE "tenant_bot_template_fields" (
        "id" uuid NOT NULL,
        "template_id" uuid NOT NULL,
        "key" varchar NOT NULL,
        "sort" integer NOT NULL,
        "layout" varchar NOT NULL,
        "visible" boolean NOT NULL DEFAULT true,
        "condition" varchar NULL,
        "value" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_tenant_bot_template_fields" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_tenant_bot_template_fields_key" CHECK ("key" IN ('greeting', 'products', 'shop_info', 'orders', 'agent')),
        CONSTRAINT "CHK_tenant_bot_template_fields_layout" CHECK ("layout" IN ('full', 'half')),
        CONSTRAINT "CHK_tenant_bot_template_fields_condition" CHECK ("condition" IS NULL OR "condition" IN ('requires_ordering')),
        CONSTRAINT "uq_tenant_bot_template_fields_key" UNIQUE ("template_id", "key"),
        CONSTRAINT "uq_tenant_bot_template_fields_sort" UNIQUE ("template_id", "sort")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_template_fields" ADD CONSTRAINT "FK_tenant_bot_template_fields_template" FOREIGN KEY ("template_id") REFERENCES "tenant_bot_templates"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `CREATE TABLE "tenant_bot_template_channels" (
        "template_id" uuid NOT NULL,
        "channel_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_bot_template_channels" PRIMARY KEY ("template_id", "channel_id"),
        CONSTRAINT "uq_tenant_bot_template_channels_channel" UNIQUE ("channel_id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_template_channels" ADD CONSTRAINT "FK_tenant_bot_template_channels_template" FOREIGN KEY ("template_id") REFERENCES "tenant_bot_templates"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_template_channels" ADD CONSTRAINT "FK_tenant_bot_template_channels_channel" FOREIGN KEY ("channel_id") REFERENCES "tenant_channels"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_template_channels" ADD CONSTRAINT "FK_tenant_bot_template_channels_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tenant_bot_template_channels"`);
    await queryRunner.query(`DROP TABLE "tenant_bot_template_fields"`);
    await queryRunner.query(`DROP TABLE "tenant_bot_templates"`);
  }
}
