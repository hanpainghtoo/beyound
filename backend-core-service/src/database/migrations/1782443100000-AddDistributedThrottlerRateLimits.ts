import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDistributedThrottlerRateLimits1782443100000 implements MigrationInterface {
  name = 'AddDistributedThrottlerRateLimits1782443100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "throttler_rate_limits" (
        "storage_key" character varying NOT NULL,
        "throttler_name" character varying NOT NULL,
        "total_hits" integer NOT NULL DEFAULT 0,
        "expires_at" timestamp NOT NULL,
        "is_blocked" boolean NOT NULL DEFAULT false,
        "block_expires_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_throttler_rate_limits" PRIMARY KEY ("storage_key", "throttler_name")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_throttler_rate_limits_expires" ON "throttler_rate_limits" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_throttler_rate_limits_expires"`);
    await queryRunner.query(`DROP TABLE "throttler_rate_limits"`);
  }
}
