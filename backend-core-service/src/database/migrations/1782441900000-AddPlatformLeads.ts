import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformLeads1782441900000 implements MigrationInterface {
  name = 'AddPlatformLeads1782441900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "platform_leads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "intent" character varying NOT NULL DEFAULT 'general', "status" character varying NOT NULL DEFAULT 'new', "full_name" character varying NOT NULL, "company_name" character varying NOT NULL, "email_address" character varying NOT NULL, "phone_number" character varying, "business_type" character varying, "team_size" character varying, "interested_in" character varying, "message" text, "source" character varying, "metadata" jsonb NOT NULL DEFAULT '{}', "contacted_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_platform_leads" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_platform_leads_intent_status" ON "platform_leads" ("intent", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_platform_leads_created_at" ON "platform_leads" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_platform_leads_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_platform_leads_intent_status"`);
    await queryRunner.query(`DROP TABLE "platform_leads"`);
  }
}
