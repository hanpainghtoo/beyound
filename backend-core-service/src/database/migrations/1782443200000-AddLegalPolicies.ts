import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLegalPolicies1782443200000 implements MigrationInterface {
  name = 'AddLegalPolicies1782443200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "legal_policies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "policy_key" character varying NOT NULL,
        "version" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'draft',
        "title" character varying NOT NULL,
        "content" text NOT NULL,
        "content_format" character varying NOT NULL DEFAULT 'markdown',
        "effective_at" timestamp NOT NULL,
        "published_at" timestamp,
        "published_by_id" character varying,
        "support_email" character varying NOT NULL,
        "legal_email" character varying NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_legal_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_legal_policies_key_version" UNIQUE ("policy_key", "version"),
        CONSTRAINT "CHK_legal_policies_status" CHECK ("status" IN ('draft', 'published', 'retired')),
        CONSTRAINT "CHK_legal_policies_key" CHECK ("policy_key" IN ('terms_of_service', 'privacy_policy', 'data_retention', 'data_export', 'subprocessors'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_legal_policies_key_status_effective" ON "legal_policies" ("policy_key", "status", "effective_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_legal_policies_key_status_effective"`,
    );
    await queryRunner.query(`DROP TABLE "legal_policies"`);
  }
}
