import type { QueryRunner } from 'typeorm';
import { AddStage1OrderInfrastructure1782447200000 } from '../migrations/1782447200000-AddStage1OrderInfrastructure';

describe('Stage 1 order infrastructure migration', () => {
  it('adds infrastructure without rewriting historical orders or statuses', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve([]);
      }),
    };

    await new AddStage1OrderInfrastructure1782447200000().up(
      queryRunner as unknown as QueryRunner,
    );

    const all = queries.join('\n');
    expect(all).toContain('reservation_managed');
    expect(all).toContain('expires_at');
    expect(all).toContain('tenant_order_counters');
    expect(all).toContain('MAX(NULLIF(regexp_replace(o."order_number"');
    expect(all).toContain("'[^0-9]'");
    expect(all).toContain('order_item_reservations');
    expect(all).toContain('stock_movements');
    expect(all).toContain('ON CONFLICT ("tenant_id") DO NOTHING');
    expect(all).not.toMatch(/UPDATE\s+"orders"/i);
    expect(all).not.toMatch(/SET\s+"status"/i);
  });

  it('creates the production-safety uniqueness and reservation constraints', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve([]);
      }),
    };
    await new AddStage1OrderInfrastructure1782447200000().up(
      queryRunner as unknown as QueryRunner,
    );
    const all = queries.join('\n');
    expect(all).toContain('UQ_orders_tenant_order_number');
    expect(all).toContain('UQ_order_item_reservations_item_kind');
    expect(all).toContain("state\" IN ('active', 'converted', 'released')");
    expect(all).toContain('delta" <> 0');
  });
});
