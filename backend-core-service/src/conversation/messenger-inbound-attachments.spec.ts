/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { ConversationService } from './conversation.service';

/**
 * Inbound Messenger media.
 *
 * Meta delivers `{type, payload: {url}}` with a short-lived CDN link and no
 * mime type. Core must download those bytes during ingest — the URL rots, so
 * persisting the ref alone leaves the thread with an attachment nothing can
 * resolve.
 */
jest.mock('../channel/provider-credentials.util', () => ({
  decryptProviderCredentials: jest.fn(() => ({
    pageAccessToken: 'page-token',
    botToken: 'bot-token',
  })),
}));

function createService(createUpload: jest.Mock) {
  const mediaLibraryService = { createUpload };
  const service = new ConversationService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    mediaLibraryService as any,
    {} as any,
  );
  return service;
}

const CHANNEL = {
  id: 'channel-1',
  tenantId: 'tenant-1',
  channelType: 'messenger',
  credentials: 'encrypted',
};

describe('ConversationService inbound Messenger attachments', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('downloads a Messenger CDN attachment into file storage', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const createUpload = jest.fn().mockResolvedValue({
      file: { id: 'file-1' },
      upload: {
        url: 'https://storage.test/upload',
        headers: { 'x-test': '1' },
      },
    });
    const fetcher = jest.fn(
      async (_url: string, init?: { method?: string }) => {
        if (init?.method === 'PUT') {
          return { ok: true, status: 200 } as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'image/png' }),
          arrayBuffer: async () => bytes,
        } as unknown as Response;
      },
    );
    globalThis.fetch = fetcher;

    const service = createService(createUpload);
    const attachments = await (service as any).persistInboundAttachments(
      'tenant-1',
      CHANNEL,
      'customer-1',
      [{ type: 'image', url: 'https://cdn.test/photo.png' }],
    );

    expect(createUpload).toHaveBeenCalledWith(
      'tenant-1',
      'customer-1',
      expect.objectContaining({
        contentType: 'image/png',
        purpose: 'message-media',
        sizeBytes: bytes.length,
      }),
    );
    expect(attachments[0]).toMatchObject({
      type: 'image',
      fileId: 'file-1',
      contentType: 'image/png',
      source: 'provider-inbound',
    });
  });

  it('keeps the raw ref when the CDN download fails', async () => {
    const createUpload = jest.fn();
    globalThis.fetch = jest.fn(
      async () =>
        ({
          ok: false,
          status: 404,
        }) as unknown as Response,
    );

    const service = createService(createUpload);
    const attachments = await (service as any).persistInboundAttachments(
      'tenant-1',
      CHANNEL,
      'customer-1',
      [{ type: 'video', url: 'https://cdn.test/expired.mp4' }],
    );

    // Fail-soft: the message still lands, and the raw ref stays so the thread
    // can report the attachment as unavailable instead of silently dropping it.
    expect(createUpload).not.toHaveBeenCalled();
    expect(attachments).toEqual([
      { type: 'video', url: 'https://cdn.test/expired.mp4' },
    ]);
  });
});
