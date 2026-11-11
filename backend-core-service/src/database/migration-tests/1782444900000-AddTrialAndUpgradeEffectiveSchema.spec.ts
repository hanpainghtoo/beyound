import { AddTrialAndUpgradeEffectiveSchema1782444900000 } from '../migrations/1782444900000-AddTrialAndUpgradeEffectiveSchema';
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

describe('AddTrialAndUpgradeEffectiveSchema migration', () => {
  it('adds not_required payment, conversion linkage, split active indexes, usage revision, and event types', async () => {
    const migration = new AddTrialAndUpgradeEffectiveSchema1782444900000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    // 1.1 payment status
    expect(all).toContain('not_required');
    expect(all).toContain('CHK_subscription_period_payment_status');
    // 1.2 conversion linkage
    expect(all).toContain('ADD "converted_to_period_id" uuid');
    expect(all).toContain('ADD "converted_from_period_id" uuid');
    expect(all).toContain('FK_subscription_periods_converted_to');
    expect(all).toContain('FK_subscription_periods_converted_from');
    // 1.3 split active indexes
    expect(all).toContain('DROP INDEX "UQ_subscription_periods_one_active"');
    expect(all).toContain('UQ_subscription_periods_one_active_paid');
    expect(all).toContain('UQ_subscription_periods_one_active_trial');
    // 1.8 usage-boundary linkage
    expect(all).toContain('ADD "upgrade_revision_id" uuid');
    expect(all).toContain('IDX_tenant_usage_events_upgrade_revision');
    expect(all).toContain('FK_tenant_usage_events_upgrade_revision');
    // 1.4 event types
    expect(all).toContain('trial_period_created');
    expect(all).toContain('trial_period_expired');
    expect(all).toContain('trial_conversion_requested');
    expect(all).toContain('trial_conversion_payment_confirmed');
    expect(all).toContain('trial_conversion_approved');
    expect(all).toContain('trial_period_closed_on_conversion');
    expect(all).toContain('trial_conversion_stale');
    expect(all).toContain('upgrade_effective_applied');
  });

  it('is additive — it never rewrites existing rows', async () => {
    const migration = new AddTrialAndUpgradeEffectiveSchema1782444900000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).not.toMatch(/UPDATE\s+"tenant_subscription_periods"/i);
    expect(all).not.toMatch(/UPDATE\s+"tenant_usage_events"/i);
    expect(all).not.toContain('DROP COLUMN');
    expect(all).not.toContain('DROP TABLE');
  });

  it('fails closed when duplicate active paid periods already exist', async () => {
    const queryRunner = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ tenant_id: 'tenant-1', count: 2 }]),
    } as any;
    const migration = new AddTrialAndUpgradeEffectiveSchema1782444900000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'reconcile duplicate active paid subscription periods first',
    );
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
  });

  it('fails closed when duplicate active trial periods already exist', async () => {
    const queryRunner = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ tenant_id: 'tenant-1', count: 2 }]),
    } as any;
    const migration = new AddTrialAndUpgradeEffectiveSchema1782444900000();

    await expect(migration.up(queryRunner)).rejects.toThrow(
      'reconcile duplicate active trial subscription periods first',
    );
    expect(queryRunner.query).toHaveBeenCalledTimes(2);
  });

  it('rolls back by dropping the new schema only', async () => {
    const migration = new AddTrialAndUpgradeEffectiveSchema1782444900000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);
    queryRunner.queries.length = 0;
    await migration.down(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain(
      'DROP CONSTRAINT "FK_tenant_usage_events_upgrade_revision"',
    );
    expect(all).toContain(
      'DROP INDEX "UQ_subscription_periods_one_active_trial"',
    );
    expect(all).toContain(
      'DROP INDEX "UQ_subscription_periods_one_active_paid"',
    );
    expect(all).toContain(
      'CREATE UNIQUE INDEX "UQ_subscription_periods_one_active"',
    );
    expect(all).toContain(
      'DROP CONSTRAINT "FK_subscription_periods_converted_to"',
    );
    expect(all).toContain(
      'DROP CONSTRAINT "FK_subscription_periods_converted_from"',
    );
    expect(all).toContain('DROP COLUMN "upgrade_revision_id"');
    // The restored payment check excludes not_required.
    expect(all).toContain(
      `CHECK ("payment_status" IN ('pending', 'paid', 'failed', 'refunded'))`,
    );
  });
});
