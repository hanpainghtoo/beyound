/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await -- Legacy adapter tests mock provider-shaped JSON responses. */
import { ProviderChannelAdapter } from './provider-channel.adapter';

describe('ProviderChannelAdapter', () => {
  const originalSigningKey = process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;

  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY =
      'test-internal-service-token-signing-key-32-chars';
  });

  afterEach(() => {
    if (originalSigningKey === undefined)
      delete process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;
    else process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = originalSigningKey;
  });

  it('forwards Telegram sends and maps provider acceptance', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accepted: true,
        provider: 'telegram',
        externalMessageId: '77',
        status: 'sent',
        reportedToCore: true,
      }),
    });
    const adapter = new ProviderChannelAdapter(
      'telegram',
      'http://integration:3000',
      fetcher,
    );

    await expect(
      adapter.sendMessage({
        channelId: 'channel-1',
        conversationId: 'conversation-1',
        recipientId: 'chat-1',
        content: 'Order confirmed',
        credentials: { botToken: 'secret-token' },
      }),
    ).resolves.toMatchObject({
      externalMessageId: '77',
      status: 'sent',
      metadata: {
        provider: 'telegram',
        providerStatus: 'sent',
        reportedToCore: true,
      },
    });

    expect(fetcher).toHaveBeenCalledWith(
      'http://integration:3000/providers/telegram/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
        }),
      }),
    );
  });

  it('maps provider errors to failed message status', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accepted: false,
        provider: 'telegram',
        status: 'provider_error',
        providerError: { code: 429 },
        retry: { recommended: true, retryAfterSeconds: 3 },
      }),
    });
    const adapter = new ProviderChannelAdapter(
      'telegram',
      'http://integration:3000',
      fetcher,
    );

    await expect(
      adapter.sendMessage({
        channelId: 'channel-1',
        conversationId: 'conversation-1',
        recipientId: 'chat-1',
        content: 'Order confirmed',
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      metadata: {
        providerStatus: 'provider_error',
        providerError: { code: 429 },
        retry: { recommended: true, retryAfterSeconds: 3 },
      },
    });
  });

  it('maps transport exceptions to delivery unknown', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('socket timeout'));
    const adapter = new ProviderChannelAdapter(
      'telegram',
      'http://integration:3000',
      fetcher,
    );

    await expect(
      adapter.sendMessage({
        channelId: 'channel-1',
        conversationId: 'conversation-1',
        recipientId: 'chat-1',
        content: 'Order confirmed',
      }),
    ).resolves.toMatchObject({
      status: 'delivery_unknown',
      metadata: {
        provider: 'telegram',
        error: 'socket timeout',
        retry: { recommended: true },
        ambiguous: true,
      },
    });
  });
});
