import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantUserNormalizedEmailIdentity1782442400000 implements MigrationInterface {
  name = 'AddTenantUserNormalizedEmailIdentity1782442400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_users" ADD "normalized_email" character varying(320)`,
    );
    await queryRunner.query(
      `UPDATE "tenant_users" SET "normalized_email" = lower(btrim("email"))`,
    );

    const duplicates = (await queryRunner.query(`
      SELECT lower(btrim("email")) AS normalized_email, COUNT(*)::text AS duplicate_count
      FROM "tenant_users"
      GROUP BY lower(btrim("email"))
      HAVING COUNT(*) > 1
      ORDER BY normalized_email
    `)) as Array<{
      normalized_email: string;
      duplicate_count: string;
    }>;

    if (duplicates.length > 0) {
      const summary = duplicates
        .slice(0, 10)
        .map((row) => `${row.normalized_email} (${row.duplicate_count})`)
        .join(', ');
      throw new Error(
        `Cannot add global tenant-user normalized email uniqueness while duplicates exist. Resolve duplicate tenant_users first: ${summary}`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "tenant_users" ALTER COLUMN "normalized_email" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_tenant_users_normalized_email" ON "tenant_users" ("normalized_email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tenant_users_normalized_email_lookup" ON "tenant_users" ("normalized_email", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "idx_tenant_users_normalized_email_lookup"`,
    );
    await queryRunner.query(`DROP INDEX "uq_tenant_users_normalized_email"`);
    await queryRunner.query(
      `ALTER TABLE "tenant_users" DROP COLUMN "normalized_email"`,
    );
  }
}
