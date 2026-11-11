import { TelegramClient } from './telegram.client';

const validTelegramToken = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';

/**
 * `send` returns a union of response shapes; only the validation branch
 * carries `errors`. Narrowing here keeps assertions off `any`.
 */
function validationErrorsOf(result: unknown): string[] {
  const errors = (result as { errors?: unknown } | null)?.errors;
  return Array.isArray(errors)
    ? errors.filter((e): e is string => typeof e === 'string')
    : [];
}

describe('TelegramClient', () => {
  it('should call getMe and return a validated bot identity', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
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
        text: () => JSON.stringify({ ok: true, result: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          JSON.stringify({
            ok: true,
            result: {
              // snake_case on purpose: Telegram's real wire shape. A
              // camelCase fixture is what let the normalisation bug pass
              // every test while production returned undefined.
              url: 'https://hooks.example.com/webhooks/telegram/channel-1',
              pending_update_count: 0,
              last_error_message: 'Wrong response from the webhook: 502',
              allowed_updates: ['message', 'callback_query'],
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

    await expect(
      client.getWebhookInfo(validTelegramToken),
    ).resolves.toMatchObject({
      url: 'https://hooks.example.com/webhooks/telegram/channel-1',
      pendingUpdateCount: 0,
      lastErrorMessage: 'Wrong response from the webhook: 502',
      allowedUpdates: ['message', 'callback_query'],
    });
  });

  it('should map image attachments to sendPhoto', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        JSON.stringify({
          ok: true,
          result: { message_id: 99, chat: { id: 'chat-1' } },
        }),
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

  it('should POST multipart bytes when the attachment carries inline bytes', async () => {
    // file-storage fileIds are not Telegram file_ids and signed URLs are
    // localhost-bound, so core ships bytes and we upload multipart.
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        JSON.stringify({
          ok: true,
          result: { message_id: 100, chat: { id: 'chat-1' } },
        }),
    });
    const client = new TelegramClient('https://telegram.test', fetcher);

    await expect(
      client.send({
        channelId: 'channel-1',
        recipientId: 'chat-1',
        content: 'Product photo',
        messageType: 'image',
        attachments: [
          {
            fileId: 'file-1',
            fileName: 'product.png',
            contentType: 'image/png',
            bytesBase64: Buffer.from([1, 2, 3]).toString('base64'),
          },
        ],
        credentials: { botToken: validTelegramToken },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      externalMessageId: 'chat-1:100',
      status: 'sent',
    });

    expect(fetcher).toHaveBeenCalledWith(
      `https://telegram.test/bot${encodeURIComponent(validTelegramToken)}/sendPhoto`,
      expect.objectContaining({ method: 'POST' }),
    );
    const sentBody = fetcher.mock.calls[0][1].body;
    expect(sentBody instanceof FormData).toBe(true);
    expect(sentBody.get('chat_id')).toBe('chat-1');
    expect(sentBody.get('caption')).toBe('Product photo');
    expect(sentBody.get('photo')).toBeInstanceOf(Blob);
  });

  it('should reject oversized photos before calling the provider', async () => {
    // Telegram caps bot photo uploads at 10 MB. Caught locally, the agent gets
    // a named reason; sent blind it becomes an opaque provider rejection that
    // would fail identically on every retry.
    const fetcher = jest.fn();
    const client = new TelegramClient('https://telegram.test', fetcher);

    const result = await client.send({
      channelId: 'channel-1',
      recipientId: 'chat-1',
      content: '',
      messageType: 'image',
      attachments: [
        {
          fileId: 'file-1',
          fileName: 'huge.png',
          contentType: 'image/png',
          sizeBytes: 12 * 1024 * 1024,
          bytesBase64: 'AAAA',
        },
      ],
      credentials: { botToken: validTelegramToken },
    });

    expect(result).toMatchObject({
      accepted: false,
      status: 'validation_error',
      // An oversized file fails identically every time, so no retry is offered.
      retry: { recommended: false },
    });
    expect(validationErrorsOf(result)).toContainEqual(
      expect.stringContaining('exceeds the Telegram photo limit'),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('should allow an oversized photo when it is sent as a document', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        JSON.stringify({
          ok: true,
          result: { message_id: 101, chat: { id: 'chat-1' } },
        }),
    });
    const client = new TelegramClient('https://telegram.test', fetcher);

    await expect(
      client.send({
        channelId: 'channel-1',
        recipientId: 'chat-1',
        content: '',
        messageType: 'file',
        attachments: [
          {
            fileId: 'file-1',
            fileName: 'huge.png',
            sizeBytes: 12 * 1024 * 1024,
            bytesBase64: Buffer.from([1, 2, 3]).toString('base64'),
          },
        ],
        credentials: { botToken: validTelegramToken },
      }),
    ).resolves.toMatchObject({ accepted: true, status: 'sent' });
  });

  // Regression: the method table listed only 'file' as document, so video and
  // audio resolved to sendMessage — which takes no attachment. The bytes were
  // dropped, Telegram returned ok, and the send was recorded as successful
  // while the customer received nothing.
  it.each(['video', 'audio'] as const)(
    'should send %s attachments via sendDocument',
    async (messageType) => {
      // Captured in the implementation rather than read back off
      // `fetcher.mock.calls`, which is untyped `any`.
      let requestedUrl = '';
      let sentBody: FormData | undefined;
      const fetcher = jest.fn((url: string, init: RequestInit) => {
        requestedUrl = url;
        sentBody = init.body as FormData;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              result: { message_id: 200, chat: { id: 'chat-1' } },
            }),
            { status: 200 },
          ),
        );
      });
      const client = new TelegramClient('https://telegram.test', fetcher);

      await expect(
        client.send({
          channelId: 'channel-1',
          recipientId: 'chat-1',
          content: 'clip',
          messageType,
          attachments: [
            {
              fileId: 'file-1',
              fileName: `clip.${messageType === 'video' ? 'mp4' : 'mp3'}`,
              contentType: messageType === 'video' ? 'video/mp4' : 'audio/mpeg',
              sizeBytes: 4096,
              bytesBase64: Buffer.from([1, 2, 3]).toString('base64'),
            },
          ],
          credentials: { botToken: validTelegramToken },
        }),
      ).resolves.toMatchObject({
        accepted: true,
        status: 'sent',
        externalMessageId: 'chat-1:200',
      });

      expect(requestedUrl).toContain('/sendDocument');
      expect(requestedUrl).not.toContain('/sendMessage');
      expect(sentBody?.get('document')).toBeInstanceOf(Blob);
      expect(sentBody?.get('caption')).toBe('clip');
    },
  );

  it('should apply the document size cap to oversized video', async () => {
    const fetcher = jest.fn();
    const client = new TelegramClient('https://telegram.test', fetcher);

    const result = await client.send({
      channelId: 'channel-1',
      recipientId: 'chat-1',
      content: '',
      messageType: 'video',
      attachments: [
        {
          fileId: 'file-1',
          fileName: 'long.mp4',
          sizeBytes: 80 * 1024 * 1024,
          bytesBase64: 'AAAA',
        },
      ],
      credentials: { botToken: validTelegramToken },
    });

    expect(result).toMatchObject({
      accepted: false,
      status: 'validation_error',
      retry: { recommended: false },
    });
    expect(validationErrorsOf(result)).toContainEqual(
      expect.stringContaining('exceeds the Telegram document limit'),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('should size-check inline bytes when core sends no declared size', async () => {
    // No sizeBytes: fall back to the base64 length. 4/3 of 15 MB exceeds the
    // 50 MB document cap only above ~37 MB of encoded data, so assert on the
    // photo cap instead, which the same payload clears past.
    const fetcher = jest.fn();
    const client = new TelegramClient('https://telegram.test', fetcher);

    const result = await client.send({
      channelId: 'channel-1',
      recipientId: 'chat-1',
      content: '',
      messageType: 'image',
      attachments: [
        { fileName: 'unknown.png', bytesBase64: 'A'.repeat(20 * 1024 * 1024) },
      ],
      credentials: { botToken: validTelegramToken },
    });

    expect(result).toMatchObject({ status: 'validation_error' });
    expect(validationErrorsOf(result)).toContainEqual(
      expect.stringContaining('exceeds the Telegram photo limit'),
    );
    expect(fetcher).not.toHaveBeenCalled();
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
      ]) as unknown as string[],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('supports callback acknowledgement, message editing, and commands', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => JSON.stringify({ ok: true, result: true }),
    });
    const client = new TelegramClient('https://telegram.test', fetcher);

    await client.answerCallbackQuery(validTelegramToken, 'callback-1', {
      text: 'Done',
    });
    await client.editMessageText(validTelegramToken, {
      chatId: 'chat-1',
      messageId: 4,
      text: 'Updated',
    });
    await client.setMyCommands(validTelegramToken, [
      { command: 'start', description: 'Start shopping' },
    ]);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/answerCallbackQuery'),
      expect.anything(),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/editMessageText'),
      expect.anything(),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/setMyCommands'),
      expect.anything(),
    );
  });

  it('maps Telegram 403 and 429 helper failures to safe provider errors', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () =>
          JSON.stringify({
            ok: false,
            error_code: 403,
            description: 'Forbidden: bot was blocked by the user',
          }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () =>
          JSON.stringify({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests',
            parameters: { retry_after: 7 },
          }),
      });
    const client = new TelegramClient('https://telegram.test', fetcher);

    await expect(
      client.answerCallbackQuery(validTelegramToken, 'callback-1'),
    ).resolves.toMatchObject({
      status: 'forbidden',
      retry: { recommended: false },
      identity: { status: 'unreachable' },
    });
    await expect(
      client.editMessageText(validTelegramToken, {
        chatId: 'chat-1',
        messageId: 4,
        text: 'Updated',
      }),
    ).resolves.toMatchObject({
      status: 'rate_limited',
      retry: { recommended: true, retryAfterSeconds: 7 },
    });
  });

  it('classifies a deactivated Telegram user as unreachable', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () =>
        JSON.stringify({
          ok: false,
          error_code: 403,
          description: 'Forbidden: user is deactivated',
        }),
    });
    const client = new TelegramClient('https://telegram.test', fetcher);

    await expect(
      client.send({
        channelId: 'channel-1',
        recipientId: 'chat-1',
        content: 'Hello',
        credentials: { botToken: validTelegramToken },
      }),
    ).resolves.toMatchObject({
      status: 'forbidden',
      providerError: { code: 'user_deactivated' },
      retry: { recommended: false },
    });
  });
});
