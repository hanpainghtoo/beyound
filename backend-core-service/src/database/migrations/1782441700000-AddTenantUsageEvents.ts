import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantUsageEvents1782441700000 implements MigrationInterface {
  name = 'AddTenantUsageEvents1782441700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD "custom_api_limit" integer`,
    );
    await queryRunner.query(
      `CREATE TABLE "tenant_usage_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "channel_id" uuid, "provider" character varying, "usage_type" character varying NOT NULL, "direction" character varying, "quantity" integer NOT NULL DEFAULT '1', "source" character varying, "request_path" character varying, "request_method" character varying, "metadata" jsonb NOT NULL DEFAULT '{}', "occurred_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_tenant_usage_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_usage_events_tenant_type_time" ON "tenant_usage_events" ("tenant_id", "usage_type", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_usage_events_channel_provider" ON "tenant_usage_events" ("tenant_id", "channel_id", "provider", "occurred_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" ADD CONSTRAINT "FK_tenant_usage_events_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" ADD CONSTRAINT "FK_tenant_usage_events_channel" FOREIGN KEY ("channel_id") REFERENCES "tenant_channels"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" DROP CONSTRAINT "FK_tenant_usage_events_channel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" DROP CONSTRAINT "FK_tenant_usage_events_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_tenant_usage_events_channel_provider"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_tenant_usage_events_tenant_type_time"`,
    );
    await queryRunner.query(`DROP TABLE "tenant_usage_events"`);
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN "custom_api_limit"`,
    );
  }
}
