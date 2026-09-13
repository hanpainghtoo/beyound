import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetTokens1782442000000 implements MigrationInterface {
  name = 'AddPasswordResetTokens1782442000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_type" character varying NOT NULL, "user_id" uuid NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP NOT NULL, "used_at" TIMESTAMP, "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_password_reset_tokens_hash" ON "password_reset_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_password_reset_tokens_user" ON "password_reset_tokens" ("user_type", "user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_password_reset_tokens_user"`);
    await queryRunner.query(`DROP INDEX "IDX_password_reset_tokens_hash"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}
