import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionUsageBillingIndexes1782442100000 implements MigrationInterface {
  name = 'AddSubscriptionUsageBillingIndexes1782442100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_users_tenant_status" ON "tenant_users" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_channels_tenant_status" ON "tenant_channels" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_platform_leads_source_status" ON "platform_leads" ("source", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_platform_leads_workspace_plan_change_lookup" ON "platform_leads" ((metadata ->> 'tenantId'), (metadata ->> 'requestType'), "status") WHERE "source" = 'workspace-plan-change'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_platform_leads_workspace_plan_change_lookup"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_platform_leads_source_status"`);
    await queryRunner.query(`DROP INDEX "IDX_tenant_channels_tenant_status"`);
    await queryRunner.query(`DROP INDEX "IDX_tenant_users_tenant_status"`);
  }
}
