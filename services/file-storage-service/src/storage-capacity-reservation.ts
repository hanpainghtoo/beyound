import { randomUUID } from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { createClient } from 'redis';

type RedisClient = {
  isOpen: boolean;
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  set(
    key: string,
    value: string,
    options: { NX: true; PX: number },
  ): Promise<string | null>;
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
  ping(): Promise<string>;
};

type ReservationTask<T> = (assertLease: () => Promise<void>) => Promise<T>;

const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const RENEW_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

/**
 * Serializes capacity check + metadata registration per tenant. Production
 * requires Redis so separate file-storage processes cannot race each other.
 */
export class StorageCapacityReservation {
  private readonly localQueues = new Map<string, Promise<void>>();
  private readonly client?: RedisClient;
  private connectPromise?: Promise<RedisClient>;

  constructor(
    private readonly isProduction = process.env.NODE_ENV === 'production',
  ) {
    if (this.redisConfigured()) {
      const client = createClient({
        url: this.redisUrl(),
        socket: {
          connectTimeout: 1_500,
          reconnectStrategy: false,
        },
      });
      client.on('error', (error) => {
        if (!this.isProduction) return;
        console.error(
          JSON.stringify({
            event: 'storage_capacity_redis_error',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      });
      this.client = client as unknown as RedisClient;
    }
  }

  async run<T>(tenantId: string, task: ReservationTask<T>): Promise<T> {
    if (this.client) {
      return this.runWithRedis(tenantId, task);
    }

    if (this.isProduction) {
      throw new ServiceUnavailableException(
        'A Redis storage-capacity reservation backend is required in production',
      );
    }

    return this.runLocally(tenantId, task);
  }

  async close() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  async checkReady(timeoutMs = 1_500) {
    if (!this.isProduction) return true;
    if (!this.client) return false;

    try {
      const client = await this.withTimeout(this.getClient(), timeoutMs);
      await this.withTimeout(client.ping(), timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  private async runWithRedis<T>(tenantId: string, task: ReservationTask<T>) {
    let client: RedisClient;
    try {
      client = await this.getClient();
    } catch {
      if (!this.isProduction) return this.runLocally(tenantId, task);
      throw new ServiceUnavailableException(
        'Storage-capacity reservation backend is unavailable',
      );
    }

    const key = `commerce-os:storage-capacity:${tenantId}`;
    const token = randomUUID();
    let acquired = false;
    try {
      acquired = await this.acquire(client, key, token);
    } catch {
      throw new ServiceUnavailableException(
        'Storage-capacity reservation backend is unavailable',
      );
    }
    if (!acquired) {
      throw new ServiceUnavailableException(
        'Storage-capacity reservation is temporarily busy',
      );
    }

    const renewal = this.startRenewal(client, key, token);
    try {
      return await task(renewal.assertLease);
    } finally {
      clearInterval(renewal.interval);
      try {
        await client.eval(RELEASE_SCRIPT, {
          keys: [key],
          arguments: [token],
        });
      } catch (error) {
        console.error(
          JSON.stringify({
            event: 'storage_capacity_reservation_release_failed',
            tenantId,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  }

  private async runLocally<T>(tenantId: string, task: ReservationTask<T>) {
    const previous = this.localQueues.get(tenantId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.localQueues.set(tenantId, queued);
    await previous;

    try {
      return await task(() => Promise.resolve());
    } finally {
      release();
      if (this.localQueues.get(tenantId) === queued) {
        this.localQueues.delete(tenantId);
      }
    }
  }

  private async acquire(client: RedisClient, key: string, token: string) {
    const result = await client.set(key, token, {
      NX: true,
      PX: this.lockTtlMs(),
    });
    return result === 'OK';
  }

  private startRenewal(client: RedisClient, key: string, token: string) {
    let lost = false;
    const assertLease = () => {
      if (lost) {
        return Promise.reject(
          new ServiceUnavailableException(
            'Storage-capacity reservation lease was lost before registration',
          ),
        );
      }
      return Promise.resolve();
    };
    const interval = setInterval(
      () => {
        void client
          .eval(RENEW_SCRIPT, {
            keys: [key],
            arguments: [token, String(this.lockTtlMs())],
          })
          .then((result) => {
            if (result === 1) return;
            lost = true;
          })
          .catch((error) => {
            lost = true;
            if (!this.isProduction) return;
            console.error(
              JSON.stringify({
                event: 'storage_capacity_reservation_renewal_failed',
                message: error instanceof Error ? error.message : String(error),
              }),
            );
          });
      },
      Math.max(1_000, Math.floor(this.lockTtlMs() / 3)),
    );
    interval.unref?.();
    return { interval, assertLease };
  }

  private async getClient() {
    if (!this.client) {
      throw new Error('Redis is not configured');
    }
    if (this.client.isOpen) return this.client;
    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().then(() => this.client!);
    }
    return this.connectPromise;
  }

  private redisConfigured() {
    return Boolean(
      process.env.STORAGE_CAPACITY_REDIS_URL ||
        process.env.REDIS_URL ||
        process.env.REDIS_HOST,
    );
  }

  private redisUrl() {
    if (process.env.STORAGE_CAPACITY_REDIS_URL) {
      return process.env.STORAGE_CAPACITY_REDIS_URL;
    }
    if (process.env.REDIS_URL) return process.env.REDIS_URL;
    return `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(new Error('Storage-capacity Redis readiness timed out')),
            timeoutMs,
          );
          timeout.unref?.();
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private lockTtlMs() {
    const ttl = Number(process.env.STORAGE_CAPACITY_LOCK_TTL_MS || 30_000);
    return Number.isFinite(ttl) && ttl >= 1_000 ? Math.floor(ttl) : 30_000;
  }
}
