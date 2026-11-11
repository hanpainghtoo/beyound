import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddTenantChannelMetaApp1791800000000 implements MigrationInterface {
  name = 'AddTenantChannelMetaApp1791800000000';
  async up(q: QueryRunner) {
    await q.query(
      `ALTER TABLE "tenant_channels" ADD COLUMN "meta_app_id" uuid NULL`,
    );
    await q.query(
      `ALTER TABLE "tenant_channels" ADD CONSTRAINT "FK_tenant_channels_meta_app" FOREIGN KEY ("meta_app_id") REFERENCES "meta_apps"("id") ON DELETE SET NULL`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      `ALTER TABLE "tenant_channels" DROP CONSTRAINT "FK_tenant_channels_meta_app"`,
    );
    await q.query(`ALTER TABLE "tenant_channels" DROP COLUMN "meta_app_id"`);
  }
}
