import { AddAdminActivationAndUpgradeSchema1782444800000 } from '../migrations/1782444800000-AddAdminActivationAndUpgradeSchema';
import type { QueryRunner } from 'typeorm';

type TestQueryRunner = {
  queries: string[];
  query: jest.Mock<Promise<unknown[]>, [string]>;
};

function createQueryRunner(): TestQueryRunner {
  const queries: string[] = [];
  return {
    queries,
    query: jest.fn((sql: string): Promise<unknown[]> => {
      queries.push(sql);
      return Promise.resolve([]);
    }),
  };
}

describe('AddAdminActivationAndUpgradeSchema migration', () => {
  it('adds admin activation fields, upgrade revisions, plan type fields, and event types', async () => {
    const migration = new AddAdminActivationAndUpgradeSchema1782444800000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain(
      `ADD "admin_activation_status" character varying(40) NOT NULL DEFAULT 'approved'`,
    );
    expect(all).toContain('CHK_subscription_period_admin_activation');
    expect(all).toContain('ADD "admin_activated_at" TIMESTAMP WITH TIME ZONE');
    expect(all).toContain('ADD "admin_activated_by" uuid');
    expect(all).toContain(
      'ADD "admin_activation_reason" character varying(240)',
    );
    expect(all).toContain(
      'CREATE TABLE "subscription_period_upgrade_revisions"',
    );
    expect(all).toContain('UQ_subscription_upgrade_revisions_period');
    expect(all).toContain(
      `ADD "plan_type" character varying(20) NOT NULL DEFAULT 'business'`,
    );
    expect(all).toContain('CHK_subscription_plan_type');
    expect(all).toContain('ADD "requestable" boolean NOT NULL DEFAULT true');
    expect(all).toContain('ADD "renewable" boolean NOT NULL DEFAULT true');
    expect(all).toContain('ADD "top_up_allowed" boolean NOT NULL DEFAULT true');
    expect(all).toContain('ADD "auto_approve" boolean NOT NULL DEFAULT false');
    expect(all).toContain('period_admin_activation_approved');
    expect(all).toContain('upgrade_revision_created');
    expect(all).toContain('upgrade_stale');
  });

  it('is additive — it never rewrites existing rows', async () => {
    const migration = new AddAdminActivationAndUpgradeSchema1782444800000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    // Only ALTER ADD / CREATE — no UPDATE of existing data, no drops of
    // existing columns or tables, and the one-active invariant preflight runs.
    expect(all).not.toMatch(/UPDATE\s+"tenant_subscription_periods"/i);
    expect(all).not.toMatch(/UPDATE\s+"subscription_plans"/i);
    expect(all).not.toContain('DROP COLUMN');
    expect(all).not.toContain('DROP TABLE');
  });

  it('fails closed when duplicate active periods already exist', async () => {
    const queryRunner = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ tenant_id: 'tenant-1', count: 2 }]),
    } as any;
    const migration = new AddAdminActivationAndUpgradeSchema1782444800000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'reconcile duplicate active subscription periods first',
    );
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
  });

  it('documents rollback by dropping the new schema only', async () => {
    const migration = new AddAdminActivationAndUpgradeSchema1782444800000();
    const queryRunner = createQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('DROP TABLE "subscription_period_upgrade_revisions"');
    expect(all).toContain('DROP COLUMN "admin_activation_status"');
    expect(all).toContain('DROP COLUMN "plan_type"');
    expect(all).toContain('DROP COLUMN "auto_approve"');
  });
});
