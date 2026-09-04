import { ServiceUnavailableException } from '@nestjs/common';
import { StorageCapacityReservation } from './storage-capacity-reservation';

describe('StorageCapacityReservation', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRedisUrl = process.env.REDIS_URL;
  const originalRedisHost = process.env.REDIS_HOST;
  const originalRedisPort = process.env.REDIS_PORT;
  const originalCapacityRedisUrl = process.env.STORAGE_CAPACITY_REDIS_URL;

  afterEach(() => {
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('REDIS_URL', originalRedisUrl);
    restoreEnv('REDIS_HOST', originalRedisHost);
    restoreEnv('REDIS_PORT', originalRedisPort);
    restoreEnv('STORAGE_CAPACITY_REDIS_URL', originalCapacityRedisUrl);
  });

  it('serializes same-tenant local reservations in non-production', async () => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.STORAGE_CAPACITY_REDIS_URL;
    process.env.NODE_ENV = 'test';
    const reservation = new StorageCapacityReservation(false);
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = reservation.run('tenant-1', async () => {
      order.push('first-start');
      await firstBlocked;
      order.push('first-end');
      return 'first';
    });
    const second = reservation.run('tenant-1', () => {
      order.push('second');
      return Promise.resolve('second');
    });

    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    releaseFirst();
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(order).toEqual(['first-start', 'first-end', 'second']);
    await reservation.close();
  });

  it('reports production readiness as false without a Redis reservation backend', async () => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.STORAGE_CAPACITY_REDIS_URL;
    process.env.NODE_ENV = 'production';
    const reservation = new StorageCapacityReservation(true);

    await expect(reservation.checkReady()).resolves.toBe(false);
    await reservation.close();
  });

  it('fails closed in production without a Redis reservation backend', async () => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.STORAGE_CAPACITY_REDIS_URL;
    process.env.NODE_ENV = 'production';
    const reservation = new StorageCapacityReservation(true);

    await expect(
      reservation.run('tenant-1', () => Promise.resolve('unsafe')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await reservation.close();
  });

  it('fails readiness when a configured Redis endpoint is unreachable', async () => {
    delete process.env.REDIS_URL;
    delete process.env.STORAGE_CAPACITY_REDIS_URL;
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '1';
    const reservation = new StorageCapacityReservation(true);

    await expect(reservation.checkReady(100)).resolves.toBe(false);
    await reservation.close();
  });

  it('builds a Redis URL from the existing shared host and port contract', () => {
    delete process.env.REDIS_URL;
    delete process.env.STORAGE_CAPACITY_REDIS_URL;
    process.env.REDIS_HOST = 'redis.internal';
    process.env.REDIS_PORT = '6380';
    const reservation = new StorageCapacityReservation(true);

    const redisUrl = (
      reservation as unknown as { redisUrl(): string }
    ).redisUrl();
    expect(redisUrl).toBe('redis://redis.internal:6380');
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
