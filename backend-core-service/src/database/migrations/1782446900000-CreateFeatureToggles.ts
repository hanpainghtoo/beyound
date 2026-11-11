import type { MigrationInterface, QueryRunner } from 'typeorm';

// Plan 55: per-tenant feature toggles.
//
// Two tables:
//   * `feature_categories` — global catalog of toggleable workspace modules
//     (unique `key`, optional `depends_on` for cascade, `is_lockable` for
//     modules that must never be switched off such as Inbox).
//   * `tenant_feature_configs` — join table carrying the per-tenant on/off
//     flag plus who changed it and when.
//
// Existing tenants are backfilled with every category enabled so no module
// disappears on upgrade. New tenants are seeded explicitly at creation time.
export class CreateFeatureToggles1782446900000 implements MigrationInterface {
  name = 'CreateFeatureToggles1782446900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "feature_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "key" character varying(50) NOT NULL,
        "display_name" character varying(100) NOT NULL,
        "description" character varying(255),
        "depends_on" character varying(50),
        "is_lockable" boolean NOT NULL DEFAULT true,
        "display_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_feature_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_feature_categories_key" UNIQUE ("key")
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "tenant_feature_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "feature_category_id" uuid NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "updated_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_feature_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenant_feature_configs_tenant_feature"
          UNIQUE ("tenant_id", "feature_category_id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_feature_configs_tenant"
         ON "tenant_feature_configs" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_feature_configs_category"
         ON "tenant_feature_configs" ("feature_category_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_feature_configs"
         ADD CONSTRAINT "FK_tenant_feature_configs_tenant"
         FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
         ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_feature_configs"
         ADD CONSTRAINT "FK_tenant_feature_configs_category"
         FOREIGN KEY ("feature_category_id") REFERENCES "feature_categories"("id")
         ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Catalog seed. Idempotent so a re-run refreshes labels without
    // disturbing per-tenant rows.
    await queryRunner.query(`
      INSERT INTO "feature_categories"
        ("key", "display_name", "description", "depends_on", "is_lockable", "display_order")
      VALUES
        ('inbox', 'Inbox & Chat', 'Shared inbox and team chat. Always available.', NULL, false, 10),
        ('orders', 'Orders', 'Order capture, order pipeline and order settings.', NULL, true, 20),
        ('deliveries', 'Deliveries', 'Delivery runs and delivery assignments. Requires Orders.', 'orders', true, 30),
        ('products', 'Products', 'Product and catalog management.', NULL, true, 40),
        ('customers', 'Customers', 'Customer records and profiles.', NULL, true, 50),
        ('reports', 'Reports', 'Commerce and messaging reporting.', NULL, true, 60)
      ON CONFLICT ("key") DO UPDATE SET
        "display_name" = EXCLUDED."display_name",
        "description" = EXCLUDED."description",
        "depends_on" = EXCLUDED."depends_on",
        "is_lockable" = EXCLUDED."is_lockable",
        "display_order" = EXCLUDED."display_order",
        "updated_at" = now()
    `);

    // Backfill every existing tenant with the full catalog, all enabled.
    await queryRunner.query(`
      INSERT INTO "tenant_feature_configs" ("tenant_id", "feature_category_id", "is_enabled")
      SELECT t."id", fc."id", true
      FROM "tenants" t
      CROSS JOIN "feature_categories" fc
      ON CONFLICT ("tenant_id", "feature_category_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tenant_feature_configs"`);
    await queryRunner.query(`DROP TABLE "feature_categories"`);
  }
}
