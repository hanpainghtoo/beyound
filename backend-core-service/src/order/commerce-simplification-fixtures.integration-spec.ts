import { execFileSync } from 'node:child_process';
import { URL } from 'node:url';
import { DataSource } from 'typeorm';

const connection = process.env.TEST_DATABASE_URL;
if (!connection)
  throw new Error('TEST_DATABASE_URL is required for integration tests');
const parsed = new URL(connection);
if (parsed.pathname !== '/zayos_commerce_test')
  throw new Error('Refusing fixture test outside zayos_commerce_test');

describe('commerce simplification fixtures (real PostgreSQL)', () => {
  let dataSource: DataSource;
  beforeAll(async () => {
    process.env.DB_HOST = parsed.hostname;
    process.env.DB_PORT = parsed.port || '5432';
    process.env.DB_USERNAME = decodeURIComponent(parsed.username);
    process.env.DB_PASSWORD = decodeURIComponent(parsed.password);
    process.env.DB_NAME = 'zayos_commerce_test';
    process.env.DB_SYNCHRONIZE = 'false';
    process.env.NODE_ENV = 'test';
    const module = await import('../database/data-source');
    dataSource = module.AppDataSource;
    await dataSource.initialize();
  });
  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('loads one complete modern commerce fixture set after migrations', () => {
    execFileSync(
      'psql',
      [
        connection,
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        'scripts/commerce-simplification-fixtures.sql',
      ],
      { cwd: process.cwd(), stdio: 'pipe' },
    );
    return dataSource
      .query(
        `SELECT t.tenant_code, count(DISTINCT o.id)::int AS orders, count(DISTINCT oi.id)::int AS items, count(DISTINCT r.id)::int AS reservations, count(DISTINCT p.id)::int AS products FROM tenants t JOIN orders o ON o.tenant_id = t.id JOIN order_items oi ON oi.order_id = o.id LEFT JOIN order_item_reservations r ON r.tenant_id = t.id JOIN products p ON p.tenant_id = t.id WHERE t.tenant_code LIKE 'commerce-fixture-%' GROUP BY t.tenant_code ORDER BY t.tenant_code DESC LIMIT 1`,
      )
      .then(
        (
          rows: Array<{
            orders: number;
            items: number;
            reservations: number;
            products: number;
          }>,
        ) => {
          expect(rows[0].orders).toBe(5);
          expect(rows[0].items).toBe(5);
          expect(rows[0].reservations).toBe(1);
          expect(rows[0].products).toBe(2);
        },
      );
  });
});
