import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameAgentToCsr1781900000000 implements MigrationInterface {
  name = 'RenameAgentToCsr1781900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "tenant_users" SET "role" = 'csr' WHERE "role" = 'agent'`,
    );
    await queryRunner.query(
      `UPDATE "messages" SET "sender_type" = 'csr' WHERE "sender_type" = 'agent'`,
    );

    if (await queryRunner.hasColumn('subscription_plans', 'max_agents')) {
      await queryRunner.query(
        `ALTER TABLE "subscription_plans" RENAME COLUMN "max_agents" TO "max_csrs"`,
      );
    }
    if (await queryRunner.hasColumn('tenants', 'custom_agent_limit')) {
      await queryRunner.query(
        `ALTER TABLE "tenants" RENAME COLUMN "custom_agent_limit" TO "custom_csr_limit"`,
      );
    }
    if (await queryRunner.hasColumn('tenant_analytics', 'active_agents')) {
      await queryRunner.query(
        `ALTER TABLE "tenant_analytics" RENAME COLUMN "active_agents" TO "active_csrs"`,
      );
    }
    if (await queryRunner.hasColumn('conversations', 'assigned_agent_id')) {
      await queryRunner.query(
        `ALTER TABLE "conversations" RENAME COLUMN "assigned_agent_id" TO "assigned_csr_id"`,
      );
    }
    if (
      await queryRunner.hasColumn('conversations', 'last_agent_response_at')
    ) {
      await queryRunner.query(
        `ALTER TABLE "conversations" RENAME COLUMN "last_agent_response_at" TO "last_csr_response_at"`,
      );
    }
    if (await queryRunner.hasTable('agent_analytics')) {
      await queryRunner.query(
        `ALTER TABLE "agent_analytics" RENAME TO "csr_analytics"`,
      );
    }
    if (await queryRunner.hasColumn('csr_analytics', 'agent_id')) {
      await queryRunner.query(
        `ALTER TABLE "csr_analytics" RENAME COLUMN "agent_id" TO "csr_id"`,
      );
    }

    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_conversations_agent_id" RENAME TO "idx_conversations_csr_id"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_agent_analytics_tenant_agent_date" RENAME TO "idx_csr_analytics_tenant_csr_date"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_online_agents" RENAME TO "idx_online_csrs"`,
    );

    await queryRunner.query(
      `ALTER VIEW IF EXISTS "agent_performance_summary" RENAME TO "csr_performance_summary"`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_proc
          WHERE proname = 'get_agent_performance_stats'
        ) THEN
          ALTER FUNCTION get_agent_performance_stats(UUID, DATE, DATE) RENAME TO get_csr_performance_stats;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_proc
          WHERE proname = 'get_csr_performance_stats'
        ) THEN
          ALTER FUNCTION get_csr_performance_stats(UUID, DATE, DATE) RENAME TO get_agent_performance_stats;
        END IF;
      END
      $$;
    `);
    await queryRunner.query(
      `ALTER VIEW IF EXISTS "csr_performance_summary" RENAME TO "agent_performance_summary"`,
    );

    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_online_csrs" RENAME TO "idx_online_agents"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_csr_analytics_tenant_csr_date" RENAME TO "idx_agent_analytics_tenant_agent_date"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_conversations_csr_id" RENAME TO "idx_conversations_agent_id"`,
    );

    if (await queryRunner.hasColumn('csr_analytics', 'csr_id')) {
      await queryRunner.query(
        `ALTER TABLE "csr_analytics" RENAME COLUMN "csr_id" TO "agent_id"`,
      );
    }
    if (await queryRunner.hasTable('csr_analytics')) {
      await queryRunner.query(
        `ALTER TABLE "csr_analytics" RENAME TO "agent_analytics"`,
      );
    }
    if (await queryRunner.hasColumn('conversations', 'last_csr_response_at')) {
      await queryRunner.query(
        `ALTER TABLE "conversations" RENAME COLUMN "last_csr_response_at" TO "last_agent_response_at"`,
      );
    }
    if (await queryRunner.hasColumn('conversations', 'assigned_csr_id')) {
      await queryRunner.query(
        `ALTER TABLE "conversations" RENAME COLUMN "assigned_csr_id" TO "assigned_agent_id"`,
      );
    }
    if (await queryRunner.hasColumn('tenant_analytics', 'active_csrs')) {
      await queryRunner.query(
        `ALTER TABLE "tenant_analytics" RENAME COLUMN "active_csrs" TO "active_agents"`,
      );
    }
    if (await queryRunner.hasColumn('tenants', 'custom_csr_limit')) {
      await queryRunner.query(
        `ALTER TABLE "tenants" RENAME COLUMN "custom_csr_limit" TO "custom_agent_limit"`,
      );
    }
    if (await queryRunner.hasColumn('subscription_plans', 'max_csrs')) {
      await queryRunner.query(
        `ALTER TABLE "subscription_plans" RENAME COLUMN "max_csrs" TO "max_agents"`,
      );
    }

    await queryRunner.query(
      `UPDATE "messages" SET "sender_type" = 'agent' WHERE "sender_type" = 'csr'`,
    );
    await queryRunner.query(
      `UPDATE "tenant_users" SET "role" = 'agent' WHERE "role" = 'csr'`,
    );
  }
}
