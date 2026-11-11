/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { AppService } from './app.service';

describe('Telegram normalization', () => {
  const service = new AppService();

  // Normalization-only: never hit the live core in unit tests. CORE_API_URL
  // may be set in the shell (and the live dev core 500s unknown channels),
  // which previously broke both specs with real network calls.
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    delete process.env.CORE_API_URL;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accepted: true }),
    } as unknown as Response);
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('keeps only the largest photo size instead of one attachment per size', async () => {
    // Telegram delivers every photo as a size array; persisting each size
    // renders one received photo as a stack of duplicates.
    const result = await service.ingest({
      eventId: 'update-2',
      provider: 'telegram',
      channelId: 'channel-1',
      body: {
        update_id: 56,
        message: {
          message_id: 20,
          chat: { id: 888, type: 'private' },
          from: { id: 777, first_name: 'Aye' },
          photo: [
            { file_id: 'small', file_size: 1000 },
            { file_id: 'large', file_size: 90000 },
            { file_id: 'mid', file_size: 20000 },
          ],
        },
      },
    });

    expect(result.normalized?.attachments).toEqual([
      {
        type: 'image',
        providerFile: { file_id: 'large', file_size: 90000 },
      },
    ]);
  });

  it('normalizes callback identity and does not forward it as an inbox message', async () => {
    const result = await service.ingest({
      eventId: 'update-1',
      provider: 'telegram',
      channelId: 'channel-1',
      body: {
        update_id: 55,
        callback_query: {
          id: 'callback-1',
          data: 'products:abc:2',
          from: { id: 777 },
          message: { message_id: 12, chat: { id: 888, type: 'private' } },
        },
      },
    });

    expect(result).toMatchObject({
      eventType: 'callback_query',
      forwardedToCore: false,
      inboxMessageCreated: false,
      normalized: {
        eventType: 'callback_query',
        callbackQueryId: 'callback-1',
        callbackData: 'products:abc:2',
        senderId: '777',
        externalConversationId: '888',
        chatId: '888',
        messageId: '12',
      },
    });
  });
});

describe('Messenger normalization', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    delete process.env.CORE_API_URL;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('flattens Meta attachment payloads so core can download them', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accepted: true }),
    } as unknown as Response);

    const service = new AppService();
    const result = await service.ingest({
      eventId: 'mid-1',
      provider: 'facebook',
      channelId: 'channel-1',
      body: {
        entry: [
          {
            messaging: [
              {
                sender: { id: 'psid-1' },
                recipient: { id: 'page-1' },
                message: {
                  mid: 'mid-1',
                  attachments: [
                    {
                      type: 'image',
                      payload: { url: 'https://cdn.test/photo.jpg' },
                    },
                    {
                      type: 'file',
                      payload: {
                        url: 'https://cdn.test/report.pdf',
                        title: 'report.pdf',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });

    // `payload.url` must be hoisted: core downloads attachments by URL, and a
    // nested payload leaves it nothing to read.
    expect(result.normalized?.attachments).toEqual([
      { type: 'image', url: 'https://cdn.test/photo.jpg' },
      {
        type: 'file',
        url: 'https://cdn.test/report.pdf',
        fileName: 'report.pdf',
      },
    ]);
    expect(result.normalized?.messageType).toBe('image');
  });

  it('surfaces the sender full name and profile picture for the avatar resolver', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'Aye Htet Chan',
        first_name: 'Aye',
        last_name: 'Chan',
        profile_pic: 'https://cdn.test/avatar.jpg',
      }),
    } as unknown as Response);

    const service = new AppService();
    const result = await service.ingest({
      eventId: 'mid-2',
      provider: 'messenger',
      channelId: 'channel-1',
      body: {
        pageAccessToken: 'page-token',
        entry: [
          {
            messaging: [
              {
                sender: { id: 'psid-2' },
                recipient: { id: 'page-1' },
                message: { mid: 'mid-2', text: 'hello' },
              },
            ],
          },
        ],
      },
    });

    // Meta's `name` carries the middle name; first+last silently drops it
    // ("Ye San" instead of "Ye Htet San").
    expect(result.normalized).toMatchObject({
      senderDisplayName: 'Aye Htet Chan',
      senderAvatarUrl: 'https://cdn.test/avatar.jpg',
    });

    const profileCall = (globalThis.fetch as jest.Mock).mock.calls[0];
    const profileUrl = decodeURIComponent(String(profileCall[0]));
    expect(profileUrl).toContain('/psid-2');
    expect(profileUrl).toContain(
      'fields=name,first_name,last_name,profile_pic',
    );
  });

  it('falls back to first and last name when Meta omits the name field', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        first_name: 'Aye',
        last_name: 'Chan',
      }),
    } as unknown as Response);

    const service = new AppService();
    const result = await service.ingest({
      eventId: 'mid-3',
      provider: 'messenger',
      channelId: 'channel-1',
      body: {
        pageAccessToken: 'page-token',
        entry: [
          {
            messaging: [
              {
                sender: { id: 'psid-3' },
                recipient: { id: 'page-1' },
                message: { mid: 'mid-3', text: 'hello' },
              },
            ],
          },
        ],
      },
    });

    expect(result.normalized?.senderDisplayName).toBe('Aye Chan');
  });

  it('retries without the name field when the permission rejects it', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 100 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ first_name: 'Aye', last_name: 'Chan' }),
      });
    globalThis.fetch = fetcher as unknown as typeof fetch;

    const service = new AppService();
    const result = await service.ingest({
      eventId: 'mid-4',
      provider: 'messenger',
      channelId: 'channel-1',
      body: {
        pageAccessToken: 'page-token',
        entry: [
          {
            messaging: [
              {
                sender: { id: 'psid-4' },
                recipient: { id: 'page-1' },
                message: { mid: 'mid-4', text: 'hello' },
              },
            ],
          },
        ],
      },
    });

    expect(result.normalized?.senderDisplayName).toBe('Aye Chan');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(String(fetcher.mock.calls[1][0]))).toContain(
      'fields=first_name,last_name,profile_pic',
    );
  });
});
