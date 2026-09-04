import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutboundMessageCommands1782443300000 implements MigrationInterface {
  name = 'AddOutboundMessageCommands1782443300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "outbound_message_commands" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "command_id" character varying(160) NOT NULL,
        "tenant_id" uuid NOT NULL,
        "conversation_id" uuid NOT NULL,
        "message_id" uuid NOT NULL,
        "channel_id" uuid NOT NULL,
        "provider" character varying(40) NOT NULL,
        "status" character varying(40) NOT NULL DEFAULT 'queued',
        "attempts" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "provider_result" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbound_message_commands" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_outbound_message_commands_status" CHECK ("status" IN ('queued', 'sending', 'sent', 'failed', 'delivery_unknown'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_outbound_message_commands_command_id" ON "outbound_message_commands" ("command_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_outbound_message_commands_message_id" ON "outbound_message_commands" ("message_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outbound_message_commands_status" ON "outbound_message_commands" ("status", "updated_at")`,
    );
    await queryRunner.query(`
      ALTER TABLE "outbound_message_commands"
      ADD CONSTRAINT "FK_outbound_message_commands_conversation"
      FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "outbound_message_commands"
      ADD CONSTRAINT "FK_outbound_message_commands_message"
      FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "outbound_message_commands"
      ADD CONSTRAINT "FK_outbound_message_commands_channel"
      FOREIGN KEY ("channel_id") REFERENCES "tenant_channels"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "outbound_message_commands" DROP CONSTRAINT "FK_outbound_message_commands_channel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbound_message_commands" DROP CONSTRAINT "FK_outbound_message_commands_message"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbound_message_commands" DROP CONSTRAINT "FK_outbound_message_commands_conversation"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_outbound_message_commands_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_outbound_message_commands_message_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_outbound_message_commands_command_id"`,
    );
    await queryRunner.query(`DROP TABLE "outbound_message_commands"`);
  }
}
