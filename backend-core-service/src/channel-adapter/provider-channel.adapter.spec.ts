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

  // Regression: an oversized outbound attachment was rejected by the body
  // parser before the integration service reached its provider client. That
  // Nest error body has none of the send-result fields, so reading only those
  // stored `metadata: { provider }` — the bubble then showed a bare
  // "Provider delivery failed." with no retry offered, hiding a transient
  // rejection the agent could have cleared by resending.
  it('surfaces integration service rejections instead of empty metadata', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        statusCode: 500,
        message: 'request entity too large',
        errorType: 'PayloadTooLargeError',
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
        content: '',
        messageType: 'image',
        metadata: { internalMessageId: 'message-1' },
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      metadata: {
        provider: 'telegram',
        providerStatus: 'integration_rejected',
        error: 'request entity too large',
        // The whole point: a transport rejection is retryable, so the UI
        // shows its Retry button.
        retry: { recommended: true },
      },
    });
  });

  it('falls back to the HTTP status when a rejection has no readable detail', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });
    const adapter = new ProviderChannelAdapter(
      'telegram',
      'http://integration:3000',
      fetcher,
    );

    const result = await adapter.sendMessage({
      channelId: 'channel-1',
      conversationId: 'conversation-1',
      recipientId: 'chat-1',
      content: 'Order confirmed',
    });

    expect(result.metadata).toMatchObject({
      providerStatus: 'integration_rejected',
      retry: { recommended: true },
    });
    expect(result.metadata?.error).toContain('502');
  });

  it('surfaces validation error arrays as a readable failure reason', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accepted: false,
        provider: 'telegram',
        status: 'validation_error',
        errors: ['recipientId is required'],
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
        content: '',
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      metadata: {
        providerStatus: 'validation_error',
        error: 'recipientId is required',
      },
    });
  });
});
