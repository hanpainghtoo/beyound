import type { ThrottlerStorage } from '@nestjs/throttler';
import type { DataSource, EntityManager } from 'typeorm';

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

function secondsUntil(date: Date | null, fallbackMs: number) {
  if (!date) return Math.ceil(fallbackMs / 1000);
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
}

export class PostgresThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly dataSource: DataSource) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      return await this.dataSource.transaction(async (manager) =>
        this.incrementWithinTransaction(
          manager,
          key,
          ttl,
          limit,
          blockDuration || ttl,
          throttlerName,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[PostgresThrottlerStorage] Failed to increment throttle record ` +
          `for key="${key}" throttler="${throttlerName}" limit=${limit} ttl=${ttl}: ${message}. ` +
          `Falling back to permissive non-blocking response.`,
      );
      const fallbackExpires = new Date(Date.now() + ttl);
      return {
        totalHits: 1,
        timeToExpire: secondsUntil(fallbackExpires, ttl),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  private async incrementWithinTransaction(
    manager: EntityManager,
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl);
    const selected = await manager.query(
      `
        SELECT total_hits, expires_at, is_blocked, block_expires_at
        FROM throttler_rate_limits
        WHERE storage_key = $1 AND throttler_name = $2
        FOR UPDATE
      `,
      [key, throttlerName],
    );

    const row = selected[0];
    if (!row || new Date(row.expires_at).getTime() <= now.getTime()) {
      await manager.query(
        `
          INSERT INTO throttler_rate_limits
            (storage_key, throttler_name, total_hits, expires_at, is_blocked, block_expires_at, created_at, updated_at)
          VALUES ($1, $2, 1, $3, false, NULL, now(), now())
          ON CONFLICT (storage_key, throttler_name)
          DO UPDATE SET total_hits = 1, expires_at = $3, is_blocked = false, block_expires_at = NULL, updated_at = now()
        `,
        [key, throttlerName, expiresAt],
      );
      return {
        totalHits: 1,
        timeToExpire: secondsUntil(expiresAt, ttl),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }

    const blockExpiresAt = row.block_expires_at
      ? new Date(row.block_expires_at)
      : null;
    if (
      row.is_blocked &&
      blockExpiresAt &&
      blockExpiresAt.getTime() > now.getTime()
    ) {
      return {
        totalHits: Number(row.total_hits),
        timeToExpire: secondsUntil(new Date(row.expires_at), ttl),
        isBlocked: true,
        timeToBlockExpire: secondsUntil(blockExpiresAt, blockDuration),
      };
    }

    const totalHits = Number(row.total_hits) + 1;
    const shouldBlock = totalHits > limit;
    const nextBlockExpiresAt = shouldBlock
      ? new Date(now.getTime() + blockDuration)
      : null;
    await manager.query(
      `
        UPDATE throttler_rate_limits
        SET total_hits = $3, is_blocked = $4, block_expires_at = $5, updated_at = now()
        WHERE storage_key = $1 AND throttler_name = $2
      `,
      [key, throttlerName, totalHits, shouldBlock, nextBlockExpiresAt],
    );

    return {
      totalHits,
      timeToExpire: secondsUntil(new Date(row.expires_at), ttl),
      isBlocked: shouldBlock,
      timeToBlockExpire: shouldBlock
        ? secondsUntil(nextBlockExpiresAt, blockDuration)
        : 0,
    };
  }
}
