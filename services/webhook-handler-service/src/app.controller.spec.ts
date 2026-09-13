import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';

import { AppController } from './app.controller';
import { AppService } from './app.service';

const telegramChannelId = '11111111-1111-4111-8111-111111111111';
const messengerChannelId = '22222222-2222-4222-8222-222222222222';
const messengerAppRoutingId = 'meta-app-route-1';
const messengerPageId = '1234567890';
const tiktokChannelId = '33333333-3333-4333-8333-333333333333';
const viberChannelId = '44444444-4444-4444-8444-444444444444';

describe('AppController', () => {
  let appController: AppController;
  const originalCoreApiUrl = process.env.CORE_API_URL;
  const originalMessengerAppSecret = process.env.MESSENGER_APP_SECRET;
  const originalTikTokTolerance =
    process.env.TIKTOK_SIGNATURE_TOLERANCE_SECONDS;
  const originalViberAuthToken = process.env.VIBER_AUTH_TOKEN;
  const originalInternalSigningKey =
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWebhookQueueBackend = process.env.WEBHOOK_QUEUE_BACKEND;
  const originalWebhookRedisKeyPrefix = process.env.WEBHOOK_REDIS_KEY_PREFIX;
  const originalChatIngestionUrl = process.env.CHAT_INGESTION_URL;
  const originalBacklogAlertDepth =
    process.env.WEBHOOK_QUEUE_BACKLOG_ALERT_DEPTH;
  const originalBacklogAlertAge =
    process.env.WEBHOOK_QUEUE_BACKLOG_ALERT_AGE_MS;
  const originalQueueMaxAttempts = process.env.WEBHOOK_QUEUE_MAX_ATTEMPTS;
  const originalQueueRetryBaseDelay =
    process.env.WEBHOOK_QUEUE_RETRY_BASE_DELAY_MS;
  const originalTelegramManagerSecret =
    process.env.TELEGRAM_MANAGER_WEBHOOK_SECRET;
  const originalTelegramManagerToken = process.env.TELEGRAM_MANAGER_BOT_TOKEN;
  const originalTelegramManagerUsername =
    process.env.TELEGRAM_MANAGER_BOT_USERNAME;
  const originalTelegramManagerWebhookUrl =
    process.env.TELEGRAM_MANAGER_WEBHOOK_URL;
  const originalTelegramMerchantWebhookBaseUrl =
    process.env.TELEGRAM_MERCHANT_WEBHOOK_BASE_URL;

  beforeEach(async () => {
    process.env.CORE_API_URL = 'http://core.test';
    process.env.WEBHOOK_QUEUE_BACKEND = 'memory';
    delete process.env.WEBHOOK_REDIS_KEY_PREFIX;
    delete process.env.CHAT_INGESTION_URL;
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY =
      'test-internal-service-token-signing-key-32-chars';
    process.env.TELEGRAM_MANAGER_WEBHOOK_SECRET = 'telegram-manager-secret';
    process.env.TELEGRAM_MANAGER_BOT_TOKEN =
      '123456789:testTelegramManagerBotTokenValue';
    process.env.TELEGRAM_MANAGER_BOT_USERNAME = 'ZayOSManagerBot';
    process.env.TELEGRAM_MANAGER_WEBHOOK_URL =
      'https://hooks.example.com/webhooks/telegram/manager';
    process.env.TELEGRAM_MERCHANT_WEBHOOK_BASE_URL =
      'https://hooks.example.com';
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  afterEach(() => {
    restoreEnv('CORE_API_URL', originalCoreApiUrl);
    restoreEnv('MESSENGER_APP_SECRET', originalMessengerAppSecret);
    restoreEnv('TIKTOK_SIGNATURE_TOLERANCE_SECONDS', originalTikTokTolerance);
    restoreEnv('VIBER_AUTH_TOKEN', originalViberAuthToken);
    restoreEnv(
      'INTERNAL_SERVICE_TOKEN_SIGNING_KEY',
      originalInternalSigningKey,
    );
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('WEBHOOK_QUEUE_BACKEND', originalWebhookQueueBackend);
    restoreEnv('WEBHOOK_REDIS_KEY_PREFIX', originalWebhookRedisKeyPrefix);
    restoreEnv('CHAT_INGESTION_URL', originalChatIngestionUrl);
    restoreEnv('WEBHOOK_QUEUE_BACKLOG_ALERT_DEPTH', originalBacklogAlertDepth);
    restoreEnv('WEBHOOK_QUEUE_BACKLOG_ALERT_AGE_MS', originalBacklogAlertAge);
    restoreEnv('WEBHOOK_QUEUE_MAX_ATTEMPTS', originalQueueMaxAttempts);
    restoreEnv(
      'WEBHOOK_QUEUE_RETRY_BASE_DELAY_MS',
      originalQueueRetryBaseDelay,
    );
    restoreEnv(
      'TELEGRAM_MANAGER_WEBHOOK_SECRET',
      originalTelegramManagerSecret,
    );
    restoreEnv('TELEGRAM_MANAGER_BOT_TOKEN', originalTelegramManagerToken);
    restoreEnv(
      'TELEGRAM_MANAGER_BOT_USERNAME',
      originalTelegramManagerUsername,
    );
    restoreEnv(
      'TELEGRAM_MANAGER_WEBHOOK_URL',
      originalTelegramManagerWebhookUrl,
    );
    restoreEnv(
      'TELEGRAM_MERCHANT_WEBHOOK_BASE_URL',
      originalTelegramMerchantWebhookBaseUrl,
    );
    jest.restoreAllMocks();
  });

  it('returns minimal health status', async () => {
    expect(appController.getHealth()).toMatchObject({
      service: 'webhook-handler-service',
      status: 'ok',
    });
  });

  it('does not report production ready with the in-memory webhook queue', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CHAT_INGESTION_URL = 'http://chat-ingestion.test';

    await expect(appController.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('includes queue observability and alert flags in metrics', async () => {
    process.env.WEBHOOK_QUEUE_BACKLOG_ALERT_DEPTH = '0';
    process.env.WEBHOOK_QUEUE_BACKLOG_ALERT_AGE_MS = '0';

    await expect(appController.getMetrics()).resolves.toMatchObject({
      queue: expect.objectContaining({
        pending: 0,
        processing: 0,
        retrying: 0,
        oldestPendingAgeMs: 0,
      }),
      alerts: {
        queueBacklogDepth: true,
        queueBacklogAge: true,
        deadLetterGrowth: false,
      },
    });
  });

  it('accepts a Telegram webhook for a resolved UUID channel', async () => {
    mockCoreFetch({
      verification: { telegram: { secretToken: 'telegram-secret' } },
    });

    await expect(
      appController.receiveWebhook(
        'telegram',
        telegramChannelId,
        { 'x-telegram-bot-api-secret-token': 'telegram-secret' },
        {},
        {
          update_id: 'update-1',
          message: { message_id: 'message-1', text: 'Hello' },
        },
      ),
    ).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
      eventId: 'update-1',
      provider: 'telegram',
      channelId: telegramChannelId,
      queueState: 'completed',
      forwardedToChatIngestion: false,
    });
  });

  it('acknowledges disabled UUID-channel webhooks without queueing or forwarding', async () => {
    mockCoreFetch({
      disabledResolution: {
        channelId: telegramChannelId,
        provider: 'telegram',
      },
      verification: { telegram: { secretToken: 'telegram-secret' } },
    });

    await expect(
      appController.receiveWebhook(
        'telegram',
        telegramChannelId,
        { 'x-telegram-bot-api-secret-token': 'telegram-secret' },
        {},
        { update_id: 'disabled-update', message: { text: 'ignored' } },
      ),
    ).resolves.toMatchObject({
      accepted: true,
      disposition: 'acknowledge_without_ingestion',
      reasonCode: 'CHANNEL_DISABLED',
      queued: false,
      forwardedToChatIngestion: false,
    });
  });

  it('rejects an invalid signature before acknowledging a disabled UUID route', async () => {
    mockCoreFetch({
      disabledResolution: {
        channelId: telegramChannelId,
        provider: 'telegram',
      },
      verification: { telegram: { secretToken: 'telegram-secret' } },
    });

    await expect(
      appController.receiveWebhook(
        'telegram',
        telegramChannelId,
        { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
        {},
        { update_id: 'disabled-invalid-signature' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deduplicates repeated provider webhook deliveries for the same UUID route', async () => {
    mockCoreFetch({
      verification: { telegram: { secretToken: 'telegram-secret' } },
    });
    const body = {
      update_id: 'update-2',
      message: { message_id: 'message-2', text: 'Hello again' },
    };

    await appController.receiveWebhook(
      'telegram',
      telegramChannelId,
      { 'x-telegram-bot-api-secret-token': 'telegram-secret' },
      {},
      body,
    );

    await expect(
      appController.receiveWebhook(
        'telegram',
        telegramChannelId,
        { 'x-telegram-bot-api-secret-token': 'telegram-secret' },
        {},
        body,
      ),
    ).resolves.toMatchObject({
      accepted: true,
      duplicate: true,
      eventId: 'update-2',
      provider: 'telegram',
      channelId: telegramChannelId,
    });
  });

  it('rejects Telegram manager webhooks with an invalid secret header', async () => {
    await expect(
      appController.receiveTelegramManagerWebhook(
        { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
        { update_id: 9001 },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('handles Telegram manager /start by sending the managed-bot keyboard', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, init) => {
        const target = String(url);
        if (target === 'http://core.test/internal/telegram/managed-bot/start') {
          expect(JSON.parse(String(init?.body))).toMatchObject({
            state: 'state_abcdefghijklmnopqrstuvwxyz012345',
            telegramUserId: '10001',
            telegramChatId: '10001',
          });
          return new Response(
            JSON.stringify({
              telegramRequestId: 42,
              suggestedName: 'Golden Mobile',
              suggestedUsername: 'GoldenMobileMMBot',
              message: 'Create your business bot below.',
            }),
            { status: 200 },
          );
        }
        if (target.includes('/sendMessage')) {
          const body = JSON.parse(String(init?.body));
          expect(
            body.reply_markup.keyboard[0][0].request_managed_bot,
          ).toMatchObject({
            request_id: 42,
            suggested_name: 'Golden Mobile',
            suggested_username: 'GoldenMobileMMBot',
          });
          return new Response(
            JSON.stringify({ ok: true, result: { message_id: 1 } }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 404 });
      });

    await expect(
      appController.receiveTelegramManagerWebhook(
        { 'x-telegram-bot-api-secret-token': 'telegram-manager-secret' },
        {
          update_id: 9002,
          message: {
            text: '/start state_abcdefghijklmnopqrstuvwxyz012345',
            from: { id: 10001 },
            chat: { id: 10001 },
          },
        },
      ),
    ).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
      action: 'telegram_manager_started',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates repeated Telegram manager update IDs', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          telegramRequestId: 42,
          suggestedName: 'Golden Mobile',
          suggestedUsername: 'GoldenMobileMMBot',
          message: 'Create your business bot below.',
        }),
        { status: 200 },
      ),
    );
    const body = {
      update_id: 9003,
      message: {
        text: '/start state_abcdefghijklmnopqrstuvwxyz012346',
        from: { id: 10001 },
        chat: { id: 10001 },
      },
    };

    await appController.receiveTelegramManagerWebhook(
      { 'x-telegram-bot-api-secret-token': 'telegram-manager-secret' },
      body,
    );
    await expect(
      appController.receiveTelegramManagerWebhook(
        { 'x-telegram-bot-api-secret-token': 'telegram-manager-secret' },
        body,
      ),
    ).resolves.toMatchObject({
      accepted: true,
      duplicate: true,
      eventId: 'telegram-manager-9003',
    });
  });

  it('rejects malformed webhook channel identifiers before core lookup', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      appController.receiveWebhook(
        'telegram',
        'not-a-uuid',
        {},
        {},
        { update_id: 'bad' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects provider mismatches without revealing the stored channel provider', async () => {
    mockCoreFetch({
      rejectResolution: {
        channelId: messengerChannelId,
        provider: 'telegram',
      },
    });

    await expect(
      appController.receiveWebhook(
        'telegram',
        messengerChannelId,
        {},
        {},
        { update_id: 'mismatch' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('derives stable idempotency keys for Messenger delivery callbacks after Page resolution', async () => {
    mockCoreFetch();
    const rawBody = Buffer.from(
      JSON.stringify({
        object: 'page',
        entry: [
          {
            id: messengerPageId,
            messaging: [
              {
                sender: { id: 'psid-1' },
                delivery: {
                  mids: ['mid.1'],
                  watermark: 1_750_000_000_000,
                },
              },
            ],
          },
        ],
      }),
    );
    const body = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    const signature = signMessenger(rawBody);

    await expect(
      appController.receiveWebhook(
        'messenger',
        messengerAppRoutingId,
        { 'x-hub-signature-256': signature },
        {},
        body,
        { rawBody } as any,
      ),
    ).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
      eventId: 'messenger-delivery-psid-1-1750000000000-mid.1',
      channelId: messengerChannelId,
    });

    await expect(
      appController.receiveWebhook(
        'messenger',
        messengerAppRoutingId,
        { 'x-hub-signature-256': signature },
        {},
        body,
        { rawBody } as any,
      ),
    ).resolves.toMatchObject({
      accepted: true,
      duplicate: true,
      eventId: 'messenger-delivery-psid-1-1750000000000-mid.1',
      channelId: messengerChannelId,
    });
  });

  it('acknowledges disabled Messenger page callbacks without queueing', async () => {
    mockCoreFetch({
      disabledResolution: {
        channelId: messengerChannelId,
        provider: 'messenger',
      },
    });
    const rawBody = Buffer.from(
      JSON.stringify({
        object: 'page',
        entry: [
          {
            id: messengerPageId,
            messaging: [
              {
                sender: { id: 'psid-disabled' },
                message: { mid: 'mid-disabled' },
              },
            ],
          },
        ],
      }),
    );

    await expect(
      appController.receiveWebhook(
        'messenger',
        messengerAppRoutingId,
        { 'x-hub-signature-256': signMessenger(rawBody) },
        {},
        JSON.parse(rawBody.toString()),
        { rawBody } as any,
      ),
    ).resolves.toMatchObject({
      accepted: true,
      disposition: 'acknowledge_without_ingestion',
      reasonCode: 'CHANNEL_DISABLED',
      queued: false,
    });
  });

  it('routes shared Messenger webhook callbacks to the correct tenant by page ID', async () => {
    const tenantAPageId = '1234567890';
    const tenantBPageId = '0987654321';
    const tenantAChannelId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const tenantBChannelId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/internal/provider-app-configs/messenger/')) {
        if (url.includes('/webhook-config')) {
          return new Response(
            JSON.stringify({
              provider: 'messenger',
              providerAppConfigId: 'default-meta-app',
              routingId: messengerAppRoutingId,
              graphApiVersion: 'v25.0',
              status: 'development_only',
              webhookConfig: {
                appSecret: 'test-app-secret',
                verifyToken: 'test-verify-token',
              },
            }),
            { status: 200 },
          );
        }
        const pageMatch = url.match(
          /\/internal\/provider-app-configs\/messenger\/[^/]+\/pages\/([^/]+)\/webhook-resolution/,
        );
        if (pageMatch) {
          const pageId = pageMatch[1];
          if (pageId === tenantAPageId) {
            return new Response(
              JSON.stringify({
                channelId: tenantAChannelId,
                tenantId: 'tenant-a',
                provider: 'messenger',
                providerAppConfigId: 'default-meta-app',
                providerAppRoutingId: messengerAppRoutingId,
                externalPageId: tenantAPageId,
                status: 'active',
                connectionStatus: 'ready',
              }),
              { status: 200 },
            );
          }
          if (pageId === tenantBPageId) {
            return new Response(
              JSON.stringify({
                channelId: tenantBChannelId,
                tenantId: 'tenant-b',
                provider: 'messenger',
                providerAppConfigId: 'default-meta-app',
                providerAppRoutingId: messengerAppRoutingId,
                externalPageId: tenantBPageId,
                status: 'active',
                connectionStatus: 'ready',
              }),
              { status: 200 },
            );
          }
        }
        return new Response(JSON.stringify({ message: 'Not found' }), {
          status: 404,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const rawBodyA = Buffer.from(
      JSON.stringify({
        object: 'page',
        entry: [
          {
            id: tenantAPageId,
            messaging: [
              { sender: { id: 'psid-a' }, message: { mid: 'mid.a' } },
            ],
          },
        ],
      }),
    );
    const rawBodyB = Buffer.from(
      JSON.stringify({
        object: 'page',
        entry: [
          {
            id: tenantBPageId,
            messaging: [
              { sender: { id: 'psid-b' }, message: { mid: 'mid.b' } },
            ],
          },
        ],
      }),
    );
    const signatureA = signMessenger(rawBodyA);
    const signatureB = signMessenger(rawBodyB);

    const resultA = await appController.receiveWebhook(
      'messenger',
      messengerAppRoutingId,
      { 'x-hub-signature-256': signatureA },
      {},
      JSON.parse(rawBodyA.toString()),
      { rawBody: rawBodyA } as any,
    );
    const resultB = await appController.receiveWebhook(
      'messenger',
      messengerAppRoutingId,
      { 'x-hub-signature-256': signatureB },
      {},
      JSON.parse(rawBodyB.toString()),
      { rawBody: rawBodyB } as any,
    );

    expect(resultA).toMatchObject({
      accepted: true,
      channelId: tenantAChannelId,
      provider: 'messenger',
    });
    expect(resultB).toMatchObject({
      accepted: true,
      channelId: tenantBChannelId,
      provider: 'messenger',
    });
  });

  it('verifies Messenger signatures against the exact raw request body', async () => {
    mockCoreFetch();
    const rawBody = Buffer.from(
      `{"object":"page","entry":[{"id":"${messengerPageId}","messaging":[{"sender":{"id":"psid-1"},"message":{"mid":"mid.signed","text":"Hello"}}]}]}`,
    );
    const body = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    const signature = signMessenger(rawBody);

    await expect(
      appController.receiveWebhook(
        'messenger',
        messengerAppRoutingId,
        { 'x-hub-signature-256': signature },
        {},
        body,
        {
          rawBody,
        } as any,
      ),
    ).resolves.toMatchObject({
      accepted: true,
      signature: {
        checked: true,
        valid: true,
        algorithm: 'hmac-sha256',
      },
    });
  });

  it('rejects invalid Messenger webhook signatures', async () => {
    mockCoreFetch();
    const rawBody = Buffer.from(
      `{"object":"page","entry":[{"id":"${messengerPageId}","messaging":[]}]}`,
    );

    await expect(
      appController.receiveWebhook(
        'messenger',
        messengerAppRoutingId,
        { 'x-hub-signature-256': 'sha256=invalid' },
        {},
        JSON.parse(rawBody.toString()),
        { rawBody } as any,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies official TikTok webhook signatures and derives stable event IDs', async () => {
    mockCoreFetch({
      verification: { tiktok: { clientSecret: 'test-tiktok-secret' } },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const rawBody = Buffer.from(
      '{"client_key":"client-1","event":"authorization.removed","create_time":1750000000,"user_openid":"open-1","content":"{\\"reason\\":1}"}',
    );
    const body = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    const signature = createHmac('sha256', 'test-tiktok-secret')
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    const result = await appController.receiveWebhook(
      'tiktok',
      tiktokChannelId,
      { 'tiktok-signature': `t=${timestamp},s=${signature}` },
      {},
      body,
      { rawBody } as any,
    );

    expect(result).toMatchObject({
      accepted: true,
      eventId: expect.stringMatching(/^tiktok-[a-f0-9]{24}$/),
      channelId: tiktokChannelId,
      signature: {
        checked: true,
        valid: true,
        algorithm: 'hmac-sha256',
      },
    });

    await expect(
      appController.receiveWebhook(
        'tiktok',
        tiktokChannelId,
        { 'tiktok-signature': `t=${timestamp},s=${signature}` },
        {},
        body,
        { rawBody } as any,
      ),
    ).resolves.toMatchObject({
      duplicate: true,
      eventId: result.eventId,
    });
  });

  it('rejects stale TikTok webhook signatures', async () => {
    process.env.TIKTOK_SIGNATURE_TOLERANCE_SECONDS = '300';
    mockCoreFetch({
      verification: { tiktok: { clientSecret: 'test-tiktok-secret' } },
    });
    const timestamp = Math.floor(Date.now() / 1000) - 3600;
    const rawBody = Buffer.from('{"event":"authorization.removed"}');
    const signature = createHmac('sha256', 'test-tiktok-secret')
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    await expect(
      appController.receiveWebhook(
        'tiktok',
        tiktokChannelId,
        { 'tiktok-signature': `t=${timestamp},s=${signature}` },
        {},
        JSON.parse(rawBody.toString()),
        { rawBody } as any,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects Telegram callbacks with the wrong secret token', async () => {
    mockCoreFetch({
      verification: { telegram: { secretToken: 'expected-secret' } },
    });

    await expect(
      appController.receiveWebhook(
        'telegram',
        telegramChannelId,
        { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
        {},
        { update_id: 'update-3' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('treats chat ingestion database outages as retryable failures', async () => {
    process.env.CHAT_INGESTION_URL = 'http://chat-ingestion.test';
    process.env.WEBHOOK_QUEUE_MAX_ATTEMPTS = '2';
    process.env.WEBHOOK_QUEUE_RETRY_BASE_DELAY_MS = '0';

    const retryModule: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    const retryController = retryModule.get<AppController>(AppController);
    const chatAttempts: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'http://chat-ingestion.test/ingest') {
        chatAttempts.push(url);
        return new Response(
          JSON.stringify({ message: 'database unavailable' }),
          { status: 503 },
        );
      }
      const resolution = url.match(
        /\/internal\/channels\/([^/]+)\/providers\/([^/]+)\/webhook-resolution/,
      );
      if (resolution) {
        const [, channelId, provider] = resolution;
        return new Response(
          JSON.stringify({
            channelId,
            tenantId: 'tenant-1',
            provider,
            status: 'active',
            connectionStatus: 'ready',
            webhookRegistrationStatus: 'registered',
          }),
          { status: 200 },
        );
      }
      const verification = url.match(
        /\/internal\/channels\/([^/]+)\/providers\/([^/]+)\/verification/,
      );
      if (verification) {
        return new Response(
          JSON.stringify({ verification: { secretToken: 'telegram-secret' } }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(
      retryController.receiveWebhook(
        'telegram',
        telegramChannelId,
        { 'x-telegram-bot-api-secret-token': 'telegram-secret' },
        {},
        {
          update_id: 'update-db-outage',
          message: { message_id: 'message-db-outage', text: 'Retry me' },
        },
      ),
    ).resolves.toMatchObject({
      accepted: true,
      queueState: 'dead_lettered',
      forwardedToChatIngestion: false,
    });

    expect(chatAttempts).toHaveLength(2);
    await expect(retryController.getDeadLetters()).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          eventId: 'update-db-outage',
          attempts: 2,
          failureClass: 'retryable',
          failureCode: 'chat_ingestion_http_503_retryable',
        }),
      ],
    });
  });

  it('validates Viber HMAC signatures and derives stable event IDs', async () => {
    process.env.VIBER_AUTH_TOKEN = 'viber-secret';
    mockCoreFetch();
    const body = {
      event: 'message',
      message_token: 123,
      sender: { id: 'user-1' },
      message: { type: 'text', text: 'Hello' },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'viber-secret')
      .update(rawBody)
      .digest('hex');

    await expect(
      appController.receiveWebhook(
        'viber',
        viberChannelId,
        { 'x-viber-content-signature': signature },
        {},
        body,
        {
          rawBody,
        } as any,
      ),
    ).resolves.toMatchObject({
      accepted: true,
      eventId: 'viber-message-123-user-1',
      provider: 'viber',
      channelId: viberChannelId,
      signature: { checked: true, valid: true },
    });
  });

  it('rejects invalid Viber signatures', async () => {
    process.env.VIBER_AUTH_TOKEN = 'viber-secret';
    mockCoreFetch();
    const body = { event: 'delivered', message_token: 456, user_id: 'user-1' };

    await expect(
      appController.receiveWebhook(
        'viber',
        viberChannelId,
        { 'x-viber-content-signature': 'invalid' },
        {},
        body,
        { rawBody: Buffer.from(JSON.stringify(body)) } as any,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('registers Viber webhooks through the provider API with a UUID callback URL', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/set_webhook')) {
          return new Response(
            JSON.stringify({ status: 0, status_message: 'ok' }),
            { status: 200 },
          );
        }
        if (
          url.includes(
            `/internal/channels/${viberChannelId}/providers/viber/webhook-registration`,
          )
        ) {
          return new Response(JSON.stringify({ updated: true }), {
            status: 200,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });

    await expect(
      appController.registerViberWebhook(viberChannelId, {
        authToken: 'secret',
        webhookUrl: `https://api.zayos.com.mm/webhooks/viber/${viberChannelId}`,
      }),
    ).resolves.toMatchObject({ accepted: true, status: 'registered' });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/set_webhook'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function mockCoreFetch(
  options: {
    verification?: Record<string, Record<string, unknown>>;
    rejectResolution?: { channelId: string; provider: string };
    disabledResolution?: { channelId: string; provider: string };
  } = {},
) {
  jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    const providerAppConfig = url.match(
      /\/internal\/provider-app-configs\/messenger\/([^/]+)\/webhook-config/,
    );
    if (providerAppConfig) {
      const [, routingId] = providerAppConfig;
      if (routingId !== messengerAppRoutingId) {
        return new Response(JSON.stringify({ message: 'Not found' }), {
          status: 404,
        });
      }
      return new Response(
        JSON.stringify({
          provider: 'messenger',
          providerAppConfigId: 'default-meta-app',
          routingId: messengerAppRoutingId,
          graphApiVersion: 'v25.0',
          status: 'development_only',
          webhookConfig: {
            appSecret: 'test-app-secret',
            verifyToken: 'test-verify-token',
          },
        }),
        { status: 200 },
      );
    }

    const messengerPageResolution = url.match(
      /\/internal\/provider-app-configs\/messenger\/([^/]+)\/pages\/([^/]+)\/webhook-resolution/,
    );
    if (messengerPageResolution) {
      const [, routingId, pageId] = messengerPageResolution;
      if (routingId !== messengerAppRoutingId || pageId !== messengerPageId) {
        return new Response(JSON.stringify({ message: 'Not found' }), {
          status: 404,
        });
      }
      const disabled =
        options.disabledResolution?.channelId === messengerChannelId &&
        options.disabledResolution.provider === 'messenger';
      return new Response(
        JSON.stringify({
          channelId: messengerChannelId,
          tenantId: 'tenant-1',
          provider: 'messenger',
          providerAppConfigId: 'default-meta-app',
          providerAppRoutingId: messengerAppRoutingId,
          externalPageId: messengerPageId,
          status: disabled ? 'disabled' : 'active',
          connectionStatus: disabled ? 'disabled' : 'ready',
          disposition: disabled ? 'acknowledge_without_ingestion' : undefined,
          reasonCode: disabled ? 'CHANNEL_DISABLED' : undefined,
          webhookRegistrationStatus: 'registered',
        }),
        { status: 200 },
      );
    }

    const resolution = url.match(
      /\/internal\/channels\/([^/]+)\/providers\/([^/]+)\/webhook-resolution/,
    );
    if (resolution) {
      const [, channelId, provider] = resolution;
      if (
        options.rejectResolution &&
        options.rejectResolution.channelId === channelId &&
        options.rejectResolution.provider === provider
      ) {
        return new Response(JSON.stringify({ message: 'Channel not found' }), {
          status: 404,
        });
      }
      const disabled =
        options.disabledResolution &&
        options.disabledResolution.channelId === channelId &&
        options.disabledResolution.provider === provider;
      return new Response(
        JSON.stringify({
          channelId,
          tenantId: 'tenant-1',
          provider,
          status: disabled ? 'disabled' : 'active',
          disposition: disabled ? 'acknowledge_without_ingestion' : undefined,
          reasonCode: disabled ? 'CHANNEL_DISABLED' : undefined,
          connectionStatus: 'ready',
          webhookRegistrationStatus: 'registered',
        }),
        { status: 200 },
      );
    }

    const verification = url.match(
      /\/internal\/channels\/([^/]+)\/providers\/([^/]+)\/verification/,
    );
    if (verification) {
      const [, , provider] = verification;
      return new Response(
        JSON.stringify({
          verification: options.verification?.[provider] || {},
        }),
        { status: 200 },
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });
}

function signMessenger(rawBody: Buffer) {
  return `sha256=${createHmac('sha256', 'test-app-secret')
    .update(rawBody)
    .digest('hex')}`;
}
