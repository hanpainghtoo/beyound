import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInternalShoppingActivityIndex1782447001000 implements MigrationInterface {
  name = 'AddInternalShoppingActivityIndex1782447001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_messages_internal_system_event_key"
      ON "messages" ("tenant_id", "conversation_id", (("metadata" ->> 'idempotencyKey')))
      WHERE "sender_type" = 'system'
        AND "message_type" = 'system_event'
        AND "is_internal" = true
        AND ("metadata" ->> 'idempotencyKey') IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_messages_internal_system_event_key"`,
    );
  }
}
