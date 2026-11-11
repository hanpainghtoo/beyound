import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerBotBlockedFields1782447100000 implements MigrationInterface {
  name = 'AddCustomerBotBlockedFields1782447100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" ADD "bot_blocked_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD "bot_blocked_reason" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" DROP COLUMN "bot_blocked_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP COLUMN "bot_blocked_at"`,
    );
  }
}
