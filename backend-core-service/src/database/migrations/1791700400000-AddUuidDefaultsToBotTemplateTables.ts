import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds DB-side UUID defaults to the bot template tables (Plan 74, Fix 1).
 * The Phase 1 migration omitted them (unlike every other table in the
 * repo), so repository inserts that rely on client-side generation can land
 * with a null PK — observed as a 500 on template update
 * (`tenant_bot_template_fields.id` NOT NULL violation). The mapping table
 * uses a composite PK and is unaffected.
 */
export class AddUuidDefaultsToBotTemplateTables1791700400000
  implements MigrationInterface
{
  name = 'AddUuidDefaultsToBotTemplateTables1791700400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_templates" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_template_fields" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_template_fields" ALTER COLUMN "id" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_templates" ALTER COLUMN "id" DROP DEFAULT`,
    );
  }
}
