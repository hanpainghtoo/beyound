import {
  RedisWebhookConnection,
  RedisWebhookEventQueue,
  RedisWebhookIdempotencyStore,
  WebhookEventQueue,
  WebhookIdempotencyStore,
  buildRedisUrl,
} from './webhook-reliability';

describe('Webhook reliability helpers', () => {
  it('should claim webhook events only once', async () => {
    const store = new WebhookIdempotencyStore();

    await expect(store.claim('event-1')).resolves.toBe(true);
    await expect(store.claim('event-1')).resolves.toBe(false);
  });

  it('should release in-memory idempotency claims after failed enqueue', async () => {
    const store = new WebhookIdempotencyStore();

    await expect(store.claim('event-1')).resolves.toBe(true);
    await store.release('event-1');

    await expect(store.claim('event-1')).resolves.toBe(true);
  });

  it('should retry failed events and dead-letter after max attempts', async () => {
    const queue = new WebhookEventQueue({
      maxDepth: 10,
      maxAttempts: 2,
      retryBaseDelayMs: 0,
    });

    await queue.enqueue({
      eventId: 'event-1',
      provider: 'telegram',
      channelId: 'bot-1',
      payload: {},
    });

    await queue.drain(async () => {
      throw new Error('chat ingestion unavailable');
    });

    await expect(queue.getStats()).resolves.toMatchObject({
      backend: 'memory',
      pending: 0,
      deadLettered: 1,
    });
    await expect(queue.getDeadLetters()).resolves.toEqual([
      expect.objectContaining({
        eventId: 'event-1',
        attempts: 2,
        state: 'dead_lettered',
        lastError: 'chat ingestion unavailable',
        failureClass: 'retryable',
      }),
    ]);
  });

  it('should dead-letter terminal failures without exhausting attempts', async () => {
    const queue = new WebhookEventQueue({
      maxDepth: 10,
      maxAttempts: 3,
      retryBaseDelayMs: 0,
    });

    await queue.enqueue({
      eventId: 'event-terminal',
      provider: 'telegram',
      channelId: 'bot-1',
      payload: {},
    });

    await queue.drain(async () => {
      const error = new Error('bad payload') as Error & {
        terminal?: boolean;
        failureCode?: string;
      };
      error.terminal = true;
      error.failureCode = 'chat_ingestion_http_400_terminal';
      throw error;
    });

    await expect(queue.getDeadLetters()).resolves.toEqual([
      expect.objectContaining({
        eventId: 'event-terminal',
        attempts: 1,
        state: 'dead_lettered',
        failureClass: 'terminal',
        failureCode: 'chat_ingestion_http_400_terminal',
      }),
    ]);
  });

  it('should replay memory dead letters only once', async () => {
    const queue = new WebhookEventQueue({
      maxDepth: 10,
      maxAttempts: 1,
      retryBaseDelayMs: 0,
    });

    await queue.enqueue({
      eventId: 'event-replay',
      provider: 'telegram',
      channelId: 'bot-1',
      payload: {},
    });
    await queue.drain(async () => {
      throw new Error('chat ingestion unavailable');
    });

    await expect(queue.replayDeadLetter('event-replay')).resolves.toMatchObject({
      eventId: 'event-replay',
      attempts: 0,
      state: 'queued',
      lastError: undefined,
      failureClass: undefined,
      failureCode: undefined,
    });
    await expect(queue.replayDeadLetter('event-replay')).resolves.toBeNull();
    await expect(queue.getStats()).resolves.toMatchObject({
      pending: 1,
      deadLettered: 0,
    });
  });

  it('should enforce backpressure when queue depth is exceeded', async () => {
    const queue = new WebhookEventQueue({
      maxDepth: 1,
      maxAttempts: 1,
      retryBaseDelayMs: 0,
    });

    await queue.enqueue({
      eventId: 'event-1',
      provider: 'telegram',
      channelId: 'bot-1',
      payload: {},
    });

    await expect(
      queue.enqueue({
        eventId: 'event-2',
        provider: 'telegram',
        channelId: 'bot-1',
        payload: {},
      }),
    ).rejects.toThrow('Webhook queue depth exceeded 1');
  });

  it('should claim Redis idempotency keys only once', async () => {
    const connection = new RedisWebhookConnection(new FakeRedisClient() as any);
    const store = new RedisWebhookIdempotencyStore(connection, 1000, 'test:webhooks');

    await expect(store.claim('event-1')).resolves.toBe(true);
    await expect(store.claim('event-1')).resolves.toBe(false);
  });

  it('should release Redis idempotency claims after failed enqueue', async () => {
    const connection = new RedisWebhookConnection(new FakeRedisClient() as any);
    const store = new RedisWebhookIdempotencyStore(connection, 1000, 'test:webhooks');

    await expect(store.claim('event-1')).resolves.toBe(true);
    await store.release('event-1');

    await expect(store.claim('event-1')).resolves.toBe(true);
  });

  it('should close Redis connections during shutdown', async () => {
    const client = new FakeRedisClient();
    const connection = new RedisWebhookConnection(client as any);

    await connection.getClient();
    expect(client.isOpen).toBe(true);

    await connection.close();
    expect(client.isOpen).toBe(false);
  });

  it('should process Redis queued events and expose stats', async () => {
    const connection = new RedisWebhookConnection(new FakeRedisClient() as any);
    const queue = new RedisWebhookEventQueue(
      connection,
      {
        maxDepth: 10,
        maxAttempts: 2,
        retryBaseDelayMs: 0,
      },
      'test:webhooks',
    );

    await queue.enqueue({
      eventId: 'event-1',
      provider: 'telegram',
      channelId: 'bot-1',
      payload: { ok: true },
    });

    await queue.drain(async () => undefined);

    await expect(queue.getStats()).resolves.toMatchObject({
      backend: 'redis',
      pending: 0,
      processing: 0,
      retrying: 0,
      completed: 1,
      deadLettered: 0,
      oldestPendingAgeMs: 0,
      oldestDeadLetterAgeMs: 0,
    });
  });

  it('should requeue stale Redis processing events before draining', async () => {
    const client = new FakeRedisClient();
    const connection = new RedisWebhookConnection(client as any);
    const queue = new RedisWebhookEventQueue(
      connection,
      {
        maxDepth: 10,
        maxAttempts: 2,
        retryBaseDelayMs: 0,
      },
      'test:webhooks',
    );

    await queue.enqueue({
      eventId: 'event-1',
      provider: 'telegram',
      channelId: 'bot-1',
      payload: { ok: true },
    });
    await client.lMove('test:webhooks:pending', 'test:webhooks:processing', 'LEFT', 'RIGHT');
    await client.hSet(
      'test:webhooks:events',
      'event-1',
      JSON.stringify({
        eventId: 'event-1',
        provider: 'telegram',
        channelId: 'bot-1',
        payload: { ok: true },
        attempts: 1,
        maxAttempts: 2,
        state: 'processing',
        queuedAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }),
    );

    await queue.drain(async () => undefined);

    await expect(queue.getStats()).resolves.toMatchObject({
      backend: 'redis',
      pending: 0,
      processing: 0,
      completed: 1,
      deadLettered: 0,
    });
  });

  it('should dead-letter Redis queued events after max attempts', async () => {
    const connection = new RedisWebhookConnection(new FakeRedisClient() as any);
    const queue = new RedisWebhookEventQueue(
      connection,
      {
        maxDepth: 10,
        maxAttempts: 2,
        retryBaseDelayMs: 0,
      },
      'test:webhooks',
    );

    await queue.enqueue({
      eventId: 'event-1',
      provider: 'telegram',
      channelId: 'bot-1',
      payload: {},
    });

    await queue.drain(async () => {
      throw new Error('chat ingestion unavailable');
    });

    await expect(queue.getDeadLetters()).resolves.toEqual([
      expect.objectContaining({
        eventId: 'event-1',
        attempts: 2,
        state: 'dead_lettered',
        lastError: 'chat ingestion unavailable',
      }),
    ]);
  });

  it('should replay Redis dead-lettered events back to pending', async () => {
    const connection = new RedisWebhookConnection(new FakeRedisClient() as any);
    const queue = new RedisWebhookEventQueue(
      connection,
      {
        maxDepth: 10,
        maxAttempts: 1,
        retryBaseDelayMs: 0,
      },
      'test:webhooks',
    );

    await queue.enqueue({
      eventId: 'event-1',
      provider: 'telegram',
      channelId: 'bot-1',
      payload: {},
    });
    await queue.drain(async () => {
      throw new Error('chat ingestion unavailable');
    });

    await expect(queue.replayDeadLetter('event-1')).resolves.toMatchObject({
      eventId: 'event-1',
      attempts: 0,
      state: 'queued',
      lastError: undefined,
      failureClass: undefined,
      failureCode: undefined,
    });
    await expect(queue.replayDeadLetter('event-1')).resolves.toBeNull();
    await expect(queue.getStats()).resolves.toMatchObject({
      pending: 1,
      deadLettered: 0,
    });
  });

  it('should preserve Redis pending events across queue restarts', async () => {
    const redis = new FakeRedisClient();
    const firstConnection = new RedisWebhookConnection(redis as any);
    const firstQueue = new RedisWebhookEventQueue(
      firstConnection,
      {
        maxDepth: 10,
        maxAttempts: 3,
        retryBaseDelayMs: 0,
      },
      'test:webhooks',
    );

    await firstQueue.enqueue({
      eventId: 'event-restart',
      provider: 'telegram',
      channelId: 'bot-1',
      payload: { message: 'durable' },
    });
    await firstConnection.close();

    const secondConnection = new RedisWebhookConnection(redis as any);
    const secondQueue = new RedisWebhookEventQueue(
      secondConnection,
      {
        maxDepth: 10,
        maxAttempts: 3,
        retryBaseDelayMs: 0,
      },
      'test:webhooks',
    );
    const processed: string[] = [];

    await secondQueue.drain(async (event) => {
      processed.push(event.eventId);
    });

    expect(processed).toEqual(['event-restart']);
    await expect(secondQueue.getStats()).resolves.toMatchObject({
      pending: 0,
      completed: 1,
      deadLettered: 0,
    });
  });

  it('should enforce Redis backpressure when queue depth is exceeded', async () => {
    const connection = new RedisWebhookConnection(new FakeRedisClient() as any);
    const queue = new RedisWebhookEventQueue(
      connection,
      {
        maxDepth: 1,
        maxAttempts: 1,
        retryBaseDelayMs: 0,
      },
      'test:webhooks',
    );

    await queue.enqueue({
      eventId: 'event-1',
      provider: 'telegram',
      channelId: 'bot-1',
      payload: {},
    });

    await expect(
      queue.enqueue({
        eventId: 'event-2',
        provider: 'telegram',
        channelId: 'bot-1',
        payload: {},
      }),
    ).rejects.toThrow('Webhook queue depth exceeded 1');
  });

  it('should build Redis URLs from host and port when REDIS_URL is absent', () => {
    const originalRedisUrl = process.env.REDIS_URL;
    const originalRedisHost = process.env.REDIS_HOST;
    const originalRedisPort = process.env.REDIS_PORT;
    delete process.env.REDIS_URL;
    process.env.REDIS_HOST = 'redis';
    process.env.REDIS_PORT = '6379';

    expect(buildRedisUrl()).toBe('redis://redis:6379');

    restoreEnv('REDIS_URL', originalRedisUrl);
    restoreEnv('REDIS_HOST', originalRedisHost);
    restoreEnv('REDIS_PORT', originalRedisPort);
  });
});

