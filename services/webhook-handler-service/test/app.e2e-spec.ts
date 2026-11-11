import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { createHmac } from 'crypto';
import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  serviceAuthHeaders,
} from '@zayos/internal-service-auth';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const telegramChannelId = '11111111-1111-4111-8111-111111111111';
  const messengerChannelId = '22222222-2222-4222-8222-222222222222';
  const tiktokChannelId = '33333333-3333-4333-8333-333333333333';
  const viberChannelId = '44444444-4444-4444-8444-444444444444';
  const originalChatIngestionUrl = process.env.CHAT_INGESTION_URL;
  const originalCoreApiUrl = process.env.CORE_API_URL;
  const originalMaxDepth = process.env.WEBHOOK_QUEUE_MAX_DEPTH;
  const originalMaxAttempts = process.env.WEBHOOK_QUEUE_MAX_ATTEMPTS;
  const originalRetryBaseDelay = process.env.WEBHOOK_QUEUE_RETRY_BASE_DELAY_MS;
  const originalMessengerAppSecret = process.env.MESSENGER_APP_SECRET;
  const originalTikTokClientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const originalViberAuthToken = process.env.VIBER_AUTH_TOKEN;
  const originalInternalSigningKey = process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;
  const coreRouteResponse = (url: string) => {
    const routes = [
      { channelId: telegramChannelId, provider: 'telegram' },
      { channelId: tiktokChannelId, provider: 'tiktok' },
      { channelId: viberChannelId, provider: 'viber' },
    ];
    for (const route of routes) {
      if (url.includes(`/internal/channels/${route.channelId}/providers/${route.provider}/webhook-resolution`)) {
        return new Response(
          JSON.stringify({
            channelId: route.channelId,
            tenantId: `tenant-${route.provider}`,
            provider: route.provider,
            status: 'active',
            connectionStatus: 'ready',
          }),
          { status: 200 },
        );
      }
    }
    return undefined;
  };

  beforeEach(async () => {
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = 'test-internal-service-token-signing-key-32-chars';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    restoreEnv('CHAT_INGESTION_URL', originalChatIngestionUrl);
    restoreEnv('CORE_API_URL', originalCoreApiUrl);
    restoreEnv('WEBHOOK_QUEUE_MAX_DEPTH', originalMaxDepth);
    restoreEnv('WEBHOOK_QUEUE_MAX_ATTEMPTS', originalMaxAttempts);
    restoreEnv('WEBHOOK_QUEUE_RETRY_BASE_DELAY_MS', originalRetryBaseDelay);
    restoreEnv('MESSENGER_APP_SECRET', originalMessengerAppSecret);
    restoreEnv('TIKTOK_CLIENT_SECRET', originalTikTokClientSecret);
    restoreEnv('VIBER_AUTH_TOKEN', originalViberAuthToken);
    restoreEnv('INTERNAL_SERVICE_TOKEN_SIGNING_KEY', originalInternalSigningKey);
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          service: 'webhook-handler-service',
          status: 'ok',
        });
      });
  });

  it('/webhooks/:provider/:channelId (POST)', () => {
    process.env.CORE_API_URL = 'http://core.test';
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const route = coreRouteResponse(url);
      if (route) return route;
      if (url.includes(`/internal/channels/${telegramChannelId}/providers/telegram/verification`)) {
        return new Response(JSON.stringify({ verification: { secretToken: 'telegram-secret' } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    return request(app.getHttpServer())
      .post(`/webhooks/telegram/${telegramChannelId}`)
      .set('X-Telegram-Bot-Api-Secret-Token', 'telegram-secret')
      .send({
        update_id: 'e2e-update-1',
        message: { message_id: 'message-1', text: 'Hello' },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          provider: 'telegram',
          channelId: telegramChannelId,
          forwardedToChatIngestion: false,
        });
      });
  });

  it('/webhooks/:provider/:channelId (POST duplicate)', async () => {
    const server = app.getHttpServer();
    process.env.CORE_API_URL = 'http://core.test';
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const route = coreRouteResponse(url);
      if (route) return route;
      if (url.includes(`/internal/channels/${telegramChannelId}/providers/telegram/verification`)) {
        return new Response(JSON.stringify({ verification: { secretToken: 'telegram-secret' } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const payload = {
      update_id: 'e2e-update-duplicate',
      message: { message_id: 'message-2', text: 'Hello twice' },
    };

    await request(server)
      .post(`/webhooks/telegram/${telegramChannelId}`)
      .set('X-Telegram-Bot-Api-Secret-Token', 'telegram-secret')
      .send(payload)
      .expect(201);

    await request(server)
      .post(`/webhooks/telegram/${telegramChannelId}`)
      .set('X-Telegram-Bot-Api-Secret-Token', 'telegram-secret')
      .send(payload)
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          duplicate: true,
          eventId: 'e2e-update-duplicate',
          provider: 'telegram',
          channelId: telegramChannelId,
        });
      });
  });

  it('/webhooks/:provider/:channelId returns retryable failure when durable enqueue fails', async () => {
    await app.close();
    process.env.WEBHOOK_QUEUE_MAX_DEPTH = '0';
    process.env.CORE_API_URL = 'http://core.test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const route = coreRouteResponse(url);
      if (route) return route;
      if (url.includes(`/internal/channels/${telegramChannelId}/providers/telegram/verification`)) {
        return new Response(JSON.stringify({ verification: { secretToken: 'telegram-secret' } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const payload = {
      update_id: 'e2e-enqueue-failure',
      message: { message_id: 'message-enqueue-failure', text: 'Retry later' },
    };

    await request(app.getHttpServer())
      .post(`/webhooks/telegram/${telegramChannelId}`)
      .set('X-Telegram-Bot-Api-Secret-Token', 'telegram-secret')
      .send(payload)
      .expect(503)
      .expect(({ body }) => {
        expect(body.message).toContain('provider should retry delivery');
      });

    restoreEnv('WEBHOOK_QUEUE_MAX_DEPTH', originalMaxDepth);
    await app.close();

    const retryModuleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = retryModuleFixture.createNestApplication({ rawBody: true });
    await app.init();
    fetchMock.mockClear();

    await request(app.getHttpServer())
      .post(`/webhooks/telegram/${telegramChannelId}`)
      .set('X-Telegram-Bot-Api-Secret-Token', 'telegram-secret')
      .send(payload)
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          duplicate: false,
          eventId: 'e2e-enqueue-failure',
        });
      });
  });

  it('/webhooks/messenger/:channelId forwards delivery callbacks with a stable event ID', async () => {
    process.env.CHAT_INGESTION_URL = 'http://chat-ingestion:3000';
    process.env.CORE_API_URL = 'http://core.test';
    const rawBody =
      '{"object":"page","entry":[{"id":"1234567890","messaging":[{"sender":{"id":"psid-1"},"delivery":{"mids":["mid.e2e"],"watermark":1750000000000}}]}]}';
    const signature = `sha256=${createHmac('sha256', 'e2e-app-secret')
      .update(Buffer.from(rawBody))
      .digest('hex')}`;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const route = coreRouteResponse(url);
      if (route) return route;
      if (url.includes('/internal/provider-app-configs/messenger/meta-app-route-1/webhook-config')) {
        return new Response(
          JSON.stringify({
            provider: 'messenger',
            providerAppConfigId: 'default-meta-app',
            routingId: 'meta-app-route-1',
            graphApiVersion: 'v25.0',
            status: 'development_only',
            webhookConfig: {
              appSecret: 'e2e-app-secret',
              verifyToken: 'e2e-verify-token',
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/internal/provider-app-configs/messenger/meta-app-route-1/pages/1234567890/webhook-resolution')) {
        return new Response(
          JSON.stringify({
            channelId: messengerChannelId,
            tenantId: 'tenant-1',
            provider: 'messenger',
            providerAppConfigId: 'default-meta-app',
            providerAppRoutingId: 'meta-app-route-1',
            externalPageId: '1234567890',
            status: 'active',
            connectionStatus: 'ready',
          }),
          { status: 200 },
        );
      }
      if (url === 'http://chat-ingestion:3000/ingest') {
        return new Response(JSON.stringify({ accepted: true }), { status: 201 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await request(app.getHttpServer())
      .post('/webhooks/messenger/meta-app-route-1')
      .set('x-correlation-id', 'corr-webhook-1')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody)
      .expect(201)
      .expect('x-correlation-id', 'corr-webhook-1')
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          duplicate: false,
          eventId: 'messenger-delivery-psid-1-1750000000000-mid.e2e',
          forwardedToChatIngestion: true,
        });
      });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://chat-ingestion:3000/ingest',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-correlation-id': 'corr-webhook-1',
        }),
        body: expect.stringContaining('"eventId":"messenger-delivery-psid-1-1750000000000-mid.e2e"'),
      }),
    );
  });

  it('/webhooks/messenger/:channelId rejects unsigned requests when an app secret is configured', async () => {
    process.env.CORE_API_URL = 'http://core.test';
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const route = coreRouteResponse(url);
      if (route) return route;
      if (url.includes('/internal/provider-app-configs/messenger/meta-app-route-1/webhook-config')) {
        return new Response(
          JSON.stringify({
            provider: 'messenger',
            providerAppConfigId: 'default-meta-app',
            routingId: 'meta-app-route-1',
            graphApiVersion: 'v25.0',
            status: 'development_only',
            webhookConfig: {
              appSecret: 'e2e-app-secret',
              verifyToken: 'e2e-verify-token',
            },
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await request(app.getHttpServer())
      .post('/webhooks/messenger/meta-app-route-1')
      .send({ entry: [] })
      .expect(401);
  });

  it('/webhooks/tiktok/:channelId rejects unsigned requests when a client secret is configured', async () => {
    process.env.CORE_API_URL = 'http://core.test';
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const route = coreRouteResponse(url);
      if (route) return route;
      if (url.includes(`/internal/channels/${tiktokChannelId}/providers/tiktok/verification`)) {
        return new Response(JSON.stringify({ verification: { clientSecret: 'e2e-tiktok-secret' } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await request(app.getHttpServer())
      .post(`/webhooks/tiktok/${tiktokChannelId}`)
      .send({ event: 'authorization.removed' })
      .expect(401);
  });

  it('/webhooks/viber/:channelId accepts signed callbacks and rejects replay duplicates', async () => {
    process.env.VIBER_AUTH_TOKEN = 'viber-e2e-secret';
    process.env.CORE_API_URL = 'http://core.test';
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const route = coreRouteResponse(url);
      if (route) return route;
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const payload = { event: 'message', message_token: 88, sender: { id: 'viber-user' }, message: { type: 'text', text: 'Hello' } };
    const raw = JSON.stringify(payload);
    const signature = createHmac('sha256', 'viber-e2e-secret').update(raw).digest('hex');
    const server = app.getHttpServer();
    await request(server).post(`/webhooks/viber/${viberChannelId}`).set('X-Viber-Content-Signature', signature).set('Content-Type', 'application/json').send(raw).expect(201).expect(({ body }) => expect(body).toMatchObject({ duplicate: false, eventId: 'viber-message-88-viber-user' }));
    await request(server).post(`/webhooks/viber/${viberChannelId}`).set('X-Viber-Content-Signature', signature).set('Content-Type', 'application/json').send(raw).expect(201).expect(({ body }) => expect(body).toMatchObject({ duplicate: true, eventId: 'viber-message-88-viber-user' }));
  });

  it('/webhooks/tiktok/:channelId deduplicates nested lead capture payloads by lead ID', async () => {
    const server = app.getHttpServer();
    process.env.CORE_API_URL = 'http://core.test';
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const route = coreRouteResponse(url);
      if (route) return route;
      if (url.includes(`/internal/channels/${tiktokChannelId}/providers/tiktok/verification`)) {
        return new Response(JSON.stringify({ verification: { clientSecret: 'lead-secret' } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const payload = {
      event: 'lead.created',
      lead: {
        lead_id: 'lead-1',
        user: { open_id: 'open-id-1' },
        field_data: [{ name: 'phone', value: '+959400000001' }],
      },
    };

    const leadRaw = JSON.stringify(payload);
    const leadTimestamp = Math.floor(Date.now() / 1000);
    const leadSignature = createHmac('sha256', 'lead-secret').update(`${leadTimestamp}.${leadRaw}`).digest('hex');

    await request(server)
      .post(`/webhooks/tiktok/${tiktokChannelId}`)
      .set('tiktok-signature', `t=${leadTimestamp},s=${leadSignature}`)
      .set('Content-Type', 'application/json')
      .send(leadRaw)
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          duplicate: false,
          eventId: 'tiktok-lead-1',
          provider: 'tiktok',
          channelId: tiktokChannelId,
        });
      });

    await request(server)
      .post(`/webhooks/tiktok/${tiktokChannelId}`)
      .set('tiktok-signature', `t=${leadTimestamp},s=${leadSignature}`)
      .set('Content-Type', 'application/json')
      .send(leadRaw)
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          duplicate: true,
          eventId: 'tiktok-lead-1',
        });
      });
  });

  it('/webhooks/tiktok/:channelId forwards nested comment capture payloads with a stable event ID', async () => {
    process.env.CHAT_INGESTION_URL = 'http://chat-ingestion:3000';
    process.env.CORE_API_URL = 'http://core.test';
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const route = coreRouteResponse(url);
      if (route) return route;
      if (url.includes(`/internal/channels/${tiktokChannelId}/providers/tiktok/verification`)) {
        return new Response(JSON.stringify({ verification: { clientSecret: 'comment-secret' } }), { status: 200 });
      }
      if (url === 'http://chat-ingestion:3000/ingest') {
        return {
          ok: true,
          status: 201,
          json: async () => ({ accepted: true }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const payload = {
      event: 'comment.created',
      comment: {
        comment_id: 'comment-1',
        video_id: 'video-1',
        text: 'Price?',
        user: { open_id: 'open-id-2' },
      },
    };
    const rawPayload = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', 'comment-secret').update(`${timestamp}.${rawPayload}`).digest('hex');

    await request(app.getHttpServer())
      .post(`/webhooks/tiktok/${tiktokChannelId}`)
      .set('x-correlation-id', 'corr-tiktok-comment-1')
      .set('tiktok-signature', `t=${timestamp},s=${signature}`)
      .set('Content-Type', 'application/json')
      .send(rawPayload)
      .expect(201)
      .expect('x-correlation-id', 'corr-tiktok-comment-1')
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          duplicate: false,
          eventId: 'tiktok-comment-1',
          forwardedToChatIngestion: true,
        });
      });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://chat-ingestion:3000/ingest',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-correlation-id': 'corr-tiktok-comment-1',
        }),
        body: expect.stringContaining('"eventId":"tiktok-comment-1"'),
      }),
    );
  });

  it('/webhooks/:provider/:channelId dead-letters failed ingestion forwarding', async () => {
    await app.close();
    process.env.CHAT_INGESTION_URL = 'http://127.0.0.1:9';
    process.env.WEBHOOK_QUEUE_MAX_ATTEMPTS = '2';
    process.env.WEBHOOK_QUEUE_RETRY_BASE_DELAY_MS = '0';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
    process.env.CORE_API_URL = 'http://core.test';
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const route = coreRouteResponse(url);
      if (route) return route;
      if (url.includes(`/internal/channels/${telegramChannelId}/providers/telegram/verification`)) {
        return new Response(JSON.stringify({ verification: { secretToken: 'telegram-secret' } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await request(app.getHttpServer())
      .post(`/webhooks/telegram/${telegramChannelId}`)
      .set('X-Telegram-Bot-Api-Secret-Token', 'telegram-secret')
      .send({
        update_id: 'e2e-dead-letter',
        message: { message_id: 'message-3', text: 'Retry me' },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          forwardedToChatIngestion: false,
          queueState: 'dead_lettered',
        });
      });

    await request(app.getHttpServer())
      .get('/webhooks/queue/dead-letters')
      .expect(401);

    await request(app.getHttpServer())
      .get('/webhooks/queue/dead-letters')
      .set(
        serviceAuthHeaders({
          audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
          subject: SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
          scopes: [SERVICE_SCOPES.QUEUE_INSPECT],
        }),
      )
      .expect(200)
      .expect(({ body }) => {
        expect(body.items[0]).toMatchObject({
          eventId: 'e2e-dead-letter',
          attempts: 2,
          state: 'dead_lettered',
          payload: {
            provider: 'telegram',
            tenantId: 'tenant-telegram',
            eventId: 'e2e-dead-letter',
            bodyKeys: ['message', 'update_id'],
            queryKeys: [],
          },
        });
        expect(JSON.stringify(body)).not.toContain('Retry me');
        expect(body.nextCursor).toBeUndefined();
      });

    await request(app.getHttpServer())
      .post('/webhooks/queue/dead-letters/e2e-dead-letter/replay')
      .set(
        serviceAuthHeaders({
          audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
          subject: SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
          scopes: [SERVICE_SCOPES.QUEUE_REPLAY],
        }),
      )
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          eventId: 'e2e-dead-letter',
        });
        expect(JSON.stringify(body)).not.toContain('Retry me');
      });

    await request(app.getHttpServer())
      .delete('/webhooks/queue/dead-letters/e2e-dead-letter')
      .set(
        serviceAuthHeaders({
          audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
          subject: SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
          scopes: [SERVICE_SCOPES.QUEUE_REPLAY],
        }),
      )
      .expect(403);

    await request(app.getHttpServer())
      .delete('/webhooks/queue/dead-letters/e2e-dead-letter')
      .set(
        serviceAuthHeaders({
          audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
          subject: SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
          scopes: [SERVICE_SCOPES.QUEUE_DRAIN],
        }),
      )
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ eventId: 'e2e-dead-letter' });
        expect(JSON.stringify(body)).not.toContain('Retry me');
      });
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
