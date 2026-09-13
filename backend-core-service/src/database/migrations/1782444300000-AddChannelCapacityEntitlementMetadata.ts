import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelCapacityEntitlementMetadata1782444300000 implements MigrationInterface {
  name = 'AddChannelCapacityEntitlementMetadata1782444300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_channels"
        ADD COLUMN "entitlement_origin" character varying(20) NOT NULL DEFAULT 'base_plan',
        ADD COLUMN "entitlement_expires_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "retention_selected" boolean NOT NULL DEFAULT false,
        ADD COLUMN "disabled_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "disabled_reason" character varying(80),
        ADD COLUMN "disabled_previous_status" character varying(40),
        ADD COLUMN "disabled_previous_connection_status" character varying(60)
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_channels"
        ADD CONSTRAINT "CHK_tenant_channels_entitlement_origin"
        CHECK ("entitlement_origin" IN ('base_plan', 'top_up'))
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tenant_channels_capacity_state"
      ON "tenant_channels" ("tenant_id", "entitlement_origin", "status", "retention_selected")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_tenant_channels_capacity_state"`);
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" DROP CONSTRAINT "CHK_tenant_channels_entitlement_origin"`,
    );
    await queryRunner.query(`
      ALTER TABLE "tenant_channels"
        DROP COLUMN "disabled_previous_connection_status",
        DROP COLUMN "disabled_previous_status",
        DROP COLUMN "disabled_reason",
        DROP COLUMN "disabled_at",
        DROP COLUMN "retention_selected",
        DROP COLUMN "entitlement_expires_at",
        DROP COLUMN "entitlement_origin"
    `);
  }
}
