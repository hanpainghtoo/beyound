import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantEmailVerification1782442900000 implements MigrationInterface {
  name = 'AddTenantEmailVerification1782442900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_users" ADD "email_verified_at" timestamp`,
    );
    await queryRunner.query(
      `UPDATE "tenant_users" SET "email_verified_at" = now()`,
    );
    await queryRunner.query(`
      CREATE TABLE "email_verification_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_user_id" uuid NOT NULL,
        "normalized_email" character varying(320) NOT NULL,
        "token_hash" character varying NOT NULL,
        "expires_at" timestamp NOT NULL,
        "used_at" timestamp,
        "resend_available_at" timestamp NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_verification_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_verification_tokens_tenant_user" FOREIGN KEY ("tenant_user_id") REFERENCES "tenant_users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_email_verification_tokens_hash" ON "email_verification_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_verification_tokens_user" ON "email_verification_tokens" ("tenant_user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_verification_tokens_active_user" ON "email_verification_tokens" ("tenant_user_id", "created_at") WHERE "used_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_email_verification_tokens_active_user"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_email_verification_tokens_user"`);
    await queryRunner.query(`DROP INDEX "IDX_email_verification_tokens_hash"`);
    await queryRunner.query(`DROP TABLE "email_verification_tokens"`);
    await queryRunner.query(
      `ALTER TABLE "tenant_users" DROP COLUMN "email_verified_at"`,
    );
  }
}
