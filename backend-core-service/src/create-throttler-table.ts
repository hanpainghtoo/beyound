import { AppDataSource } from './database/data-source';

async function main() {
  await AppDataSource.initialize();
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    // Check if table already exists
    const tableExists = await queryRunner.hasTable('throttler_rate_limits');
    if (tableExists) {
      console.log('Table throttler_rate_limits already exists!');
      return;
    }

    // Create the table
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

    console.log('Table throttler_rate_limits created successfully!');
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Error creating table:', err);
  process.exit(1);
});