class FakeRedisClient {
  isOpen = false;
  private readonly values = new Map<string, string>();
  private readonly hashes = new Map<string, Map<string, string>>();
  private readonly lists = new Map<string, string[]>();
  private readonly sets = new Map<string, Set<string>>();

  async connect() {
    this.isOpen = true;
  }

  async quit() {
    this.isOpen = false;
  }

  async set(key: string, value: string, options?: Record<string, unknown>) {
    if (options?.NX && this.values.has(key)) {
      return null;
    }

    this.values.set(key, value);
    return 'OK';
  }

  async del(key: string) {
    return this.values.delete(key) ? 1 : 0;
  }

  async lLen(key: string) {
    return this.list(key).length;
  }

  async hSet(key: string, field: string, value: string) {
    this.hash(key).set(field, value);
    return 1;
  }

  async rPush(key: string, value: string) {
    return this.list(key).push(value);
  }

  async lPop(key: string) {
    return this.list(key).shift() || null;
  }

  async lMove(
    source: string,
    destination: string,
    sourceDirection: 'LEFT' | 'RIGHT',
    destinationDirection: 'LEFT' | 'RIGHT',
  ) {
    const sourceList = this.list(source);
    const value = sourceDirection === 'LEFT' ? sourceList.shift() : sourceList.pop();
    if (!value) return null;

    const destinationList = this.list(destination);
    if (destinationDirection === 'LEFT') {
      destinationList.unshift(value);
    } else {
      destinationList.push(value);
    }
    return value;
  }

  async lRem(key: string, count: number, value: string) {
    const values = this.list(key);
    let removed = 0;
    for (let index = 0; index < values.length && (count === 0 || removed < Math.abs(count));) {
      if (values[index] === value) {
        values.splice(index, 1);
        removed += 1;
      } else {
        index += 1;
      }
    }
    return removed;
  }

  async hGet(key: string, field: string) {
    return this.hash(key).get(field) || null;
  }

  async sAdd(key: string, value: string) {
    this.setValue(key).add(value);
    return 1;
  }

  async sCard(key: string) {
    return this.setValue(key).size;
  }

  async lRange(key: string, start: number, stop: number) {
    const values = this.list(key);
    const normalizedStop = stop < 0 ? values.length + stop : stop;
    return values.slice(start, normalizedStop + 1);
  }

  private hash(key: string) {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }

    return this.hashes.get(key) as Map<string, string>;
  }

  private list(key: string) {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }

    return this.lists.get(key) as string[];
  }

  private setValue(key: string) {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }

    return this.sets.get(key) as Set<string>;
  }
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
