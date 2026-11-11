import type { QueryRunner } from 'typeorm';
import { AddTenantStorageCapacityState1782444400000 } from '../migrations/1782444400000-AddTenantStorageCapacityState';

type TestQueryRunner = {
  query: jest.Mock<Promise<unknown>, [string]>;
};

describe('AddTenantStorageCapacityState1782444400000', () => {
  it('adds the additive reporting-state column without rewriting tenant data', async () => {
    const queryRunner: TestQueryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await new AddTenantStorageCapacityState1782444400000().up(
      queryRunner as unknown as QueryRunner,
    );

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => statement)
      .join('\n');
    expect(sql).toContain('ALTER TABLE "tenants"');
    expect(sql).toContain(
      'ADD COLUMN "storage_capacity_state" jsonb NOT NULL DEFAULT \'{}\'',
    );
    expect(sql).not.toMatch(/UPDATE\s+"tenants"/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
  });

  it('can remove only the additive column on rollback', async () => {
    const queryRunner: TestQueryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await new AddTenantStorageCapacityState1782444400000().down(
      queryRunner as unknown as QueryRunner,
    );

    expect(queryRunner.query).toHaveBeenCalledWith(
      'ALTER TABLE "tenants" DROP COLUMN "storage_capacity_state"',
    );
  });
});
