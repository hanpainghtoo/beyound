import { createClient } from 'redis';

export type QueueState = 'queued' | 'processing' | 'completed' | 'failed' | 'dead_lettered';

export type QueuedWebhookEvent = {
  eventId: string;
  provider: string;
  channelId: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  state: QueueState;
  queuedAt: string;
  updatedAt: string;
  lastError?: string;
  failureClass?: 'retryable' | 'terminal';
  failureCode?: string;
};

export type WebhookQueueStats = {
  backend: 'memory' | 'redis';
  pending: number;
  processing: number;
  retrying: number;
  completed: number;
  deadLettered: number;
  oldestPendingAgeMs: number;
  oldestDeadLetterAgeMs: number;
  maxDepth: number;
  maxAttempts: number;
};

export type WebhookQueueOptions = {
  maxDepth: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
};

export type WebhookQueueInput = Omit<
  QueuedWebhookEvent,
  'attempts' | 'maxAttempts' | 'state' | 'queuedAt' | 'updatedAt'
>;

export type WebhookIdempotencyBackend = {
  claim(eventId: string): Promise<boolean>;
  release(eventId: string): Promise<void>;
};

export type WebhookQueueBackend = {
  enqueue(input: WebhookQueueInput): Promise<QueuedWebhookEvent>;
  drain(processor: (event: QueuedWebhookEvent) => Promise<void>): Promise<void>;
  getStats(): Promise<WebhookQueueStats>;
  getDeadLetters(): Promise<QueuedWebhookEvent[]>;
  replayDeadLetter(eventId: string): Promise<QueuedWebhookEvent | null>;
  deleteDeadLetter(eventId: string): Promise<QueuedWebhookEvent | null>;
};

type RedisClientLike = {
  isOpen?: boolean;
  connect(): Promise<unknown>;
  quit?(): Promise<unknown>;
  set(key: string, value: string, options?: Record<string, unknown>): Promise<unknown>;
  del(key: string): Promise<number>;
  lLen(key: string): Promise<number>;
  hSet(key: string, field: string, value: string): Promise<unknown>;
  rPush(key: string, value: string): Promise<unknown>;
  lPop(key: string): Promise<string | null>;
  lMove?(
    source: string,
    destination: string,
    sourceDirection: 'LEFT' | 'RIGHT',
    destinationDirection: 'LEFT' | 'RIGHT',
  ): Promise<string | null>;
  lRem(key: string, count: number, value: string): Promise<number>;
  hGet(key: string, field: string): Promise<string | null>;
  sAdd(key: string, value: string): Promise<unknown>;
  sCard(key: string): Promise<number>;
  lRange(key: string, start: number, stop: number): Promise<string[]>;
};

const defaultQueueOptions = (): WebhookQueueOptions => ({
  maxDepth: Number(process.env.WEBHOOK_QUEUE_MAX_DEPTH || 1000),
  maxAttempts: Number(process.env.WEBHOOK_QUEUE_MAX_ATTEMPTS || 3),
  retryBaseDelayMs: Number(process.env.WEBHOOK_QUEUE_RETRY_BASE_DELAY_MS || 250),
});

const processingTimeoutMs = () =>
  Number(process.env.WEBHOOK_QUEUE_PROCESSING_TIMEOUT_MS || 5 * 60 * 1000);

const retryDelayWithJitter = (baseDelayMs: number, attempts: number) => {
  const exponentialDelay = baseDelayMs * Math.max(1, 2 ** (attempts - 1));
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponentialDelay * 0.25)));
  return exponentialDelay + jitter;
};

export class WebhookIdempotencyStore implements WebhookIdempotencyBackend {
  private readonly seenEvents = new Map<string, number>();

  constructor(private readonly ttlMs = Number(process.env.WEBHOOK_IDEMPOTENCY_TTL_MS || 24 * 60 * 60 * 1000)) {}

  async claim(eventId: string) {
    this.prune();

    if (this.seenEvents.has(eventId)) {
      return false;
    }

    this.seenEvents.set(eventId, Date.now() + this.ttlMs);
    return true;
  }

  async release(eventId: string) {
    this.seenEvents.delete(eventId);
  }

  private prune() {
    const now = Date.now();

    for (const [eventId, expiresAt] of this.seenEvents.entries()) {
      if (expiresAt <= now) {
        this.seenEvents.delete(eventId);
      }
    }
  }
}

export class WebhookEventQueue implements WebhookQueueBackend {
  private readonly pending: QueuedWebhookEvent[] = [];
  private readonly deadLetters = new Map<string, QueuedWebhookEvent>();
  private readonly completed = new Map<string, QueuedWebhookEvent>();
  private processing = false;

  constructor(private readonly options = defaultQueueOptions()) {}

