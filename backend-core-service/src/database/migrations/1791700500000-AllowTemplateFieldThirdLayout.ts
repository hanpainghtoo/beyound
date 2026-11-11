import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allows `third` spans on template fields (Plan 75). Grid is 6 units per
 * row: full = 6, half = 3, third = 2. Existing full/half rows are
 * unaffected by the wider CHECK.
 */
export class AllowTemplateFieldThirdLayout1791700500000 implements MigrationInterface {
  name = 'AllowTemplateFieldThirdLayout1791700500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_template_fields" DROP CONSTRAINT "CHK_tenant_bot_template_fields_layout"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_template_fields" ADD CONSTRAINT "CHK_tenant_bot_template_fields_layout" CHECK ("layout" IN ('full', 'half', 'third'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "tenant_bot_template_fields" SET "layout" = 'half' WHERE "layout" = 'third'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_template_fields" DROP CONSTRAINT "CHK_tenant_bot_template_fields_layout"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_bot_template_fields" ADD CONSTRAINT "CHK_tenant_bot_template_fields_layout" CHECK ("layout" IN ('full', 'half'))`,
    );
  }
}
