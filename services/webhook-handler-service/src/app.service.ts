import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  OnApplicationShutdown,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  serviceAuthHeaders,
} from '@zayos/internal-service-auth';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import {
  QueuedWebhookEvent,
  WebhookQueueInput,
  createWebhookReliability,
} from './webhook-reliability';
import { WebhookRateLimiter } from './webhook-rate-limiter';
import {
  ViberWebhookClient,
  ViberWebhookRegistrationInput,
} from './viber-webhook.client';

type WebhookEnvelope = {
  provider: string;
  channelId: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  rawBody?: Buffer;
  correlationId?: string;
  receivedAt: string;
};

type TelegramManagerEnvelope = {
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
  rawBody?: Buffer;
  correlationId?: string;
  receivedAt: string;
};

type ResolvedWebhookChannel = {
  channelId: string;
  tenantId: string;
  provider: string;
  providerAppConfigId?: string;
  providerAppRoutingId?: string;
  externalPageId?: string;
  status: string;
  connectionStatus?: string;
  webhookRegistrationStatus?: string;
  disposition?: 'acknowledge_without_ingestion';
  reasonCode?: string;
};

type MessengerProviderAppWebhookConfig = {
  provider: 'messenger';
  providerAppConfigId: string;
  routingId: string;
  graphApiVersion: string;
  status: string;
  webhookConfig?: {
    appSecret?: string;
    verifyToken?: string;
  };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AppService implements OnApplicationShutdown {
  private readonly reliability = createWebhookReliability();
  private readonly idempotencyStore = this.reliability.idempotencyStore;
  private readonly eventQueue = this.reliability.eventQueue;
  private readonly rateLimiter = new WebhookRateLimiter();
  private readonly viberWebhookClient = new ViberWebhookClient();

  async onApplicationShutdown() {
    await this.reliability.close();
  }

  getHealth() {
    return {
      service: 'webhook-handler-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    let queueReady = true;
    let queue: Awaited<ReturnType<typeof this.eventQueue.getStats>> | undefined;
    try {
      queue = await this.eventQueue.getStats();
      queueReady =
        process.env.NODE_ENV !== 'production' || queue.backend === 'redis';
    } catch {
      queueReady = false;
    }

    const telegramManager = await this.getTelegramManagerReadiness();
    const dependencies = {
      chatIngestion: Boolean(process.env.CHAT_INGESTION_URL),
      queue: queueReady,
    };
    return {
      service: 'webhook-handler-service',
      ready: Object.values(dependencies).every(Boolean),
      dependencies,
      telegramManager,
      queue,
      timestamp: new Date().toISOString(),
    };
  }

  async getMetrics() {
    const memory = process.memoryUsage();
    const queue = await this.eventQueue.getStats();
    const queueDepthAlertThreshold = Number(
      process.env.WEBHOOK_QUEUE_BACKLOG_ALERT_DEPTH ||
        Math.ceil(queue.maxDepth * 0.8),
    );
    const queueAgeAlertThresholdMs = Number(
      process.env.WEBHOOK_QUEUE_BACKLOG_ALERT_AGE_MS || 5 * 60 * 1000,
    );
    const deadLetterAlertThreshold = Number(
      process.env.WEBHOOK_QUEUE_DLQ_ALERT_DEPTH || 1,
    );
    return {
      service: 'webhook-handler-service',
      uptimeSeconds: process.uptime(),
      memoryBytes: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
      },
      queue,
      alerts: {
        queueBacklogDepth:
          queue.pending + queue.processing >= queueDepthAlertThreshold,
        queueBacklogAge: queue.oldestPendingAgeMs >= queueAgeAlertThresholdMs,
        deadLetterGrowth: queue.deadLettered >= deadLetterAlertThreshold,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async verifyWebhook(
    provider: string,
    channelId: string,
    query: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined> = {},
  ) {
    const normalizedProvider = this.normalizeProvider(provider);
    this.assertRateLimit(`${normalizedProvider}:verify`);

    if (normalizedProvider === 'messenger') {
      const appConfig = await this.getMessengerProviderAppConfig(channelId);
      const mode = query['hub.mode'];
      const token = query['hub.verify_token'];
      const challenge = query['hub.challenge'];
      const expectedToken = this.stringValue(
        appConfig.webhookConfig?.verifyToken,
      );

      return {
        verified:
          mode === 'subscribe' &&
          typeof token === 'string' &&
          typeof expectedToken === 'string' &&
          this.safeCompare(token, expectedToken),
        provider: normalizedProvider,
        providerAppConfigId: appConfig.providerAppConfigId,
        verificationType: 'challenge',
        challenge: typeof challenge === 'string' ? challenge : undefined,
      };
    }

    const resolvedChannel = await this.resolveWebhookChannel(
      channelId,
      normalizedProvider,
    );

    if (normalizedProvider === 'telegram') {
      const verificationConfig = await this.getProviderVerificationConfig(
        resolvedChannel.channelId,
        normalizedProvider,
      );
      const actualSecretToken = this.firstHeader(
        headers,
        'x-telegram-bot-api-secret-token',
      );
      const expectedSecretToken = this.stringValue(
        verificationConfig?.secretToken,
      );

      return {
        verified: Boolean(
          actualSecretToken &&
          expectedSecretToken &&
          this.safeCompare(actualSecretToken, expectedSecretToken),
        ),
        provider: normalizedProvider,
        verificationType: 'secret-token-header',
        nextStep: expectedSecretToken
          ? 'POST callbacks must include the configured Telegram secret token header.'
          : 'Telegram webhook secret token is not configured for this channel.',
      };
    }

    if (normalizedProvider === 'tiktok') {
      return {
        verified: true,
        provider: normalizedProvider,
        verificationType: 'signed-post',
        signatureHeader: 'TikTok-Signature',
        nextStep:
          'POST callbacks are verified with the configured TikTok client secret.',
      };
    }

    if (normalizedProvider === 'viber') {
      return {
        verified: true,
        provider: normalizedProvider,
        verificationType: 'signed-post',
        signatureHeader: 'X-Viber-Content-Signature',
        nextStep:
          'POST callbacks are verified with the tenant Viber auth token configured at the webhook edge.',
      };
    }

    return {
      verified: true,
      provider: normalizedProvider,
      verificationType: 'default',
    };
  }

  async receiveWebhook(envelope: WebhookEnvelope) {
    const provider = this.normalizeProvider(envelope.provider);
    if (provider === 'messenger') {
      return this.receiveMessengerWebhook(envelope);
    }

    const resolvedChannel = await this.resolveWebhookChannel(
      envelope.channelId,
      provider,
    );
    const resolvedEnvelope = {
      ...envelope,
      channelId: resolvedChannel.channelId,
    };
    this.assertRateLimit(`${provider}:${resolvedChannel.channelId}`);
    const signature = await this.validateSignature(provider, resolvedEnvelope);
    if (signature.checked && signature.valid !== true) {
      throw new UnauthorizedException(`Invalid ${provider} webhook signature`);
    }
    if (resolvedChannel.disposition === 'acknowledge_without_ingestion') {
      return {
        accepted: true,
        duplicate: false,
        provider,
        channelId: resolvedChannel.channelId,
        disposition: resolvedChannel.disposition,
        reasonCode: resolvedChannel.reasonCode || 'CHANNEL_DISABLED',
        signature,
        queued: false,
        forwardedToChatIngestion: false,
      };
    }
    const eventId =
      this.extractEventId(provider, resolvedEnvelope) ||
      this.stableWebhookFallbackEventId(provider, resolvedEnvelope);

    if (!(await this.idempotencyStore.claim(eventId))) {
      console.log(
        JSON.stringify({
          event: 'duplicate_provider_webhook',
          eventId,
          provider,
          channelId: resolvedChannel.channelId,
        }),
      );

      return {
        accepted: true,
        duplicate: true,
        eventId,
        provider,
        channelId: resolvedChannel.channelId,
        signature,
        queue: await this.eventQueue.getStats(),
      };
    }

    const queuedEvent = await this.enqueueClaimedWebhook(eventId, {
      eventId,
      provider,
      channelId: resolvedChannel.channelId,
      payload: {
        ...resolvedEnvelope,
        provider,
        eventId,
        tenantId: resolvedChannel.tenantId,
      },
    });

    console.log(
      JSON.stringify({
        event: 'provider_webhook_queued',
        eventId,
        provider,
        channelId: resolvedChannel.channelId,
        queue: await this.eventQueue.getStats(),
      }),
    );

    await this.eventQueue.drain((event) => this.forwardToChatIngestion(event));

    return {
      accepted: true,
      duplicate: false,
      eventId,
      provider,
      channelId: resolvedChannel.channelId,
      signature,
      queueState: queuedEvent.state,
      forwardedToChatIngestion:
        Boolean(process.env.CHAT_INGESTION_URL) &&
        queuedEvent.state === 'completed',
      queue: await this.eventQueue.getStats(),
    };
  }

  async receiveTelegramManagerWebhook(envelope: TelegramManagerEnvelope) {
    this.assertRateLimit('telegram:manager');
    const expectedSecret = this.stringValue(
      process.env.TELEGRAM_MANAGER_WEBHOOK_SECRET,
    );
    const actualSecret = this.firstHeader(
      envelope.headers,
      'x-telegram-bot-api-secret-token',
    );
    if (
      !expectedSecret ||
      !actualSecret ||
      !this.safeCompare(actualSecret, expectedSecret)
    ) {
      throw new UnauthorizedException(
        'Invalid Telegram manager webhook secret',
      );
    }

    const eventId = this.telegramUpdateId(envelope.body);
    if (!(await this.idempotencyStore.claim(eventId))) {
      console.log(
        JSON.stringify({
          event: 'duplicate_telegram_manager_webhook',
          eventId,
        }),
      );
      return { accepted: true, duplicate: true, eventId };
    }

    try {
      const result = await this.processTelegramManagerUpdate(envelope, eventId);
      return { accepted: true, duplicate: false, eventId, ...result };
    } catch (error) {
      await this.idempotencyStore.release(eventId);
      throw error;
    }
  }

  private async receiveMessengerWebhook(envelope: WebhookEnvelope) {
    this.assertRateLimit(`messenger:${envelope.channelId}`);
    const appConfig = await this.getMessengerProviderAppConfig(
      envelope.channelId,
    );
    const signature = this.validateMessengerSignature(envelope, appConfig);
    if (signature.checked && signature.valid !== true) {
      throw new UnauthorizedException('Invalid messenger webhook signature');
    }

    const body = this.recordValue(envelope.body);
    if (!body || (body.object && body.object !== 'page')) {
      throw new BadRequestException('Invalid Messenger webhook payload');
    }

    const firstEntry = Array.isArray(body.entry)
      ? this.recordValue(body.entry[0])
      : undefined;
    const pageId = this.stringValue(firstEntry?.id);
    if (!pageId) {
      throw new BadRequestException(
        'Messenger webhook payload is missing Page ID',
      );
    }

    const resolvedChannel = await this.resolveMessengerPageChannel(
      appConfig.routingId,
      pageId,
    );
    if (resolvedChannel.disposition === 'acknowledge_without_ingestion') {
      return {
        accepted: true,
        duplicate: false,
        provider: 'messenger',
        channelId: resolvedChannel.channelId,
        externalPageId: pageId,
        disposition: resolvedChannel.disposition,
        reasonCode: resolvedChannel.reasonCode || 'CHANNEL_DISABLED',
        queued: false,
        forwardedToChatIngestion: false,
      };
    }
    const resolvedEnvelope = {
      ...envelope,
      provider: 'messenger',
      channelId: resolvedChannel.channelId,
      body,
    };
    const providerEventId =
      this.extractEventId('messenger', resolvedEnvelope) ||
      this.stableWebhookFallbackEventId('messenger', resolvedEnvelope);
    const idempotencyKey = [
      'messenger',
      appConfig.providerAppConfigId,
      resolvedChannel.channelId,
      providerEventId,
    ].join(':');

    if (!(await this.idempotencyStore.claim(idempotencyKey))) {
      console.log(
        JSON.stringify({
          event: 'duplicate_provider_webhook',
          eventId: providerEventId,
          provider: 'messenger',
          channelId: resolvedChannel.channelId,
        }),
      );

      return {
        accepted: true,
        duplicate: true,
        eventId: providerEventId,
        provider: 'messenger',
        channelId: resolvedChannel.channelId,
        signature,
        queue: await this.eventQueue.getStats(),
      };
    }

    const queuedEvent = await this.enqueueClaimedWebhook(idempotencyKey, {
      eventId: idempotencyKey,
      provider: 'messenger',
      channelId: resolvedChannel.channelId,
      payload: {
        ...resolvedEnvelope,
        eventId: providerEventId,
        tenantId: resolvedChannel.tenantId,
        providerAppConfigId: appConfig.providerAppConfigId,
        providerAppRoutingId: appConfig.routingId,
        externalPageId: pageId,
      },
    });

    console.log(
      JSON.stringify({
        event: 'provider_webhook_queued',
        eventId: providerEventId,
        provider: 'messenger',
        channelId: resolvedChannel.channelId,
        providerAppConfigId: appConfig.providerAppConfigId,
        queue: await this.eventQueue.getStats(),
      }),
    );

    await this.eventQueue.drain((event) => this.forwardToChatIngestion(event));

    return {
      accepted: true,
      duplicate: false,
      eventId: providerEventId,
      provider: 'messenger',
      channelId: resolvedChannel.channelId,
      signature,
      queueState: queuedEvent.state,
      forwardedToChatIngestion:
        Boolean(process.env.CHAT_INGESTION_URL) &&
        queuedEvent.state === 'completed',
      queue: await this.eventQueue.getStats(),
    };
  }

  getQueueStats() {
    return this.eventQueue.getStats();
  }

  async getDeadLetters(limitValue?: string, cursorValue?: string) {
    const limit = Math.min(Math.max(Number(limitValue || 50) || 50, 1), 100);
    const cursor = Math.max(Number(cursorValue || 0) || 0, 0);
    const events = await this.eventQueue.getDeadLetters();
    const items = events
      .slice(cursor, cursor + limit)
      .map((event) => this.redactDeadLetterEvent(event));
    const nextCursor =
      cursor + limit < events.length ? String(cursor + limit) : undefined;

    console.log(
      JSON.stringify({
        event: 'webhook_dead_letters_listed',
        cursor,
        limit,
        returned: items.length,
        total: events.length,
      }),
    );

    return {
      items,
      nextCursor,
      total: events.length,
    };
  }

  async replayDeadLetter(eventId: string) {
    const replayed = await this.eventQueue.replayDeadLetter(eventId);
    if (!replayed) {
      throw new NotFoundException('Dead-letter event not found');
    }

    console.log(
      JSON.stringify({
        event: 'webhook_dead_letter_replayed',
        eventId,
        provider: replayed.provider,
        channelId: replayed.channelId,
      }),
    );

    await this.eventQueue.drain((event) => this.forwardToChatIngestion(event));
    return this.redactDeadLetterEvent(replayed);
  }

  async deleteDeadLetter(eventId: string) {
    const deleted = await this.eventQueue.deleteDeadLetter(eventId);
    if (!deleted) {
      throw new NotFoundException('Dead-letter event not found');
    }

    console.log(
      JSON.stringify({
        event: 'webhook_dead_letter_deleted',
        eventId,
        provider: deleted.provider,
        channelId: deleted.channelId,
      }),
    );

    return this.redactDeadLetterEvent(deleted);
  }

  private async enqueueClaimedWebhook(
    idempotencyKey: string,
    input: WebhookQueueInput,
  ) {
    try {
      return await this.eventQueue.enqueue(input);
    } catch (error) {
      await this.idempotencyStore.release(idempotencyKey);
      console.log(
        JSON.stringify({
          event: 'provider_webhook_enqueue_failed',
          eventId: input.eventId,
          provider: input.provider,
          channelId: input.channelId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new ServiceUnavailableException(
        'Webhook queue is temporarily unavailable; provider should retry delivery.',
      );
    }
  }

  private redactDeadLetterEvent(event: QueuedWebhookEvent) {
    const payload = event.payload || {};
    const body = this.recordValue(payload.body);
    const query = this.recordValue(payload.query);
    return {
      eventId: event.eventId,
      provider: event.provider,
      channelId: event.channelId,
      attempts: event.attempts,
      maxAttempts: event.maxAttempts,
      state: event.state,
      queuedAt: event.queuedAt,
      updatedAt: event.updatedAt,
      lastError: event.lastError,
      failureClass: event.failureClass,
      failureCode: event.failureCode,
      payload: {
        provider: this.stringValue(payload.provider),
        tenantId: this.stringValue(payload.tenantId),
        eventId: this.stringValue(payload.eventId),
        correlationId: this.stringValue(payload.correlationId),
        receivedAt: this.stringValue(payload.receivedAt),
        bodyKeys: body ? Object.keys(body).sort() : [],
        queryKeys: query ? Object.keys(query).sort() : [],
      },
    };
  }

  async registerViberWebhook(
    channelId: string,
    input: ViberWebhookRegistrationInput,
  ) {
    const result = await this.viberWebhookClient.register(channelId, input);
    await this.updateWebhookRegistrationStatus(
      channelId,
      'viber',
      result.accepted ? 'registered' : 'failed',
      result.status,
    );
    return result;
  }

  unregisterViberWebhook(
    channelId: string,
    input: ViberWebhookRegistrationInput,
  ) {
    return this.viberWebhookClient.unregister(channelId, input);
  }

  private async forwardToChatIngestion(event: QueuedWebhookEvent) {
    const chatIngestionUrl = process.env.CHAT_INGESTION_URL;

    if (!chatIngestionUrl) {
      console.log(
        JSON.stringify({
          event: 'chat_ingestion_forward_skipped',
          eventId: event.eventId,
          reason: 'CHAT_INGESTION_URL_not_configured',
        }),
      );
      return;
    }

    const response = await fetch(
      `${chatIngestionUrl.replace(/\/$/, '')}/ingest`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...serviceAuthHeaders({
            audience: SERVICE_IDENTITIES.CHAT_INGESTION,
            subject: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
            scopes: [SERVICE_SCOPES.CHAT_INGEST],
            correlationId:
              typeof event.payload.correlationId === 'string'
                ? event.payload.correlationId
                : undefined,
          }),
          ...(typeof event.payload.correlationId === 'string'
            ? { 'x-correlation-id': event.payload.correlationId }
            : {}),
        },
        body: JSON.stringify(event.payload),
      },
    );

    if (!response.ok) {
      const error = new Error(
        `Chat ingestion returned HTTP ${response.status}`,
      ) as Error & {
        terminal?: boolean;
        failureCode?: string;
      };
      error.terminal =
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 429;
      error.failureCode = error.terminal
        ? `chat_ingestion_http_${response.status}_terminal`
        : `chat_ingestion_http_${response.status}_retryable`;
      throw error;
    }

    console.log(
      JSON.stringify({
        event: 'chat_ingestion_forwarded',
        eventId: event.eventId,
        provider: event.provider,
        channelId: event.channelId,
        attempts: event.attempts,
        correlationId: event.payload.correlationId,
      }),
    );
  }

  private async processTelegramManagerUpdate(
    envelope: TelegramManagerEnvelope,
    eventId: string,
  ) {
    const body = this.recordValue(envelope.body) || {};
    const start = this.extractTelegramStart(body);
    if (start) {
      const onboarding = await this.postCoreJson<{
        telegramRequestId: number;
        suggestedName: string;
        suggestedUsername: string;
        message: string;
      }>(
        '/internal/telegram/managed-bot/start',
        {
          state: start.state,
          telegramUserId: start.telegramUserId,
          telegramChatId: start.telegramChatId,
        },
        envelope.correlationId,
      );
      if (!onboarding) {
        await this.sendTelegramManagerMessage({
          chatId: start.telegramChatId,
          text: 'Your onboarding link has expired. Please go back to the ZayOS channels page and click "Create My Business Bot" again to get a new link.',
        });
        return { action: 'telegram_manager_start_expired' };
      }
      await this.sendTelegramManagerMessage({
        chatId: start.telegramChatId,
        text: onboarding.message,
        replyMarkup: {
          keyboard: [
            [
              {
                text: 'Create my business bot',
                request_managed_bot: {
                  request_id: onboarding.telegramRequestId,
                  suggested_name: onboarding.suggestedName,
                  suggested_username: onboarding.suggestedUsername,
                },
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return { action: 'telegram_manager_started' };
    }

    const created = this.extractTelegramManagedBotCreated(body);
    console.log(
      JSON.stringify({
        event: 'telegram_manager_debug_created',
        eventId,
        bodyKeys: Object.keys(body).sort(),
        hasManagedBot: 'managed_bot' in body,
        hasMessageManagedBot: this.recordValue(body.message)
          ? 'managed_bot_created' in this.recordValue(body.message)!
          : false,
        createdResult: created,
        managedBotField: body.managed_bot,
      }),
    );
    if (created) {
      const result = await this.postCoreJson<{
        status: string;
        createdBotUsername?: string;
        alreadyConnected?: boolean;
        botToken?: string;
      }>(
        '/internal/telegram/managed-bot/created',
        created,
        envelope.correlationId,
      );
      if (!result) {
        await this.sendTelegramManagerMessage({
          chatId: created.telegramChatId,
          text: 'Something went wrong setting up your bot. Please go back to the ZayOS channels page and try again.',
        });
        return { action: 'telegram_managed_bot_created_failed' };
      }
      if (result.status === 'connected' && !result.alreadyConnected) {
        const username = result.createdBotUsername
          ? `@${result.createdBotUsername.replace(/^@/, '')}`
          : 'your Telegram business bot';
        await this.sendTelegramManagerMessage({
          chatId: created.telegramChatId,
          text: `Your Telegram business bot ${username} is now connected to ZayOS.`,
        });
        if (result.botToken) {
          await this.sendTelegramManagerMessage({
            chatId: created.telegramChatId,
            text: `Bot token: \`${result.botToken}\``,
            parseMode: 'MarkdownV2',
          });
        }
      }
      return { action: 'telegram_managed_bot_created', status: result.status };
    }

    console.log(
      JSON.stringify({
        event: 'telegram_manager_unknown_update',
        eventId,
        bodyKeys: Object.keys(body).sort(),
      }),
    );
    return { action: 'ignored_unknown_update' };
  }

  private extractTelegramStart(body: Record<string, unknown>) {
    const message = this.recordValue(body.message);
    const text = this.stringValue(message?.text);
    if (!message || !text) return undefined;
    const match = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{32,256})$/);
    if (!match) return undefined;
    const from = this.recordValue(message.from);
    const chat = this.recordValue(message.chat);
    const telegramUserId = this.stringValue(from?.id);
    const telegramChatId = this.stringValue(chat?.id);
    if (!telegramUserId || !telegramChatId) return undefined;
    return { state: match[1], telegramUserId, telegramChatId };
  }

  private extractTelegramManagedBotCreated(body: Record<string, unknown>) {
    const message = this.recordValue(body.message);
    const topManagedBot = this.recordValue(body.managed_bot);
    const messageManagedBot =
      this.recordValue(message?.managed_bot_created) ||
      this.recordValue(message?.managed_bot);
    const managedBot = topManagedBot || messageManagedBot;
    if (!managedBot) return undefined;

    const from =
      this.recordValue(message?.from) || this.recordValue(managedBot.user);
    const chat = this.recordValue(message?.chat);
    const bot =
      this.recordValue(managedBot.bot) ||
      this.recordValue(managedBot.managed_bot) ||
      managedBot;
    const createdBotId =
      this.stringValue(bot.id) || this.stringValue(bot.bot_id);
    const telegramUserId =
      this.stringValue(from?.id) ||
      this.stringValue(managedBot.user_id) ||
      this.stringValue(body.user_id);
    const telegramChatId =
      this.stringValue(chat?.id) ||
      this.stringValue(managedBot.chat_id) ||
      telegramUserId;
    if (!createdBotId || !telegramUserId || !telegramChatId) return undefined;

    return {
      telegramUserId,
      telegramChatId,
      createdBotId,
      createdBotUsername:
        this.stringValue(bot.username) || this.stringValue(managedBot.username),
      createdBotFirstName:
        this.stringValue(bot.first_name) ||
        this.stringValue(managedBot.first_name) ||
        this.stringValue(messageManagedBot?.name),
    };
  }

  private telegramUpdateId(body: Record<string, unknown>) {
    const updateId = this.stringValue(body.update_id);
    if (updateId) return `telegram-manager-${updateId}`;
    return `telegram-manager-${createHash('sha256').update(this.stableJson(body)).digest('hex').slice(0, 32)}`;
  }

  private async postCoreJson<T>(
    path: string,
    body: Record<string, unknown>,
    correlationId?: string,
  ): Promise<T> {
    const coreApiUrl = process.env.CORE_API_URL;
    if (!coreApiUrl) {
      throw new ServiceUnavailableException(
        'CORE_API_URL is required for Telegram manager onboarding',
      );
    }
    const response = await fetch(`${coreApiUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getInternalApiHeaders([
          SERVICE_SCOPES.CHANNEL_CREDENTIALS_WRITE,
        ]),
        ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const status = response.status;
      if (status >= 400 && status < 500 && status !== 429) {
        const text = await response.text().catch(() => '');
        console.log(
          JSON.stringify({
            event: 'telegram_manager_core_rejected',
            path,
            statusCode: status,
            body: text.slice(0, 500),
            correlationId,
          }),
        );
        return null as T;
      }
      throw new ServiceUnavailableException(
        `Core Telegram onboarding returned HTTP ${status}`,
      );
    }
    return (await response.json()) as T;
  }

  private async sendTelegramManagerMessage(input: {
    chatId: string;
    text: string;
    replyMarkup?: Record<string, unknown>;
    parseMode?: string;
  }) {
    const token = this.stringValue(process.env.TELEGRAM_MANAGER_BOT_TOKEN);
    if (!token) {
      throw new ServiceUnavailableException(
        'TELEGRAM_MANAGER_BOT_TOKEN is required',
      );
    }
    const response = await fetch(
      `${(process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org').replace(/\/$/, '')}/bot${encodeURIComponent(token)}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: Number.isFinite(Number(input.chatId))
            ? Number(input.chatId)
            : input.chatId,
          text: input.text,
          ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
          ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
        }),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Telegram manager bot message failed',
      );
    }
  }

  private async getTelegramManagerReadiness() {
    const missing = [
      'TELEGRAM_MANAGER_BOT_TOKEN',
      'TELEGRAM_MANAGER_BOT_USERNAME',
      'TELEGRAM_MANAGER_WEBHOOK_SECRET',
      'TELEGRAM_MANAGER_WEBHOOK_URL',
      'TELEGRAM_MERCHANT_WEBHOOK_BASE_URL',
    ].filter((key) => !process.env[key]?.trim());
    if (missing.length > 0) {
      return {
        ready: process.env.NODE_ENV !== 'production',
        missing,
      };
    }
    try {
      const response = await fetch(
        `${(process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org').replace(/\/$/, '')}/bot${encodeURIComponent(process.env.TELEGRAM_MANAGER_BOT_TOKEN || '')}/getMe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: { username?: string; can_manage_bots?: boolean };
      };
      const username = body.result?.username;
      const expectedUsername = (
        process.env.TELEGRAM_MANAGER_BOT_USERNAME || 'ZayOSManagerBot'
      ).replace(/^@/, '');
      if (!response.ok || body.ok !== true) {
        return { ready: false, error: 'telegram_manager_get_me_failed' };
      }
      if (
        username &&
        username.toLowerCase() !== expectedUsername.toLowerCase()
      ) {
        return {
          ready: false,
          error: 'telegram_manager_username_mismatch',
          username,
        };
      }
      if (body.result?.can_manage_bots !== true) {
        return {
          ready: false,
          error: `Telegram bot management is not enabled for @${expectedUsername}. Enable management of other bots in the BotFather Mini App.`,
        };
      }
      return { ready: true, username, canManageBots: true };
    } catch {
      return { ready: false, error: 'telegram_manager_unavailable' };
    }
  }

  private normalizeProvider(provider: string) {
    const normalized = (provider || '').trim().toLowerCase();
    return normalized === 'facebook' ? 'messenger' : normalized;
  }

  private assertRateLimit(key: string) {
    const result = this.rateLimiter.assertAllowed(key);

    if (!result.allowed) {
      console.log(
        JSON.stringify({
          event: 'provider_webhook_rate_limited',
          key,
          resetAt: new Date(result.resetAt).toISOString(),
        }),
      );
      throw new HttpException(
        'Webhook rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async validateSignature(provider: string, envelope: WebhookEnvelope) {
    if (provider === 'messenger') {
      throw new UnauthorizedException(
        'Messenger signature requires provider app configuration',
      );
    }

    if (provider === 'telegram') {
      const verificationConfig = await this.getProviderVerificationConfig(
        envelope.channelId,
        provider,
      );
      const expectedSecretToken = this.stringValue(
        verificationConfig?.secretToken,
      );
      const actualSecretToken = this.firstHeader(
        envelope.headers,
        'x-telegram-bot-api-secret-token',
      );

      if (!expectedSecretToken) {
        return {
          checked: true,
          valid: false,
          reason: 'missing_secret_token_configuration',
          algorithm: 'secret-token-header',
        };
      }

      return {
        checked: true,
        valid: Boolean(
          actualSecretToken &&
          this.safeCompare(actualSecretToken, expectedSecretToken),
        ),
        algorithm: 'secret-token-header',
        reason: actualSecretToken ? undefined : 'missing_secret_token_header',
      };
    }

    if (provider === 'tiktok') {
      return this.validateTikTokSignature(envelope);
    }

    if (provider === 'viber') {
      const authToken = process.env.VIBER_AUTH_TOKEN;
      const signature = this.firstHeader(
        envelope.headers,
        'x-viber-content-signature',
      );
      if (!authToken)
        return {
          checked: false,
          valid: undefined,
          reason: 'missing_auth_token',
        };
      if (!signature)
        return { checked: true, valid: false, reason: 'missing_signature' };
      const signatureBody =
        envelope.rawBody || Buffer.from(JSON.stringify(envelope.body));
      const expected = createHmac('sha256', authToken)
        .update(signatureBody)
        .digest('hex');
      return {
        checked: true,
        valid: this.safeCompare(signature, expected),
        algorithm: 'sha256',
      };
    }

    return { checked: false, valid: undefined };
  }

  private extractEventId(provider: string, envelope: WebhookEnvelope) {
    const body = envelope.body || {};

    if (provider === 'telegram') {
      return this.stringValue(body.update_id);
    }

    if (provider === 'messenger') {
      const entry = this.recordValue(
        Array.isArray(body.entry) ? body.entry[0] : undefined,
      );
      const messaging = this.recordValue(
        Array.isArray(entry?.messaging) ? entry.messaging[0] : undefined,
      );
      const message = this.recordValue(messaging?.message);
      const sender = this.recordValue(messaging?.sender);
      const senderId = this.stringValue(sender?.id) || '';
      const delivery = this.recordValue(messaging?.delivery);
      const read = this.recordValue(messaging?.read);
      const error =
        this.recordValue(messaging?.error) ||
        this.recordValue(delivery?.error) ||
        this.recordValue(message?.error);

      if (message?.mid) {
        return this.stringValue(message.mid);
      }

      if (delivery) {
        const mids = Array.isArray(delivery.mids)
          ? delivery.mids.join(',')
          : '';
        return `messenger-delivery-${senderId}-${this.stringValue(delivery.watermark) || ''}-${mids}`;
      }

      if (read) {
        return `messenger-read-${senderId}-${this.stringValue(read.watermark) || ''}`;
      }

      if (error) {
        return `messenger-error-${senderId}-${
          this.stringValue(error.code) || ''
        }-${this.stringValue(messaging?.timestamp) || ''}`;
      }
    }

    if (provider === 'viber') {
      const event = this.stringValue(body.event) || 'event';
      const token =
        this.stringValue(body.message_token) ||
        this.stringValue(body.timestamp);
      const user = this.recordValue(body.user) || this.recordValue(body.sender);
      const userId =
        this.stringValue(user?.id) || this.stringValue(body.user_id) || '';
      return token ? `viber-${event}-${token}-${userId}` : undefined;
    }

    if (provider === 'tiktok') {
      const data = this.recordValue(body.data);
      const lead =
        this.recordValue(body.lead) ||
        this.recordValue(body.lead_data) ||
        this.recordValue(data?.lead);
      const comment =
        this.recordValue(body.comment) ||
        this.recordValue(body.comment_data) ||
        this.recordValue(data?.comment);
      const explicitId = this.firstStringValue(
        body.event_id,
        body.message_id,
        body.lead_id,
        lead?.lead_id,
        lead?.id,
        body.comment_id,
        comment?.comment_id,
        comment?.id,
      );
      if (explicitId) {
        return `tiktok-${explicitId}`;
      }

      if (
        body.event ||
        body.event_type ||
        body.create_time ||
        body.user_openid ||
        body.content ||
        lead ||
        comment
      ) {
        const digest = createHash('sha256')
          .update(
            JSON.stringify({
              event: body.event || body.event_type,
              createTime: body.create_time || body.timestamp,
              userOpenId:
                body.user_openid || lead?.user_openid || comment?.open_id,
              content:
                body.content || body.text || lead?.content || comment?.text,
              leadId: lead?.lead_id || lead?.id,
              commentId: comment?.comment_id || comment?.id,
            }),
          )
          .digest('hex')
          .slice(0, 24);
        return `tiktok-${digest}`;
      }
    }

    return undefined;
  }

  private stableWebhookFallbackEventId(
    provider: string,
    envelope: WebhookEnvelope,
  ) {
    const digest = createHash('sha256')
      .update(
        this.stableJson({
          provider,
          channelId: envelope.channelId,
          query: envelope.query,
          body: envelope.body,
        }),
      )
      .digest('hex')
      .slice(0, 32);

    return `${provider}-${envelope.channelId}-${digest}`;
  }

  private stableJson(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    }

    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.stableJson(record[key])}`)
      .join(',')}}`;
  }

  private firstHeader(
    headers: Record<string, string | string[] | undefined>,
    key: string,
  ) {
    const value = headers[key] || headers[key.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  private hasHeader(
    headers: Record<string, string | string[] | undefined>,
    key: string,
  ) {
    return Boolean(this.firstHeader(headers, key));
  }

  private stringValue(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return undefined;
  }

  private firstStringValue(...values: unknown[]) {
    for (const value of values) {
      const stringValue = this.stringValue(value);
      if (stringValue) return stringValue;
    }

    return undefined;
  }

  private recordValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private safeCompare(actual: string, expected: string) {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);

    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private async validateTikTokSignature(envelope: WebhookEnvelope) {
    const verificationConfig = await this.getProviderVerificationConfig(
      envelope.channelId,
      'tiktok',
    );
    const clientSecret = this.stringValue(verificationConfig?.clientSecret);
    const signatureHeader = this.firstHeader(
      envelope.headers,
      'tiktok-signature',
    );

    if (!clientSecret) {
      return {
        checked: true,
        valid: false,
        reason: 'missing_client_secret',
      };
    }

    if (!signatureHeader) {
      return { checked: true, valid: false, reason: 'missing_signature' };
    }

    const signatureParts = Object.fromEntries(
      signatureHeader.split(',').map((part) => {
        const [key, ...value] = part.trim().split('=');
        return [key, value.join('=')];
      }),
    );
    const timestamp = Number(signatureParts.t);
    const actualSignature = signatureParts.s;
    if (!Number.isFinite(timestamp) || timestamp <= 0 || !actualSignature) {
      return { checked: true, valid: false, reason: 'malformed_signature' };
    }

    const rawBody =
      envelope.rawBody || Buffer.from(JSON.stringify(envelope.body));
    const expectedSignature = createHmac('sha256', clientSecret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');
    const signatureValid = this.safeCompare(actualSignature, expectedSignature);
    const toleranceSeconds = Math.max(
      0,
      Number(process.env.TIKTOK_SIGNATURE_TOLERANCE_SECONDS || 300),
    );
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
    const timestampValid = ageSeconds <= toleranceSeconds;

    return {
      checked: true,
      valid: signatureValid && timestampValid,
      algorithm: 'hmac-sha256',
      timestamp,
      ageSeconds,
      toleranceSeconds,
      reason: !signatureValid
        ? 'signature_mismatch'
        : !timestampValid
          ? 'signature_timestamp_outside_tolerance'
          : undefined,
    };
  }

  private validateMessengerSignature(
    envelope: WebhookEnvelope,
    appConfig: MessengerProviderAppWebhookConfig,
  ) {
    const appSecret = this.stringValue(appConfig.webhookConfig?.appSecret);
    const signatureHeader = this.firstHeader(
      envelope.headers,
      'x-hub-signature-256',
    );

    if (!appSecret) {
      return {
        checked: true,
        valid: false,
        reason: 'missing_app_secret',
        algorithm: 'hmac-sha256',
      };
    }

    if (!signatureHeader) {
      return {
        checked: true,
        valid: false,
        reason: 'missing_signature',
        algorithm: 'hmac-sha256',
      };
    }

    if (!envelope.rawBody) {
      return {
        checked: true,
        valid: false,
        reason: 'missing_raw_body',
        algorithm: 'hmac-sha256',
      };
    }

    const expected = `sha256=${createHmac('sha256', appSecret)
      .update(envelope.rawBody)
      .digest('hex')}`;

    return {
      checked: true,
      valid: this.safeCompare(signatureHeader, expected),
      algorithm: 'hmac-sha256',
    };
  }

  private async getMessengerProviderAppConfig(
    routingId: string,
  ): Promise<MessengerProviderAppWebhookConfig> {
    const coreApiUrl = process.env.CORE_API_URL;
    if (!coreApiUrl) {
      throw new UnauthorizedException(
        'CORE_API_URL is required for Messenger provider app routing',
      );
    }

    const response = await fetch(
      `${coreApiUrl.replace(/\/$/, '')}/internal/provider-app-configs/messenger/${encodeURIComponent(routingId)}/webhook-config`,
      {
        method: 'GET',
        headers: this.getInternalApiHeaders([
          SERVICE_SCOPES.CHANNEL_CREDENTIALS_READ,
        ]),
      },
    );

    if (response.status === 400 || response.status === 404) {
      throw new NotFoundException('Webhook route not found');
    }

    if (!response.ok) {
      throw new UnauthorizedException(
        'Unable to resolve Messenger provider app route',
      );
    }

    const body = (await response.json()) as MessengerProviderAppWebhookConfig;
    if (
      body.provider !== 'messenger' ||
      body.routingId !== routingId ||
      !body.providerAppConfigId
    ) {
      throw new NotFoundException('Webhook route not found');
    }

    return body;
  }

  private async resolveMessengerPageChannel(
    routingId: string,
    pageId: string,
  ): Promise<ResolvedWebhookChannel> {
    const coreApiUrl = process.env.CORE_API_URL;
    if (!coreApiUrl) {
      throw new UnauthorizedException(
        'CORE_API_URL is required for Messenger Page routing',
      );
    }

    const response = await fetch(
      `${coreApiUrl.replace(/\/$/, '')}/internal/provider-app-configs/messenger/${encodeURIComponent(routingId)}/pages/${encodeURIComponent(pageId)}/webhook-resolution`,
      {
        method: 'GET',
        headers: this.getInternalApiHeaders([
          SERVICE_SCOPES.CHANNEL_WEBHOOK_RESOLVE,
        ]),
      },
    );

    if (response.status === 400 || response.status === 404) {
      throw new NotFoundException('Webhook route not found');
    }

    if (!response.ok) {
      throw new UnauthorizedException('Unable to resolve Messenger Page route');
    }

    const body = (await response.json()) as ResolvedWebhookChannel;
    if (body.provider !== 'messenger' || !body.channelId || !body.tenantId) {
      throw new NotFoundException('Webhook route not found');
    }

    return body;
  }

  private async getProviderVerificationConfig(
    channelId: string,
    provider: string,
  ) {
    const coreApiUrl = process.env.CORE_API_URL;
    if (!coreApiUrl) {
      throw new UnauthorizedException(
        'CORE_API_URL is required for provider webhook verification',
      );
    }

    const response = await fetch(
      `${coreApiUrl.replace(/\/$/, '')}/internal/channels/${encodeURIComponent(channelId)}/providers/${encodeURIComponent(provider)}/verification`,
      {
        method: 'GET',
        headers: this.getInternalApiHeaders([
          SERVICE_SCOPES.CHANNEL_CREDENTIALS_READ,
        ]),
      },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new UnauthorizedException(
        `Unable to load ${provider} verification config for channel ${channelId}`,
      );
    }

    const body = (await response.json()) as {
      verification?: Record<string, unknown>;
    };
    return body.verification || null;
  }

  private async updateProviderCredentials(
    channelId: string,
    provider: string,
    credentials: Record<string, unknown>,
  ) {
    const coreApiUrl = process.env.CORE_API_URL;
    if (!coreApiUrl) {
      throw new UnauthorizedException(
        'CORE_API_URL is required for provider credential updates',
      );
    }

    const response = await fetch(
      `${coreApiUrl.replace(/\/$/, '')}/internal/channels/${encodeURIComponent(channelId)}/providers/${encodeURIComponent(provider)}/credentials`,
      {
        method: 'PUT',
        headers: {
          ...this.getInternalApiHeaders([
            SERVICE_SCOPES.CHANNEL_CREDENTIALS_WRITE,
          ]),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credentials }),
      },
    );

    if (!response.ok) {
      throw new UnauthorizedException(
        `Unable to update ${provider} credentials for channel ${channelId}`,
      );
    }
  }

  private async updateWebhookRegistrationStatus(
    channelId: string,
    provider: string,
    status: 'registered' | 'failed',
    errorCode?: string,
  ) {
    const coreApiUrl = process.env.CORE_API_URL;
    if (!coreApiUrl) {
      throw new UnauthorizedException(
        'CORE_API_URL is required for provider webhook registration status',
      );
    }

    const response = await fetch(
      `${coreApiUrl.replace(/\/$/, '')}/internal/channels/${encodeURIComponent(channelId)}/providers/${encodeURIComponent(provider)}/webhook-registration`,
      {
        method: 'PUT',
        headers: {
          ...this.getInternalApiHeaders([SERVICE_SCOPES.WEBHOOK_REGISTER]),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, errorCode: errorCode || null }),
      },
    );

    if (!response.ok) {
      throw new UnauthorizedException(
        `Unable to update ${provider} webhook registration status for channel ${channelId}`,
      );
    }
  }

  private async resolveWebhookChannel(
    channelId: string,
    provider: string,
  ): Promise<ResolvedWebhookChannel> {
    const normalizedChannelId = (channelId || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(normalizedChannelId)) {
      throw new BadRequestException('Invalid webhook route');
    }

    const coreApiUrl = process.env.CORE_API_URL;
    if (!coreApiUrl) {
      throw new UnauthorizedException(
        'CORE_API_URL is required for provider webhook routing',
      );
    }

    const response = await fetch(
      `${coreApiUrl.replace(/\/$/, '')}/internal/channels/${encodeURIComponent(normalizedChannelId)}/providers/${encodeURIComponent(provider)}/webhook-resolution`,
      {
        method: 'GET',
        headers: this.getInternalApiHeaders([
          SERVICE_SCOPES.CHANNEL_WEBHOOK_RESOLVE,
        ]),
      },
    );

    if (response.status === 400 || response.status === 404) {
      throw new NotFoundException('Webhook route not found');
    }

    if (!response.ok) {
      throw new UnauthorizedException('Unable to resolve webhook route');
    }

    const body = (await response.json()) as ResolvedWebhookChannel;
    if (
      body.provider !== provider ||
      body.channelId !== normalizedChannelId ||
      !body.tenantId
    ) {
      throw new NotFoundException('Webhook route not found');
    }

    return body;
  }

  private getInternalApiHeaders(scopes: string[]) {
    return {
      ...serviceAuthHeaders({
        audience: SERVICE_IDENTITIES.CORE,
        subject: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
        scopes,
      }),
    };
  }
}
