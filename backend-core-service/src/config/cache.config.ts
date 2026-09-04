import { registerAs } from '@nestjs/config';
import type { CacheModuleAsyncOptions } from '@nestjs/cache-manager';

export const cacheConfig = registerAs('cache', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  ttl: Number.parseInt(process.env.CACHE_TTL || '300', 10), // 5 minutes
}));

export const cacheAsyncConfig: CacheModuleAsyncOptions = {
  useFactory: () => ({
    store: 'redis',
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10) || 6379,
    password: process.env.REDIS_PASSWORD,
    ttl: Number.parseInt(process.env.CACHE_TTL || '300', 10) || 300,
  }),
};
