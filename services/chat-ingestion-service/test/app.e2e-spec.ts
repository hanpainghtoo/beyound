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
          service: 'chat-ingestion-service',
          status: 'ok',
        });
      });
  });

  it('/ingest (POST)', () => {
    return request(app.getHttpServer())
      .post('/ingest')
      .set('Authorization', authHeader())
      .send({
        provider: 'messenger',
        channelId: 'page-1',
        eventId: 'event-1',
        body: {
          sender: { id: 'customer-1' },
          mid: 'mid-1',
          text: 'Is COD available?',
        },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          eventId: 'event-1',
          provider: 'messenger',
          channelId: 'page-1',
          normalized: {
            externalMessageId: 'mid-1',
            senderId: 'customer-1',
            content: 'Is COD available?',
          },
        });
      });
  });

  it('/ingest (POST Messenger delivery callback)', async () => {
    process.env.CORE_API_URL = 'http://core-api:3001/api/v1';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ updated: true }),
    } as Response);

    await request(app.getHttpServer())
      .post('/ingest')
      .set('Authorization', authHeader())
      .set('x-correlation-id', 'corr-chat-status-1')
      .send({
        provider: 'messenger',
        channelId: 'channel-1',
        eventId: 'messenger-delivery-e2e',
        body: {
          entry: [
            {
              messaging: [
                {
                  sender: { id: 'psid-1' },
                  delivery: {
                    mids: ['mid.e2e'],
                    watermark: 1_750_000_000_000,
                  },
                },
              ],
            },
          ],
        },
      })
      .expect(201)
      .expect('x-correlation-id', 'corr-chat-status-1')
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          eventType: 'message_status',
          forwardedToCore: true,
          statusEvents: [
            {
              externalMessageId: 'mid.e2e',
              status: 'delivered',
            },
          ],
        });
      });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://core-api:3001/api/v1/internal/provider-events/message-status',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-correlation-id': 'corr-chat-status-1',
        }),
      }),
    );
  });

  it('/ingest (POST Viber message)', () => {
    return request(app.getHttpServer()).post('/ingest').set('Authorization', authHeader()).send({
      provider: 'viber', channelId: 'viber-channel', eventId: 'viber-message-1',
      body: { event: 'message', message_token: 77, sender: { id: 'viber-user', name: 'Ko Aung' }, message: { type: 'text', text: 'COD ရပါသလား' } },
    }).expect(201).expect(({ body }) => {
      expect(body).toMatchObject({ accepted: true, provider: 'viber', normalized: { externalMessageId: '77', senderId: 'viber-user', content: 'COD ရပါသလား' } });
    });
  });

  it('/ingest (POST TikTok lead capture)', () => {
    return request(app.getHttpServer())
      .post('/ingest')
      .set('Authorization', authHeader())
      .send({
        provider: 'tiktok',
        channelId: 'tiktok-channel-1',
        eventId: 'tiktok-lead-1',
        body: {
          event: 'lead.created',
          event_id: 'lead-event-1',
          lead: {
            lead_id: 'lead-1',
            form_id: 'form-1',
            advertiser_id: 'advertiser-1',
            user: {
              open_id: 'open-id-1',
              username: 'buyer_one',
            },
            field_data: [
              { name: 'name', value: 'Daw Hnin' },
              { name: 'phone', value: '+959400000001' },
              { name: 'product', value: 'Mingalar X1' },
            ],
          },
        },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          eventId: 'tiktok-lead-1',
          provider: 'tiktok',
          channelId: 'tiktok-channel-1',
          normalized: {
            externalConversationId: 'lead-lead-1',
            externalMessageId: 'lead-1',
            senderId: 'open-id-1',
            senderDisplayName: 'buyer_one',
            messageType: 'lead',
            metadata: {
              provider: 'tiktok',
              productSurface: 'lead_capture',
              tiktokEventType: 'lead.created',
              leadId: 'lead-1',
              formId: 'form-1',
              advertiserId: 'advertiser-1',
              fields: {
                name: 'Daw Hnin',
                phone: '+959400000001',
                product: 'Mingalar X1',
              },
            },
          },
        });
        expect(body.normalized.content).toContain('phone: +959400000001');
      });
  });

  it('/ingest (POST TikTok comment capture)', () => {
    return request(app.getHttpServer())
      .post('/ingest')
      .set('Authorization', authHeader())
      .send({
        provider: 'tiktok',
        channelId: 'tiktok-channel-1',
        eventId: 'tiktok-comment-1',
        body: {
          event: 'comment.created',
          event_id: 'comment-event-1',
          comment: {
            comment_id: 'comment-1',
            video_id: 'video-1',
            text: 'Is this available for same-day delivery?',
            user: {
              open_id: 'open-id-2',
              display_name: 'Buyer Two',
            },
          },
        },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accepted: true,
          eventId: 'tiktok-comment-1',
          normalized: {
            externalConversationId: 'video-video-1-open-id-2',
            externalMessageId: 'comment-1',
            senderId: 'open-id-2',
            senderDisplayName: 'Buyer Two',
            messageType: 'comment',
            content: 'Is this available for same-day delivery?',
            metadata: {
              provider: 'tiktok',
              productSurface: 'comment_capture',
              tiktokEventType: 'comment.created',
              commentId: 'comment-1',
              videoId: 'video-1',
            },
          },
        });
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

function authHeader() {
  return `Bearer ${signServiceToken({
    signingKey,
    subject: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
    audience: SERVICE_IDENTITIES.CHAT_INGESTION,
    scopes: [SERVICE_SCOPES.CHAT_INGEST],
  })}`;
}
