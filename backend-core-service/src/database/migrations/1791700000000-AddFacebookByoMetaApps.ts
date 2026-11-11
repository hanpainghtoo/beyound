import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookByoMetaApps1791700000000 implements MigrationInterface {
  name = 'AddFacebookByoMetaApps1791700000000';
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TABLE "meta_apps" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NULL, "kind" varchar NOT NULL, "app_id" varchar NOT NULL, "app_secret_encrypted" jsonb NOT NULL, "verify_token_encrypted" jsonb NOT NULL, "webhook_path_segment" varchar NOT NULL, "login_config_id" varchar NULL, "status" varchar NOT NULL DEFAULT 'pending', "last_validated_at" timestamptz NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_meta_apps" PRIMARY KEY ("id"), CONSTRAINT "CHK_meta_apps_kind" CHECK ("kind" IN ('platform','byo')), CONSTRAINT "CHK_meta_apps_status" CHECK ("status" IN ('pending','valid','invalid','needs_reconnect','retired')))`,
    );
    await q.query(
      `ALTER TABLE "meta_apps" ADD CONSTRAINT "FK_meta_apps_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_meta_apps_platform" ON "meta_apps" ("kind") WHERE "kind" = 'platform'`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_meta_apps_active_byo_tenant" ON "meta_apps" ("tenant_id") WHERE "kind" = 'byo' AND "status" <> 'retired'`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_meta_apps_webhook_path_segment" ON "meta_apps" ("webhook_path_segment")`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(`DROP TABLE "meta_apps"`);
  }
}
