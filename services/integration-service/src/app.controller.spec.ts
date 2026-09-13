import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

const validTelegramToken = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';

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

  describe('root', () => {
    it('should return health status', () => {
      expect(appController.getHealth()).toMatchObject({
        service: 'integration-service',
        status: 'ok',
      });
    });
  });

  describe('providers', () => {
    it('should expose Phase 1 provider contracts', () => {
      expect(appController.getProviders()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provider: 'telegram',
            status: 'implemented',
          }),
          expect.objectContaining({
            provider: 'messenger',
            status: 'implemented',
          }),
          expect.objectContaining({
            provider: 'tiktok',
            status: 'requires-provider-access',
            outboundMessageTypes: [],
            webhookEvents: ['lead', 'comment'],
          }),
        ]),
      );
    });

    it('should reject unknown providers instead of falling back to Telegram', () => {
      expect(() => appController.getProvider('unknown')).toThrow(
        'Unsupported provider: unknown',
      );
    });
  });

  describe('send', () => {
    afterEach(() => {
      restoreEnv('CORE_API_URL', originalCoreApiUrl);
      restoreEnv('INTERNAL_SERVICE_TOKEN_SIGNING_KEY', originalInternalSigningKey);
      jest.restoreAllMocks();
    });

    it('should send Telegram messages through the Bot API', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          result: { message_id: 42, chat: { id: 'customer-1' } },
        }),
      } as Response);

      await expect(
        appController.send('telegram', {
          channelId: 'bot-1',
          conversationId: 'conversation-1',
          recipientId: 'customer-1',
          content: 'Confirmed, we can deliver today.',
          credentials: { botToken: validTelegramToken },
        }),
      ).resolves.toMatchObject({
        accepted: true,
        provider: 'telegram',
        channelId: 'bot-1',
        conversationId: 'conversation-1',
        externalMessageId: 'customer-1:42',
        status: 'sent',
      });
    });

    it('should expose Telegram retry hints without leaking credentials', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({
          ok: false,
          error_code: 429,
          description: 'Too Many Requests',
          parameters: { retry_after: 3 },
        }),
      } as Response);

      const result = await appController.send('telegram', {
        channelId: 'bot-1',
        recipientId: 'customer-1',
        content: 'Hello',
        credentials: { botToken: validTelegramToken },
      });

      expect(result).toMatchObject({
        accepted: false,
        status: 'rate_limited',
        providerError: { code: 'rate_limited', retryAfterSeconds: 3 },
        retry: { recommended: true, retryAfterSeconds: 3 },
      });
      expect(JSON.stringify(result)).not.toContain(validTelegramToken);
    });

    it('should report Telegram send results back to the core message record', async () => {
      process.env.CORE_API_URL = 'http://core-api:3001/api/v1';
      process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = 'test-internal-service-token-signing-key-32-chars';
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            result: { message_id: 55, chat: { id: 'customer-1' } },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ updated: true }),
        } as Response);

      await expect(
        appController.send('telegram', {
          channelId: 'bot-1',
          recipientId: 'customer-1',
          content: 'Hello',
          credentials: { botToken: validTelegramToken },
          metadata: { internalMessageId: 'message-1' },
        }, { correlationId: 'corr-integration-1' } as any),
      ).resolves.toMatchObject({
        accepted: true,
        externalMessageId: 'customer-1:55',
        reportedToCore: true,
      });

      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        'http://core-api:3001/api/v1/internal/provider-events/message-status',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Bearer /),
            'x-correlation-id': 'corr-integration-1',
          }),
          body: JSON.stringify({
            messageId: 'message-1',
            externalMessageId: 'customer-1:55',
            channelId: 'bot-1',
            externalConversationId: 'customer-1',
            provider: 'telegram',
            status: 'sent',
            providerStatus: 'sent',
          }),
        }),
      );
    });

    it('should send Messenger messages through the Graph API', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          recipient_id: 'psid-1',
          message_id: 'mid.123',
        }),
      } as Response);

      await expect(
        appController.send('messenger', {
          channelId: 'page-1',
          recipientId: 'psid-1',
          content: 'Your order is ready.',
          credentials: {
            pageId: 'page-1',
            pageAccessToken: 'page-token',
          },
        }),
      ).resolves.toMatchObject({
        accepted: true,
        provider: 'messenger',
        externalMessageId: 'mid.123',
        status: 'sent',
      });
    });

    it('should fail closed for TikTok outbound messaging until approved API access exists', async () => {
      await expect(
        appController.send('tiktok', {
          channelId: 'tiktok-channel-1',
          recipientId: 'creator-or-user-1',
          content: 'Hello from Commerce OS',
          credentials: {
            clientKey: 'client-key',
            clientSecret: 'client-secret',
          },
        }),
      ).resolves.toMatchObject({
        accepted: false,
        provider: 'tiktok',
        status: 'unsupported_message_type',
        supportedMessageTypes: [],
        nextStep: expect.stringContaining('outbound messaging is not exposed'),
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
