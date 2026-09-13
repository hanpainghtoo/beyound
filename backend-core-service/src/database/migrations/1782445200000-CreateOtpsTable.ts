import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOtpsTable1782445200000 implements MigrationInterface {
  name = 'CreateOtpsTable1782445200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "otps" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "normalized_email" VARCHAR(320) NOT NULL,
        "code_hash" VARCHAR NOT NULL,
        "purpose" VARCHAR NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "attempt_count" INTEGER NOT NULL DEFAULT 0,
        "max_attempts" INTEGER NOT NULL DEFAULT 5,
        "used_at" TIMESTAMP,
        "resend_available_at" TIMESTAMP NOT NULL,
        "metadata" JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_otps" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_otps_email_purpose" ON "otps" ("normalized_email", "purpose")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_otps_code_hash" ON "otps" ("code_hash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "otps"`);
  }
}
