import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInboundOutboundMessageLimitsAndAllowedProviders1782443200000 implements MigrationInterface {
  name = 'AddInboundOutboundMessageLimitsAndAllowedProviders1782443200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ADD "inbound_message_limit" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ADD "outbound_message_limit" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ADD "allowed_providers" text array NOT NULL DEFAULT '{messenger}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN "allowed_providers"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN "outbound_message_limit"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN "inbound_message_limit"`,
    );
  }
}
