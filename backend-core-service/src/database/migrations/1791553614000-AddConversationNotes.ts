import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Conversation-linked staff notes (Plan 72). Internal-only by construction:
 * notes live solely in this table with no send path, so they can never leak
 * to the customer — unlike customer.notes, which sits beside sendable fields.
 */
export class AddConversationNotes1791553614000 implements MigrationInterface {
  name = 'AddConversationNotes1791553614000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "conversation_notes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "conversation_id" uuid NOT NULL,
        "author_id" uuid,
        "content" text NOT NULL,
        "is_pinned" boolean NOT NULL DEFAULT false,
        "is_resolved" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversation_notes_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_conversation_notes_conversation" ON "conversation_notes" ("conversation_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_notes" ADD CONSTRAINT "FK_conversation_notes_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_notes" ADD CONSTRAINT "FK_conversation_notes_author" FOREIGN KEY ("author_id") REFERENCES "tenant_users"("id") ON DELETE SET NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "conversation_notes"`);
  }
}
