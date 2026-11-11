import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan 35: rename the `csr` tenant role to `agent` at DB level.
 *
 * Mirrors `RenameAgentToCsr1781900000000` in reverse: enum-ish values first,
 * then physical column/table/index renames, then view/function recreation
 * (RENAME alone cannot rewrite the `csr` literals inside their bodies, so
 * they are rebuilt from the live `pg_views` / `pg_proc` definitions).
 *
 * Every structural step is existence-guarded so fresh installs and
 * partially-migrated databases converge to the same shape.
 */
export class RenameCsrToAgent1782446200000 implements MigrationInterface {
  name = 'RenameCsrToAgent1782446200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "tenant_users" SET "role" = 'agent' WHERE "role" = 'csr'`,
    );
    await queryRunner.query(
      `UPDATE "messages" SET "sender_type" = 'agent' WHERE "sender_type" = 'csr'`,
    );

    if (await queryRunner.hasColumn('subscription_plans', 'max_csrs')) {
      await queryRunner.query(
        `ALTER TABLE "subscription_plans" RENAME COLUMN "max_csrs" TO "max_agents"`,
      );
    }
    if (await queryRunner.hasColumn('tenants', 'custom_csr_limit')) {
      await queryRunner.query(
        `ALTER TABLE "tenants" RENAME COLUMN "custom_csr_limit" TO "custom_agent_limit"`,
      );
    }
    if (await queryRunner.hasColumn('tenant_analytics', 'active_csrs')) {
      await queryRunner.query(
        `ALTER TABLE "tenant_analytics" RENAME COLUMN "active_csrs" TO "active_agents"`,
      );
    }
    if (await queryRunner.hasColumn('conversations', 'assigned_csr_id')) {
      await queryRunner.query(
        `ALTER TABLE "conversations" RENAME COLUMN "assigned_csr_id" TO "assigned_agent_id"`,
      );
    }
    if (await queryRunner.hasColumn('conversations', 'last_csr_response_at')) {
      await queryRunner.query(
        `ALTER TABLE "conversations" RENAME COLUMN "last_csr_response_at" TO "last_agent_response_at"`,
      );
    }
    if (await queryRunner.hasTable('csr_analytics')) {
      await queryRunner.query(
        `ALTER TABLE "csr_analytics" RENAME TO "agent_analytics"`,
      );
    }
    if (await queryRunner.hasColumn('agent_analytics', 'csr_id')) {
      await queryRunner.query(
        `ALTER TABLE "agent_analytics" RENAME COLUMN "csr_id" TO "agent_id"`,
      );
    }

    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_conversations_csr_id" RENAME TO "idx_conversations_agent_id"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_csr_analytics_tenant_csr_date" RENAME TO "idx_agent_analytics_tenant_agent_date"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_online_csrs" RENAME TO "idx_online_agents"`,
    );

    // Views/functions: rebuild bodies so embedded `csr` identifiers and
    // literals become `agent`. Skipped silently when the objects don't exist
    // (they are reference-schema only in current installs).
    await queryRunner.query(`
      DO $$
      DECLARE
        vdef TEXT;
      BEGIN
        SELECT definition INTO vdef
        FROM pg_views
        WHERE schemaname = 'public'
          AND viewname = 'csr_performance_summary';
        IF vdef IS NOT NULL THEN
          vdef := REPLACE(REPLACE(vdef, 'csr', 'agent'), 'Csr', 'Agent');
          EXECUTE 'DROP VIEW IF EXISTS agent_performance_summary';
          EXECUTE 'CREATE VIEW agent_performance_summary AS ' || vdef;
          EXECUTE 'DROP VIEW IF EXISTS csr_performance_summary';
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
        newdef TEXT;
      BEGIN
        FOR r IN
          SELECT oid FROM pg_proc
          WHERE proname = 'get_csr_performance_stats'
        LOOP
          newdef := pg_get_functiondef(r.oid);
          newdef := REPLACE(REPLACE(newdef, 'csr', 'agent'), 'Csr', 'Agent');
          EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure;
          EXECUTE newdef;
        END LOOP;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
        newdef TEXT;
      BEGIN
        FOR r IN
          SELECT oid FROM pg_proc
          WHERE proname = 'get_agent_performance_stats'
        LOOP
          newdef := pg_get_functiondef(r.oid);
          newdef := REPLACE(REPLACE(newdef, 'agent', 'csr'), 'Agent', 'Csr');
          EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure;
          EXECUTE newdef;
        END LOOP;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      DECLARE
        vdef TEXT;
      BEGIN
        SELECT definition INTO vdef
        FROM pg_views
        WHERE schemaname = 'public'
          AND viewname = 'agent_performance_summary';
        IF vdef IS NOT NULL THEN
          vdef := REPLACE(REPLACE(vdef, 'agent', 'csr'), 'Agent', 'Csr');
          EXECUTE 'DROP VIEW IF EXISTS csr_performance_summary';
          EXECUTE 'CREATE VIEW csr_performance_summary AS ' || vdef;
          EXECUTE 'DROP VIEW IF EXISTS agent_performance_summary';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_online_agents" RENAME TO "idx_online_csrs"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_agent_analytics_tenant_agent_date" RENAME TO "idx_csr_analytics_tenant_csr_date"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_conversations_agent_id" RENAME TO "idx_conversations_csr_id"`,
    );

    if (await queryRunner.hasColumn('agent_analytics', 'agent_id')) {
      await queryRunner.query(
        `ALTER TABLE "agent_analytics" RENAME COLUMN "agent_id" TO "csr_id"`,
      );
    }
    if (await queryRunner.hasTable('agent_analytics')) {
      await queryRunner.query(
        `ALTER TABLE "agent_analytics" RENAME TO "csr_analytics"`,
      );
    }
    if (
      await queryRunner.hasColumn('conversations', 'last_agent_response_at')
    ) {
      await queryRunner.query(
        `ALTER TABLE "conversations" RENAME COLUMN "last_agent_response_at" TO "last_csr_response_at"`,
      );
    }
    if (await queryRunner.hasColumn('conversations', 'assigned_agent_id')) {
      await queryRunner.query(
        `ALTER TABLE "conversations" RENAME COLUMN "assigned_agent_id" TO "assigned_csr_id"`,
      );
    }
    if (await queryRunner.hasColumn('tenant_analytics', 'active_agents')) {
      await queryRunner.query(
        `ALTER TABLE "tenant_analytics" RENAME COLUMN "active_agents" TO "active_csrs"`,
      );
    }
    if (await queryRunner.hasColumn('tenants', 'custom_agent_limit')) {
      await queryRunner.query(
        `ALTER TABLE "tenants" RENAME COLUMN "custom_agent_limit" TO "custom_csr_limit"`,
      );
    }
    if (await queryRunner.hasColumn('subscription_plans', 'max_agents')) {
      await queryRunner.query(
        `ALTER TABLE "subscription_plans" RENAME COLUMN "max_agents" TO "max_csrs"`,
      );
    }

    await queryRunner.query(
      `UPDATE "messages" SET "sender_type" = 'csr' WHERE "sender_type" = 'agent'`,
    );
    await queryRunner.query(
      `UPDATE "tenant_users" SET "role" = 'csr' WHERE "role" = 'agent'`,
    );
  }
}
