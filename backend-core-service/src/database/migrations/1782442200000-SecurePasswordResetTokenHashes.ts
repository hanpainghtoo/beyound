import { MigrationInterface, QueryRunner } from 'typeorm';

export class SecurePasswordResetTokenHashes1782442200000 implements MigrationInterface {
  name = 'SecurePasswordResetTokenHashes1782442200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "password_reset_tokens" SET "used_at" = now(), "updated_at" = now() WHERE "used_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_password_reset_tokens_active_user" ON "password_reset_tokens" ("user_type", "user_id", "created_at") WHERE "used_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_password_reset_tokens_active_user"`,
    );
  }
}
