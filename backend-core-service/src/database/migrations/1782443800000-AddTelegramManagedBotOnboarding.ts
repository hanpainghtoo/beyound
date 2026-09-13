import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTelegramManagedBotOnboarding1782443800000 implements MigrationInterface {
  name = 'AddTelegramManagedBotOnboarding1782443800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "telegram_managed_bot_onboarding_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid NOT NULL,
        "requested_by_user_id" uuid NOT NULL,
        "telegram_user_id" character varying,
        "telegram_chat_id" character varying,
        "request_id" integer NOT NULL,
        "state_hash" character varying(128) NOT NULL,
        "state_expires_at" TIMESTAMP NOT NULL,
        "suggested_name" character varying(128) NOT NULL,
        "suggested_username" character varying(64) NOT NULL,
        "created_bot_id" character varying,
        "created_bot_username" character varying,
        "status" character varying(32) NOT NULL DEFAULT 'pending',
        "channel_connection_id" uuid,
        "failure_code" character varying(120),
        "failure_message" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP,
        CONSTRAINT "pk_telegram_managed_bot_onboarding_requests" PRIMARY KEY ("id"),
        CONSTRAINT "fk_tg_managed_onboarding_workspace" FOREIGN KEY ("workspace_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_tg_managed_onboarding_user" FOREIGN KEY ("requested_by_user_id") REFERENCES "tenant_users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_tg_managed_onboarding_state_hash"
      ON "telegram_managed_bot_onboarding_requests" ("state_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_tg_managed_onboarding_workspace_status"
      ON "telegram_managed_bot_onboarding_requests" ("workspace_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_tg_managed_onboarding_request_id"
      ON "telegram_managed_bot_onboarding_requests" ("request_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_tg_managed_onboarding_created_bot"
      ON "telegram_managed_bot_onboarding_requests" ("created_bot_id")
      WHERE "created_bot_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_tg_managed_onboarding_active_workspace_user"
      ON "telegram_managed_bot_onboarding_requests" ("workspace_id", "requested_by_user_id")
      WHERE "status" IN ('pending', 'telegram_started', 'awaiting_creation', 'provisioning')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_tg_managed_onboarding_active_telegram_user"
      ON "telegram_managed_bot_onboarding_requests" ("telegram_user_id")
      WHERE "telegram_user_id" IS NOT NULL
        AND "status" IN ('telegram_started', 'awaiting_creation', 'provisioning')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "uq_tg_managed_onboarding_active_telegram_user"',
    );
    await queryRunner.query(
      'DROP INDEX "uq_tg_managed_onboarding_active_workspace_user"',
    );
    await queryRunner.query(
      'DROP INDEX "uq_tg_managed_onboarding_created_bot"',
    );
    await queryRunner.query(
      'DROP INDEX "idx_tg_managed_onboarding_request_id"',
    );
    await queryRunner.query(
      'DROP INDEX "idx_tg_managed_onboarding_workspace_status"',
    );
    await queryRunner.query('DROP INDEX "uq_tg_managed_onboarding_state_hash"');
    await queryRunner.query(
      'DROP TABLE "telegram_managed_bot_onboarding_requests"',
    );
  }
}