  async enqueue(input: WebhookQueueInput) {
    if (this.pending.length >= this.options.maxDepth) {
      throw new Error(`Webhook queue depth exceeded ${this.options.maxDepth}`);
    }

    const now = new Date().toISOString();
    const event: QueuedWebhookEvent = {
      ...input,
      attempts: 0,
      maxAttempts: this.options.maxAttempts,
      state: 'queued',
      queuedAt: now,
      updatedAt: now,
    };

    this.pending.push(event);
    return event;
  }

  async drain(processor: (event: QueuedWebhookEvent) => Promise<void>) {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      while (this.pending.length > 0) {
        const event = this.pending.shift();
        if (!event) break;

        await this.process(event, processor);
      }
    } finally {
      this.processing = false;
    }
  }

  async getStats(): Promise<WebhookQueueStats> {
    return {
      backend: 'memory',
      pending: this.pending.length,
      processing: this.processing ? 1 : 0,
      retrying: this.pending.filter((event) => event.attempts > 0).length,
      completed: this.completed.size,
      deadLettered: this.deadLetters.size,
      oldestPendingAgeMs: oldestAgeMs(this.pending),
      oldestDeadLetterAgeMs: oldestAgeMs(Array.from(this.deadLetters.values())),
      maxDepth: this.options.maxDepth,
      maxAttempts: this.options.maxAttempts,
    };
  }

  async getDeadLetters() {
    return Array.from(this.deadLetters.values());
  }

  async replayDeadLetter(eventId: string) {
    const event = this.deadLetters.get(eventId);
    if (!event) return null;

    this.deadLetters.delete(eventId);
    const replayed: QueuedWebhookEvent = {
      ...event,
      attempts: 0,
      state: 'queued',
      updatedAt: new Date().toISOString(),
      lastError: undefined,
      failureClass: undefined,
      failureCode: undefined,
    };
    this.pending.push(replayed);
    return replayed;
  }

  async deleteDeadLetter(eventId: string) {
    const event = this.deadLetters.get(eventId);
    if (!event) return null;
    this.deadLetters.delete(eventId);
    return event;
  }

  private async process(event: QueuedWebhookEvent, processor: (event: QueuedWebhookEvent) => Promise<void>) {
    event.state = 'processing';
    event.attempts += 1;
    event.updatedAt = new Date().toISOString();

    try {
      await processor(event);
      event.state = 'completed';
      event.updatedAt = new Date().toISOString();
      this.completed.set(event.eventId, event);
    } catch (error) {
      const failure = classifyQueueError(error);
      event.lastError = failure.message;
      event.failureClass = failure.failureClass;
      event.failureCode = failure.failureCode;
      event.updatedAt = new Date().toISOString();

      if (failure.failureClass === 'terminal' || event.attempts >= event.maxAttempts) {
        event.state = 'dead_lettered';
        this.deadLetters.set(event.eventId, event);
        return;
      }

      event.state = 'failed';
      await this.delay(retryDelayWithJitter(this.options.retryBaseDelayMs, event.attempts));
      this.pending.push(event);
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class RedisWebhookConnection {
  private connectPromise?: Promise<RedisClientLike>;

  constructor(private readonly client: RedisClientLike = createRedisClient()) {}

  async getClient() {
    if (this.client.isOpen) {
      return this.client;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().then(() => this.client);
    }

    return this.connectPromise;
  }

  async close() {
    if (this.client.isOpen && this.client.quit) {
      await this.client.quit();
    }
  }
}

export class RedisWebhookIdempotencyStore implements WebhookIdempotencyBackend {
  constructor(
    private readonly connection: RedisWebhookConnection,
    private readonly ttlMs = Number(process.env.WEBHOOK_IDEMPOTENCY_TTL_MS || 24 * 60 * 60 * 1000),
    private readonly keyPrefix = process.env.WEBHOOK_REDIS_KEY_PREFIX || 'commerce-os:webhooks',
  ) {}

  async claim(eventId: string) {
    const client = await this.connection.getClient();
    const result = await client.set(this.idempotencyKey(eventId), '1', {
      NX: true,
      PX: this.ttlMs,
    });

    return result === 'OK';
  }

  async release(eventId: string) {
    const client = await this.connection.getClient();
    await client.del(this.idempotencyKey(eventId));
  }

  private idempotencyKey(eventId: string) {
    return `${this.keyPrefix}:idempotency:${eventId}`;
  }
}

export class RedisWebhookEventQueue implements WebhookQueueBackend {
  private processing = false;

  constructor(
    private readonly connection: RedisWebhookConnection,
    private readonly options = defaultQueueOptions(),
    private readonly keyPrefix = process.env.WEBHOOK_REDIS_KEY_PREFIX || 'commerce-os:webhooks',
  ) {}

  async enqueue(input: WebhookQueueInput) {
    const client = await this.connection.getClient();
    const [pendingDepth, processingDepth] = await Promise.all([
      client.lLen(this.pendingKey),
      client.lLen(this.processingKey),
    ]);
    if (pendingDepth + processingDepth >= this.options.maxDepth) {
      throw new Error(`Webhook queue depth exceeded ${this.options.maxDepth}`);
    }

    const now = new Date().toISOString();
    const event: QueuedWebhookEvent = {
      ...input,
      attempts: 0,
      maxAttempts: this.options.maxAttempts,
      state: 'queued',
      queuedAt: now,
      updatedAt: now,
    };

    await client.hSet(this.eventsKey, event.eventId, JSON.stringify(event));
    await client.rPush(this.pendingKey, event.eventId);
    return event;
  }

  async drain(processor: (event: QueuedWebhookEvent) => Promise<void>) {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      const client = await this.connection.getClient();
      await this.requeueStaleProcessing(client);
      while (true) {
        const eventId = await this.claimNextPending(client);
        if (!eventId) break;

        const rawEvent = await client.hGet(this.eventsKey, eventId);
        if (!rawEvent) {
          await client.lRem(this.processingKey, 1, eventId);
          continue;
        }

        await this.process(JSON.parse(rawEvent) as QueuedWebhookEvent, processor);
      }
    } finally {
      this.processing = false;
    }
  }

  async getStats(): Promise<WebhookQueueStats> {
    const client = await this.connection.getClient();
    const [pendingIds, processing, completed, deadLetterRows] = await Promise.all([
      client.lRange(this.pendingKey, 0, -1),
      client.lLen(this.processingKey),
      client.sCard(this.completedKey),
      client.lRange(this.deadLettersKey, 0, -1),
    ]);
    const pendingEvents = await this.loadEvents(client, pendingIds);
    const deadLetterEvents = deadLetterRows
      .map((row) => this.parseEvent(row))
      .filter((event): event is QueuedWebhookEvent => Boolean(event));

    return {
      backend: 'redis',
      pending: pendingIds.length,
      processing,
      retrying: pendingEvents.filter((event) => event.attempts > 0).length,
      completed,
      deadLettered: deadLetterRows.length,
      oldestPendingAgeMs: oldestAgeMs(pendingEvents),
      oldestDeadLetterAgeMs: oldestAgeMs(deadLetterEvents),
      maxDepth: this.options.maxDepth,
      maxAttempts: this.options.maxAttempts,
    };
  }

  async getDeadLetters() {
    const client = await this.connection.getClient();
    const rows = await client.lRange(this.deadLettersKey, 0, -1);
    return rows.map((row) => JSON.parse(row) as QueuedWebhookEvent);
  }

  async replayDeadLetter(eventId: string) {
    const client = await this.connection.getClient();
    const rows = await client.lRange(this.deadLettersKey, 0, -1);
    const row = rows.find((candidate) => {
      try {
        return (JSON.parse(candidate) as QueuedWebhookEvent).eventId === eventId;
      } catch {
        return false;
      }
    });
    if (!row) return null;

    const event = JSON.parse(row) as QueuedWebhookEvent;
    const replayed: QueuedWebhookEvent = {
      ...event,
      attempts: 0,
      state: 'queued',
      updatedAt: new Date().toISOString(),
      lastError: undefined,
      failureClass: undefined,
      failureCode: undefined,
    };
    await client.lRem(this.deadLettersKey, 1, row);
    await client.hSet(this.eventsKey, eventId, JSON.stringify(replayed));
    await client.rPush(this.pendingKey, eventId);
    return replayed;
  }

  async deleteDeadLetter(eventId: string) {
    const client = await this.connection.getClient();
    const rows = await client.lRange(this.deadLettersKey, 0, -1);
    const row = rows.find((candidate) => {
      const event = this.parseEvent(candidate);
      return event?.eventId === eventId;
    });
    if (!row) return null;

    const event = JSON.parse(row) as QueuedWebhookEvent;
    await client.lRem(this.deadLettersKey, 1, row);
    return event;
  }

  private async process(event: QueuedWebhookEvent, processor: (event: QueuedWebhookEvent) => Promise<void>) {
    const client = await this.connection.getClient();
    event.state = 'processing';
    event.attempts += 1;
    event.updatedAt = new Date().toISOString();
    await client.hSet(this.eventsKey, event.eventId, JSON.stringify(event));

    try {
      await processor(event);
      event.state = 'completed';
      event.updatedAt = new Date().toISOString();
      await client.hSet(this.eventsKey, event.eventId, JSON.stringify(event));
      await client.lRem(this.processingKey, 1, event.eventId);
      await client.sAdd(this.completedKey, event.eventId);
    } catch (error) {
      const failure = classifyQueueError(error);
      event.lastError = failure.message;
      event.failureClass = failure.failureClass;
      event.failureCode = failure.failureCode;
      event.updatedAt = new Date().toISOString();

      if (failure.failureClass === 'terminal' || event.attempts >= event.maxAttempts) {
        event.state = 'dead_lettered';
        await client.hSet(this.eventsKey, event.eventId, JSON.stringify(event));
        await client.lRem(this.processingKey, 1, event.eventId);
        await client.rPush(this.deadLettersKey, JSON.stringify(event));
        return;
      }

      event.state = 'failed';
      await client.hSet(this.eventsKey, event.eventId, JSON.stringify(event));
      await this.delay(retryDelayWithJitter(this.options.retryBaseDelayMs, event.attempts));
      await client.lRem(this.processingKey, 1, event.eventId);
      await client.rPush(this.pendingKey, event.eventId);
    }
  }

  private async claimNextPending(client: RedisClientLike) {
    if (client.lMove) {
      return client.lMove(this.pendingKey, this.processingKey, 'LEFT', 'RIGHT');
    }

    const eventId = await client.lPop(this.pendingKey);
    if (eventId) {
      await client.rPush(this.processingKey, eventId);
    }
    return eventId;
  }

  private async requeueStaleProcessing(client: RedisClientLike) {
    const eventIds = await client.lRange(this.processingKey, 0, -1);
    const staleBefore = Date.now() - processingTimeoutMs();

    for (const eventId of eventIds) {
      const rawEvent = await client.hGet(this.eventsKey, eventId);
      if (!rawEvent) {
        await client.lRem(this.processingKey, 1, eventId);
        continue;
      }

      const event = JSON.parse(rawEvent) as QueuedWebhookEvent;
      const updatedAt = new Date(event.updatedAt).getTime();
      if (event.state !== 'processing' || Number.isNaN(updatedAt) || updatedAt > staleBefore) {
        continue;
      }

      event.state = 'failed';
      event.lastError = event.lastError || 'Recovered stale in-flight webhook event';
      event.updatedAt = new Date().toISOString();
      await client.hSet(this.eventsKey, event.eventId, JSON.stringify(event));
      await client.lRem(this.processingKey, 1, eventId);
      await client.rPush(this.pendingKey, eventId);
    }
  }

  private async loadEvents(client: RedisClientLike, eventIds: string[]) {
    const events: QueuedWebhookEvent[] = [];
    for (const eventId of eventIds) {
      const rawEvent = await client.hGet(this.eventsKey, eventId);
      const event = rawEvent ? this.parseEvent(rawEvent) : undefined;
      if (event) events.push(event);
    }
    return events;
  }

  private parseEvent(rawEvent: string) {
    try {
      return JSON.parse(rawEvent) as QueuedWebhookEvent;
    } catch {
      return undefined;
    }
  }

  private get pendingKey() {
    return `${this.keyPrefix}:pending`;
  }

  private get processingKey() {
    return `${this.keyPrefix}:processing`;
  }

  private get eventsKey() {
    return `${this.keyPrefix}:events`;
  }

  private get completedKey() {
    return `${this.keyPrefix}:completed`;
  }

  private get deadLettersKey() {
    return `${this.keyPrefix}:dead_letters`;
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function oldestAgeMs(events: QueuedWebhookEvent[]) {
  const oldest = events
    .map((event) => new Date(event.queuedAt).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right)[0];
  return oldest ? Math.max(0, Date.now() - oldest) : 0;
}

function classifyQueueError(error: unknown) {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const terminal = record.terminal === true;
  const code =
    typeof record.failureCode === 'string'
      ? record.failureCode
      : error instanceof Error
        ? error.name
        : 'queue_error';
  return {
    message: error instanceof Error ? error.message : String(error),
    failureClass: terminal ? 'terminal' as const : 'retryable' as const,
    failureCode: code,
  };
}

export function createWebhookReliability() {
  const backend = (process.env.WEBHOOK_QUEUE_BACKEND || 'memory').toLowerCase();
  if (backend === 'redis') {
    const connection = new RedisWebhookConnection();
    return {
      idempotencyStore: new RedisWebhookIdempotencyStore(connection),
      eventQueue: new RedisWebhookEventQueue(connection),
      close: () => connection.close(),
    };
  }

  return {
    idempotencyStore: new WebhookIdempotencyStore(),
    eventQueue: new WebhookEventQueue(),
    close: async () => undefined,
  };
}

export function buildRedisUrl() {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  return `redis://${host}:${port}`;
}

function createRedisClient(): RedisClientLike {
  const client = createClient({ url: buildRedisUrl() });
  client.on('error', (error) => {
    console.error(
      JSON.stringify({
        event: 'webhook_redis_error',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  });

  return client as RedisClientLike;
}
