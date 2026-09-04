import { registerAs } from '@nestjs/config';
import type { ThrottlerAsyncOptions } from '@nestjs/throttler';
import { DataSource } from 'typeorm';

import { PostgresThrottlerStorage } from './postgres-throttler-storage';

export const throttlerConfig = registerAs('throttler', () => ({
  ttl: Number.parseInt(process.env.THROTTLE_TTL || '60000', 10) || 60000, // 1 minute
  limit: Number.parseInt(process.env.THROTTLE_LIMIT || '100', 10) || 100, // 100 requests per minute
}));

export const throttlerAsyncConfig: ThrottlerAsyncOptions = {
  inject: [DataSource],
  useFactory: (dataSource: DataSource) => ({
    storage: new PostgresThrottlerStorage(dataSource),
    throttlers: [
      {
        ttl: Number.parseInt(process.env.THROTTLE_TTL || '60000', 10) || 60000,
        limit: Number.parseInt(process.env.THROTTLE_LIMIT || '100', 10) || 100,
      },
    ],
  }),
};
