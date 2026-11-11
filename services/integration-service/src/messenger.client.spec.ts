/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-base-to-string, @typescript-eslint/require-await */
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

  it('accepts audio attachments natively', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ recipient_id: 'psid-1', message_id: 'mid.audio' }),
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
      messageType: 'audio',
      attachments: [{ url: 'https://cdn.example.com/voice.ogg' }],
      credentials: { pageId: 'page-1', pageAccessToken: 'page-token' },
    });

    expect(fetcher.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({
        recipient: { id: 'psid-1' },
        messaging_type: 'RESPONSE',
        message: {
          attachment: {
            type: 'audio',
            payload: {
              url: 'https://cdn.example.com/voice.ogg',
              is_reusable: true,
            },
          },
        },
      }),
    });
  });

  it('uploads bytes first, then sends by attachment_id', async () => {
    // Our signed storage URLs are expiring or localhost-bound, so Meta cannot
    // fetch them. Bytes travel base64 and go through the Attachment Upload API.
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ attachment_id: 'attachment-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ recipient_id: 'psid-1', message_id: 'mid.3' }),
      });
    const client = new MessengerClient(
      'https://graph.test',
      undefined,
      fetcher,
    );

    const result = await client.send({
      channelId: 'channel-1',
      recipientId: 'psid-1',
      content: '',
      messageType: 'video',
      attachments: [
        {
          fileName: 'clip.mp4',
          contentType: 'video/mp4',
          bytesBase64: Buffer.from('video-bytes').toString('base64'),
        },
      ],
      credentials: { pageId: 'page-1', pageAccessToken: 'page-token' },
    });

    expect(result).toMatchObject({ accepted: true, status: 'sent' });

    const [uploadUrl, uploadRequest] = fetcher.mock.calls[0];
    expect(uploadUrl).toBe(
      'https://graph.test/v25.0/page-1/message_attachments',
    );
    expect(uploadRequest).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer page-token' },
    });
    const form = uploadRequest.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(JSON.parse(String(form.get('message')))).toEqual({
      attachment: { type: 'video', payload: { is_reusable: true } },
    });
    const uploaded = form.get('filedata') as File;
    expect(uploaded.name).toBe('clip.mp4');
    expect(uploaded.type).toBe('video/mp4');

    const [, sendRequest] = fetcher.mock.calls[1];
    expect(sendRequest.body).toBe(
      JSON.stringify({
        recipient: { id: 'psid-1' },
        messaging_type: 'RESPONSE',
        message: {
          attachment: {
            type: 'video',
            payload: { attachment_id: 'attachment-1' },
          },
        },
      }),
    );
  });

  it('rejects oversized attachments without offering a retry', async () => {
    const fetcher = jest.fn();
    const client = new MessengerClient(
      'https://graph.test',
      undefined,
      fetcher,
    );

    const result = await client.send({
      channelId: 'channel-1',
      recipientId: 'psid-1',
      content: '',
      messageType: 'video',
      attachments: [
        {
          fileName: 'huge.mp4',
          contentType: 'video/mp4',
          bytesBase64: Buffer.alloc(25 * 1024 * 1024 + 1).toString('base64'),
        },
      ],
      credentials: { pageId: 'page-1', pageAccessToken: 'page-token' },
    });

    expect(result).toMatchObject({
      accepted: false,
      status: 'validation_error',
      retry: { recommended: false },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('names the supported types when the message type is unknown', async () => {
    const fetcher = jest.fn();
    const client = new MessengerClient(
      'https://graph.test',
      undefined,
      fetcher,
    );

    const result = (await client.send({
      channelId: 'channel-1',
      recipientId: 'psid-1',
      content: '',
      messageType: 'sticker' as never,
      attachments: [{ url: 'https://cdn.example.com/sticker.webp' }],
      credentials: { pageId: 'page-1', pageAccessToken: 'page-token' },
    })) as { status: string; errors?: string[] };

    expect(result.status).toBe('validation_error');
    expect(result.errors?.[0]).toContain('image, video, audio, file');
    expect(fetcher).not.toHaveBeenCalled();
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

  it('delivers an image caption as a follow-up text message', async () => {
    // Meta's Send API takes text or an attachment, never both. The caption has
    // to be a second message or the agent's text is silently lost.
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ recipient_id: 'psid-1', message_id: 'mid.image' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          recipient_id: 'psid-1',
          message_id: 'mid.caption',
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
      content: 'Here is your order.',
      messageType: 'image',
      attachments: [{ url: 'https://cdn.example.com/order.jpg' }],
      credentials: { pageId: 'page-1', pageAccessToken: 'page-token' },
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetcher.mock.calls[0][1].body));
    expect(first.message.attachment.type).toBe('image');
    expect(first.message.text).toBeUndefined();
    const second = JSON.parse(String(fetcher.mock.calls[1][1].body));
    expect(second).toEqual({
      recipient: { id: 'psid-1' },
      messaging_type: 'RESPONSE',
      message: { text: 'Here is your order.' },
    });

    expect(result).toMatchObject({
      accepted: true,
      status: 'sent',
      externalMessageId: 'mid.image',
      delivery: {
        caption: { delivered: true, messageId: 'mid.caption' },
      },
    });
  });

  it('does not send a second message when the caption is empty', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ recipient_id: 'psid-1', message_id: 'mid.media' }),
    });
    const client = new MessengerClient(
      'https://graph.test',
      undefined,
      fetcher,
    );

    await client.send({
      channelId: 'channel-1',
      recipientId: 'psid-1',
      content: '   ',
      messageType: 'image',
      attachments: [{ url: 'https://cdn.example.com/order.jpg' }],
      credentials: { pageId: 'page-1', pageAccessToken: 'page-token' },
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('skips the caption when the attachment itself fails', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({
        error: { message: 'Invalid attachment', code: 100 },
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
      content: 'Here is your order.',
      messageType: 'image',
      attachments: [{ url: 'https://cdn.example.com/order.jpg' }],
      credentials: { pageId: 'page-1', pageAccessToken: 'page-token' },
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ accepted: false, status: 'provider_error' });
  });

  it('keeps the image sent when the caption is rejected', async () => {
    // The image reached the customer, so failing the command would invite a
    // retry that delivers it twice. Record the caption failure instead.
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ recipient_id: 'psid-1', message_id: 'mid.image' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'retry-after': '3' }),
        json: async () => ({
          error: { message: 'Caption rejected', code: 100 },
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
      content: 'Here is your order.',
      messageType: 'image',
      attachments: [{ url: 'https://cdn.example.com/order.jpg' }],
      credentials: { pageId: 'page-1', pageAccessToken: 'page-token' },
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      accepted: true,
      status: 'sent',
      externalMessageId: 'mid.image',
      delivery: {
        caption: {
          delivered: false,
          error: 'Caption rejected',
          code: 100,
          retryAfterSeconds: 3,
        },
      },
    });
  });

  it('retries a transient caption failure once without resending the image', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ recipient_id: 'psid-1', message_id: 'mid.image' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({
          error: { message: 'Temporary failure', code: 2, is_transient: true },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          recipient_id: 'psid-1',
          message_id: 'mid.caption',
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
      content: 'Here is your order.',
      messageType: 'image',
      attachments: [{ url: 'https://cdn.example.com/order.jpg' }],
      credentials: { pageId: 'page-1', pageAccessToken: 'page-token' },
    });

    // Upload path is skipped (public URL), so the three calls are: image,
    // failed caption, retried caption. The image is sent exactly once.
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetcher.mock.calls[2][1].body))).toMatchObject({
      message: { text: 'Here is your order.' },
    });
    expect(result).toMatchObject({
      accepted: true,
      delivery: { caption: { delivered: true } },
    });
  });

  it('rejects a caption beyond the Messenger text limit before sending', async () => {
    const fetcher = jest.fn();
    const client = new MessengerClient(
      'https://graph.test',
      undefined,
      fetcher,
    );

    const result = await client.send({
      channelId: 'channel-1',
      recipientId: 'psid-1',
      content: 'x'.repeat(2001),
      messageType: 'image',
      attachments: [{ url: 'https://cdn.example.com/order.jpg' }],
      credentials: { pageId: 'page-1', pageAccessToken: 'page-token' },
    });

    expect(result).toMatchObject({
      accepted: false,
      status: 'validation_error',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
