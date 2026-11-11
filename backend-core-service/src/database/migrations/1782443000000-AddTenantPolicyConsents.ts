import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantPolicyConsents1782443000000 implements MigrationInterface {
  name = 'AddTenantPolicyConsents1782443000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenant_policy_consents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "tenant_user_id" uuid NOT NULL,
        "normalized_email" character varying(320) NOT NULL,
        "policy_key" character varying NOT NULL,
        "policy_version" character varying NOT NULL,
        "accepted_at" timestamp NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_policy_consents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tenant_policy_consents_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tenant_policy_consents_tenant_user" FOREIGN KEY ("tenant_user_id") REFERENCES "tenant_users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_policy_consents_tenant" ON "tenant_policy_consents" ("tenant_id", "policy_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_policy_consents_user" ON "tenant_policy_consents" ("tenant_user_id", "policy_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_tenant_policy_consents_user"`);
    await queryRunner.query(`DROP INDEX "IDX_tenant_policy_consents_tenant"`);
    await queryRunner.query(`DROP TABLE "tenant_policy_consents"`);
  }
}
