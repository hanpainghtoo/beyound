import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  telegramSessionKey,
  type TelegramBotUpdate,
  type TelegramSessionState,
} from './telegram-bot.types';

const SESSION_TTL_SECONDS = Number(
  process.env.TELEGRAM_SESSION_TTL_SECONDS || 30 * 60,
);
const UPDATE_SCRIPT = `
local version = redis.call('HGET', KEYS[1], 'version')
if version ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'version', ARGV[2], 'state', ARGV[3], 'data', ARGV[4], 'expiresAt', ARGV[5])
redis.call('EXPIRE', KEYS[1], ARGV[6])
return 1
`;
const SET_SCRIPT = `
redis.call('HSET', KEYS[1], 'version', ARGV[1], 'state', ARGV[2], 'data', ARGV[3], 'expiresAt', ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[5])
return 1
`;

type RedisSessionClient = {
  connect(): Promise<void>;
  quit(): Promise<string>;
  hGetAll(key: string): Promise<Record<string, string>>;
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<number>;
};

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class TelegramSessionService implements OnModuleDestroy {
  private readonly client: RedisSessionClient;

  constructor(@Inject(REDIS_CLIENT) client: RedisSessionClient) {
    this.client = client;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get(update: TelegramBotUpdate): Promise<TelegramSessionState | null> {
    const values = await this.client.hGetAll(telegramSessionKey(update));
    if (!values.version) return null;
    return {
      version: Number(values.version),
      state: values.state,
      data: JSON.parse(values.data || '{}') as Record<string, unknown>,
      expiresAt: values.expiresAt,
    };
  }

  async set(
    update: TelegramBotUpdate,
    state: Omit<TelegramSessionState, 'expiresAt'>,
  ) {
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_SECONDS * 1000,
    ).toISOString();
    const value = { ...state, expiresAt };
    const key = telegramSessionKey(update);
    await this.client.eval(SET_SCRIPT, {
      keys: [key],
      arguments: [
        String(value.version),
        value.state,
        JSON.stringify(value.data),
        expiresAt,
        String(SESSION_TTL_SECONDS),
      ],
    });
    return value;
  }

  async compareAndSet(
    update: TelegramBotUpdate,
    expectedVersion: number,
    next: Omit<TelegramSessionState, 'expiresAt'>,
  ) {
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_SECONDS * 1000,
    ).toISOString();
    const result = await this.client.eval(UPDATE_SCRIPT, {
      keys: [telegramSessionKey(update)],
      arguments: [
        String(expectedVersion),
        String(next.version),
        next.state,
        JSON.stringify(next.data),
        expiresAt,
        String(SESSION_TTL_SECONDS),
      ],
    });
    return Number(result) === 1 ? { ...next, expiresAt } : null;
  }

  async clear(update: TelegramBotUpdate) {
    await this.client.eval("return redis.call('DEL', KEYS[1])", {
      keys: [telegramSessionKey(update)],
      arguments: [],
    });
  }

  async allowCallback(update: TelegramBotUpdate, limit = 5) {
    const result = await this.client.eval(
      `local count = redis.call('INCR', KEYS[1])
       if count == 1 then redis.call('EXPIRE', KEYS[1], 1) end
       return count`,
      {
        keys: [`telegram:callback-rate:${telegramSessionKey(update)}`],
        arguments: [],
      },
    );
    return Number(result) <= limit;
  }
}
