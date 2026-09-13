import { PostgresThrottlerStorage } from './postgres-throttler-storage';

function createStorage(rows: any[] = []) {
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('SELECT total_hits')) return rows;
    if (sql.includes('INSERT INTO throttler_rate_limits')) {
      rows[0] = {
        total_hits: 1,
        expires_at: params[2],
        is_blocked: false,
        block_expires_at: null,
      };
    }
    if (sql.includes('UPDATE throttler_rate_limits')) {
      rows[0] = {
        ...rows[0],
        total_hits: params[2],
        is_blocked: params[3],
        block_expires_at: params[4],
      };
    }
    return [];
  });
  const dataSource = {
    transaction: jest.fn(async (callback) => callback({ query })),
  };

  return {
    storage: new PostgresThrottlerStorage(dataSource as any),
    dataSource,
    query,
    rows,
  };
}

describe('PostgresThrottlerStorage', () => {
  it('stores counters through a database transaction', async () => {
    const { storage, dataSource, query } = createStorage();

    const result = await storage.increment(
      'ip:email',
      60_000,
      5,
      60_000,
      'registration',
    );

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [
      'ip:email',
      'registration',
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO throttler_rate_limits'),
      ['ip:email', 'registration', expect.any(Date)],
    );
    expect(result).toMatchObject({ totalHits: 1, isBlocked: false });
  });

  it('blocks once the shared database counter exceeds the limit', async () => {
    const { storage } = createStorage([
      {
        total_hits: 5,
        expires_at: new Date(Date.now() + 60_000),
        is_blocked: false,
        block_expires_at: null,
      },
    ]);

    const result = await storage.increment(
      'ip:email',
      60_000,
      5,
      120_000,
      'registration',
    );

    expect(result.totalHits).toBe(6);
    expect(result.isBlocked).toBe(true);
    expect(result.timeToBlockExpire).toBeGreaterThan(0);
  });

  it('honors an existing blocked counter across service instances', async () => {
    const { storage } = createStorage([
      {
        total_hits: 6,
        expires_at: new Date(Date.now() + 60_000),
        is_blocked: true,
        block_expires_at: new Date(Date.now() + 120_000),
      },
    ]);

    const result = await storage.increment(
      'ip:email',
      60_000,
      5,
      120_000,
      'registration',
    );

    expect(result).toMatchObject({ totalHits: 6, isBlocked: true });
  });
});
