import { TelegramClient } from './telegram.client';

const validTelegramToken = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';

describe('TelegramClient', () => {
  it('should call getMe and return a validated bot identity', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          result: {
            id: 123456789012345,
            is_bot: true,
            username: 'zayos_demo_bot',
            first_name: 'ZayOS Demo',
          },
        }),
    });
    const client = new TelegramClient('https://telegram.test', fetcher);

    await expect(client.getMe(validTelegramToken)).resolves.toEqual({
      botId: '123456789012345',
      username: 'zayos_demo_bot',
      firstName: 'ZayOS Demo',
      canJoinGroups: undefined,
      canReadAllGroupMessages: undefined,
      supportsInlineQueries: undefined,
    });

    expect(fetcher).toHaveBeenCalledWith(
      `https://telegram.test/bot${encodeURIComponent(validTelegramToken)}/getMe`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should register and verify webhook URL equality', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, result: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            result: {
              url: 'https://hooks.example.com/webhooks/telegram/channel-1',
              pendingUpdateCount: 0,
              allowedUpdates: ['message'],
            },
          }),
      });
    const client = new TelegramClient('https://telegram.test', fetcher);

    await expect(
      client.setWebhook(validTelegramToken, {
        url: 'https://hooks.example.com/webhooks/telegram/channel-1',
        secretToken: 'abcdefghijklmnopqrstuvwxyzABCDEF1234567890',
        allowedUpdates: ['message'],
        dropPendingUpdates: false,
      }),
    ).resolves.toMatchObject({ accepted: true, allowedUpdates: ['message'] });

    await expect(client.getWebhookInfo(validTelegramToken)).resolves.toMatchObject({
      url: 'https://hooks.example.com/webhooks/telegram/channel-1',
      pendingUpdateCount: 0,
      allowedUpdates: ['message'],
    });
  });

  it('should map image attachments to sendPhoto', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: { message_id: 99, chat: { id: 'chat-1' } } }),
    });
    const client = new TelegramClient('https://telegram.test', fetcher);

    await expect(
      client.send({
        channelId: 'channel-1',
        recipientId: 'chat-1',
        content: 'Product photo',
        messageType: 'image',
        attachments: [{ url: 'https://cdn.example.com/product.jpg' }],
        credentials: { botToken: validTelegramToken },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      externalMessageId: 'chat-1:99',
      status: 'sent',
    });

    expect(fetcher).toHaveBeenCalledWith(
      `https://telegram.test/bot${encodeURIComponent(validTelegramToken)}/sendPhoto`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: 'chat-1',
          photo: 'https://cdn.example.com/product.jpg',
          caption: 'Product photo',
        }),
      }),
    );
  });

  it('should reject missing Telegram credentials and recipient identifiers', async () => {
    const fetcher = jest.fn();
    const client = new TelegramClient('https://telegram.test', fetcher);

    await expect(
      client.send({
        channelId: 'channel-1',
        content: 'Hello',
      }),
    ).resolves.toMatchObject({
      accepted: false,
      status: 'validation_error',
      errors: expect.arrayContaining([
        'credentials.botToken is required',
        'recipientId is required',
      ]),
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
