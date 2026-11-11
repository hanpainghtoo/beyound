import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  signServiceToken,
} from '@zayos/internal-service-auth';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const originalCoreApiUrl = process.env.CORE_API_URL;
  const originalSigningKey = process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;

  beforeEach(async () => {
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = signingKey;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    restoreEnv('CORE_API_URL', originalCoreApiUrl);
    restoreEnv('INTERNAL_SERVICE_TOKEN_SIGNING_KEY', originalSigningKey);
    jest.restoreAllMocks();
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          service: 'integration-service',
          status: 'ok',
        });
      });
  });

  it('/providers (GET)', () => {
    return request(app.getHttpServer())
      .get('/providers')
      .set('Authorization', authHeader([SERVICE_SCOPES.PROVIDER_TEST]))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              provider: 'telegram',
              status: 'implemented',
            }),
            expect.objectContaining({
              provider: 'messenger',
              status: 'implemented',
            }),
          ]),
        );
      });
  });

  it('/providers/telegram/send (POST)', async () => {
    process.env.CORE_API_URL = 'http://core-api:3001/api/v1';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { message_id: 77, chat: { id: 'customer-1' } },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ updated: true }),
      } as Response);

    await request(app.getHttpServer())
      .post('/providers/telegram/send')
      .set('Authorization', authHeader([SERVICE_SCOPES.PROVIDER_SEND]))
      .send({
        channelId: 'channel-1',
        conversationId: 'conversation-1',
        recipientId: 'customer-1',
        content: 'Your order is confirmed.',
        credentials: { botToken: '123456:test-token' },
        metadata: { internalMessageId: 'message-1' },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          provider: 'telegram',
          externalMessageId: '77',
          reportedToCore: true,
          status: 'sent',
        });
        expect(JSON.stringify(body)).not.toContain('test-token');
      });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://core-api:3001/api/v1/internal/provider-events/message-status',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('/providers/messenger/send (POST)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ recipient_id: 'psid-1', message_id: 'mid.e2e' }),
    } as Response);

    await request(app.getHttpServer())
      .post('/providers/messenger/send')
      .set('Authorization', authHeader([SERVICE_SCOPES.PROVIDER_SEND]))
      .send({
        channelId: 'page-1',
        recipientId: 'psid-1',
        content: 'Your order is ready.',
        credentials: {
          pageId: 'page-1',
          pageAccessToken: 'page-token',
        },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          provider: 'messenger',
          externalMessageId: 'mid.e2e',
          status: 'sent',
        });
        expect(JSON.stringify(body)).not.toContain('page-token');
      });
  });

  it('/providers/viber/send (POST)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 0, status_message: 'ok', message_token: 9001 }), { status: 200 }));
    await request(app.getHttpServer())
      .post('/providers/viber/send')
      .set('Authorization', authHeader([SERVICE_SCOPES.PROVIDER_SEND]))
      .send({ channelId: 'viber-1', recipientId: 'viber-user-1', content: 'Your COD order is ready.', credentials: { authToken: 'viber-token', botName: 'Mingalar Mobile' } })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({ accepted: true, provider: 'viber', externalMessageId: '9001', status: 'sent' });
        expect(JSON.stringify(body)).not.toContain('viber-token');
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

const signingKey = 'test-internal-service-token-signing-key-32-chars';

function authHeader(scopes: string[]) {
  return `Bearer ${signServiceToken({
    signingKey,
    subject: SERVICE_IDENTITIES.CORE,
    audience: SERVICE_IDENTITIES.INTEGRATION,
    scopes,
  })}`;
}
