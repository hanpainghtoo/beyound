import { MessengerClient } from './messenger.client';

describe('MessengerClient', () => {
  it('sends text messages to a page-scoped recipient', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ recipient_id: 'psid-1', message_id: 'mid.1' }),
    });
    const client = new MessengerClient('https://graph.test', 'v99.0', fetcher);

    await expect(
      client.send({
        channelId: 'channel-1',
        recipientId: 'psid-1',
        content: 'Your order is ready.',
        credentials: {
          pageId: 'page-1',
          pageAccessToken: 'page-token',
        },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      externalMessageId: 'mid.1',
      status: 'sent',
    });

    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe('https://graph.test/v99.0/page-1/messages');
    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer page-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: 'psid-1' },
        messaging_type: 'RESPONSE',
        message: { text: 'Your order is ready.' },
      }),
    });
  });

  it('maps file attachments to the Messenger attachment payload', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ recipient_id: 'psid-1', message_id: 'mid.2' }),
    });
    const client = new MessengerClient(
      'https://graph.test',
      undefined,
      fetcher,
    );

    await client.send({
      channelId: 'channel-1',
      recipientId: 'psid-1',
      content: '',
      messageType: 'file',
      attachments: [{ url: 'https://cdn.example.com/invoice.pdf' }],
      credentials: {
        pageId: 'page-1',
        pageAccessToken: 'page-token',
      },
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://graph.test/v25.0/page-1/messages',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer page-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: 'psid-1' },
          messaging_type: 'RESPONSE',
          message: {
            attachment: {
              type: 'file',
              payload: {
                url: 'https://cdn.example.com/invoice.pdf',
                is_reusable: true,
              },
            },
          },
        }),
      }),
    );
  });

  it('maps transient Graph API errors without exposing the page token', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({
        'retry-after': '4',
        'x-app-usage': '{"call_count":100}',
      }),
      json: async () => ({
        error: {
          message: 'Temporary provider failure',
          type: 'OAuthException',
          code: 2,
          is_transient: true,
          fbtrace_id: 'trace-1',
        },
      }),
    });
    const client = new MessengerClient(
      'https://graph.test',
      undefined,
      fetcher,
    );

    const result = await client.send({
      channelId: 'channel-1',
      recipientId: 'psid-1',
      content: 'Hello',
      credentials: {
        pageId: 'page-1',
        pageAccessToken: 'secret-page-token',
      },
    });

    expect(result).toMatchObject({
      accepted: false,
      status: 'provider_error',
      providerError: {
        code: 2,
        transient: true,
        retryAfterSeconds: 4,
      },
      retry: {
        recommended: true,
        retryAfterSeconds: 4,
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret-page-token');
  });
});
