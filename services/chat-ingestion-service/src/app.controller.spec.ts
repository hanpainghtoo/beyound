import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const originalCoreApiUrl = process.env.CORE_API_URL;
  const originalInternalSigningKey = process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  afterEach(() => {
    restoreEnv('CORE_API_URL', originalCoreApiUrl);
    restoreEnv('INTERNAL_SERVICE_TOKEN_SIGNING_KEY', originalInternalSigningKey);
    jest.restoreAllMocks();
  });

  describe('root', () => {
    it('should return health status', () => {
      expect(appController.getHealth()).toMatchObject({
        service: 'chat-ingestion-service',
        status: 'ok',
      });
    });
  });

  describe('ingest', () => {
    it('should normalize inbound chat events', async () => {
      await expect(
        appController.ingest({
          provider: 'telegram',
          channelId: 'demo-channel',
          body: {
            message_id: 'message-1',
            chat_id: 'chat-1',
            senderId: 'customer-1',
            text: 'Need a phone today',
          },
        }),
      ).resolves.toMatchObject({
        accepted: true,
        provider: 'telegram',
        channelId: 'demo-channel',
        normalized: {
          externalConversationId: 'chat-1',
          externalMessageId: 'chat-1:message-1',
          senderId: 'customer-1',
          messageType: 'text',
          content: 'Need a phone today',
        },
      });
    });
  });

  it('should forward normalized events to core-api when configured', async () => {
    process.env.CORE_API_URL = 'http://core-api:3001/api/v1';
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = 'test-internal-service-token-signing-key-32-chars';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true, messageId: 'message-1' }),
    } as Response);

    await expect(
      appController.ingest({
        provider: 'messenger',
        channelId: 'channel-1',
        eventId: 'event-1',
        body: {
          sender: { id: 'customer-1' },
          mid: 'mid-1',
          text: 'Need help',
        },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      forwardedToCore: true,
      coreResponse: { accepted: true, messageId: 'message-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://core-api:3001/api/v1/internal/provider-events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: expect.stringMatching(/^Bearer /),
        }),
      }),
    );
  });

  it('should forward Messenger delivery callbacks as provider message statuses', async () => {
    process.env.CORE_API_URL = 'http://core-api:3001/api/v1';
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = 'test-internal-service-token-signing-key-32-chars';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ updated: true }),
    } as Response);

    await expect(
      appController.ingest({
        provider: 'messenger',
        channelId: 'channel-1',
        eventId: 'messenger-delivery-1',
        body: {
          entry: [
            {
              messaging: [
                {
                  sender: { id: 'psid-1' },
                  recipient: { id: 'page-1' },
                  timestamp: 1_750_000_000_100,
                  delivery: {
                    mids: ['mid.1', 'mid.2'],
                    watermark: 1_750_000_000_000,
                  },
                },
              ],
            },
          ],
        },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      eventType: 'message_status',
      statusEvents: [
        {
          externalMessageId: 'mid.1',
          externalConversationId: 'psid-1',
          status: 'delivered',
        },
        {
          externalMessageId: 'mid.2',
          externalConversationId: 'psid-1',
          status: 'delivered',
        },
      ],
      forwardedToCore: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://core-api:3001/api/v1/internal/provider-events/message-status',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"externalMessageId":"mid.1"'),
      }),
    );
  });

  it('should map Messenger read watermarks without creating inbound messages', async () => {
    process.env.CORE_API_URL = 'http://core-api:3001/api/v1';
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = 'test-internal-service-token-signing-key-32-chars';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ updated: true, updatedCount: 2 }),
    } as Response);

    await expect(
      appController.ingest({
        provider: 'messenger',
        channelId: 'channel-1',
        eventId: 'messenger-read-1',
        body: {
          sender: { id: 'psid-1' },
          recipient: { id: 'page-1' },
          read: { watermark: 1_750_000_000_000 },
        },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      eventType: 'message_status',
      statusEvents: [
        {
          channelId: 'channel-1',
          externalConversationId: 'psid-1',
          watermark: 1_750_000_000_000,
          status: 'read',
        },
      ],
      forwardedToCore: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://core-api:3001/api/v1/internal/provider-events/message-status',
      expect.objectContaining({
        body: expect.stringContaining('"status":"read"'),
      }),
    );
  });

  it('normalizes inbound Viber messages and attachments', async () => {
    await expect(appController.ingest({
      provider: 'viber', channelId: 'viber-channel', eventId: 'viber-message-1',
      body: { event: 'message', message_token: 123, sender: { id: 'viber-user', name: 'Ma Su' }, message: { type: 'picture', text: 'ဒီပုံပါ', media: 'https://files.example/image.jpg' } },
    })).resolves.toMatchObject({
      accepted: true,
      normalized: {
        externalConversationId: 'viber-user', externalMessageId: '123', senderId: 'viber-user', senderDisplayName: 'Ma Su', messageType: 'image', content: 'ဒီပုံပါ',
        attachments: [{ type: 'image', url: 'https://files.example/image.jpg' }],
      },
    });
  });

  it('maps Viber seen callbacks to read status', async () => {
    await expect(appController.ingest({
      provider: 'viber', channelId: 'viber-channel', eventId: 'viber-seen-1',
      body: { event: 'seen', message_token: 456, user_id: 'viber-user', timestamp: 1750000000 },
    })).resolves.toMatchObject({
      accepted: true, eventType: 'message_status',
      statusEvents: [{ externalMessageId: '456', externalConversationId: 'viber-user', provider: 'viber', status: 'read' }],
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
