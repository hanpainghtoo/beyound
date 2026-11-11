import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDomainAttachmentLinks1782441600000 implements MigrationInterface {
  name = 'AddDomainAttachmentLinks1782441600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "attachments" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD "attachments" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" DROP COLUMN "attachments"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "attachments"`);
  }
}
