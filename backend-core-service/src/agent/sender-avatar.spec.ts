/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { createHash } from 'crypto';

import { AgentService } from './agent.service';

/**
 * Sender avatars are provider-aware.
 *
 * Telegram hands us a `file_id` that never expires; Messenger hands us a
 * signed CDN URL that does, and only via Graph. Both are resolved on demand and
 * cached as a pointer on Customer.profileData — nothing is written to media
 * storage, and the page token never leaves the server.
 */
jest.mock('../channel/telegram-bot-api.client', () => ({
  TelegramBotApiClient: jest.fn().mockImplementation(() => ({
    getUserProfilePhotoFileId: jest.fn().mockResolvedValue('telegram-file-1'),
    downloadFile: jest.fn().mockResolvedValue({
      bytes: Buffer.from([1, 2, 3]),
      contentType: 'image/jpeg',
    }),
  })),
}));

jest.mock('../channel/provider-credentials.util', () => ({
  decryptProviderCredentials: jest.fn(() => ({
    botToken: 'bot-token',
    pageAccessToken: 'page-token',
  })),
}));

type Channel = Record<string, any>;
type CustomerRecord = Record<string, any>;

function createService(channel: Channel, customer: CustomerRecord) {
  const conversationRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'conv-1',
      channelId: 'channel-1',
      customerId: 'customer-1',
    }),
  };
  const customerRepository = {
    findOne: jest.fn(async () => customer),
    save: jest.fn(async (value: CustomerRecord) => value),
  };
  const tenantChannelRepository = {
    findOne: jest.fn().mockResolvedValue(channel),
  };
  const emptyRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };

  const service = new AgentService(
    conversationRepository as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    customerRepository as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    tenantChannelRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { getDownloadUrl: jest.fn() } as any,
  );

  return { service, customerRepository };
}

function messengerFetch(profilePic?: string) {
  return jest.fn(async (url: string, init?: RequestInit) => {
    void init;
    if (String(url).includes('graph.test')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          first_name: 'Aye',
          ...(profilePic ? { profile_pic: profilePic } : {}),
        }),
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => Buffer.from([1, 2, 3]),
    } as unknown as Response;
  });
}

const MESSENGER_CHANNEL = {
  id: 'channel-1',
  tenantId: 'tenant-1',
  channelType: 'messenger',
  credentials: 'encrypted',
};

const realFetch = globalThis.fetch;
const originalGraphBase = process.env.MESSENGER_GRAPH_API_BASE_URL;
const originalGraphVersion = process.env.META_GRAPH_API_VERSION;

beforeEach(() => {
  process.env.MESSENGER_GRAPH_API_BASE_URL = 'https://graph.test';
  process.env.META_GRAPH_API_VERSION = 'v99.0';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (originalGraphBase === undefined) {
    delete process.env.MESSENGER_GRAPH_API_BASE_URL;
  } else {
    process.env.MESSENGER_GRAPH_API_BASE_URL = originalGraphBase;
  }
  if (originalGraphVersion === undefined) {
    delete process.env.META_GRAPH_API_VERSION;
  } else {
    process.env.META_GRAPH_API_VERSION = originalGraphVersion;
  }
});

describe('AgentService.getSenderAvatar', () => {
  it('resolves a Messenger profile picture through Graph and caches it', async () => {
    const fetcher = messengerFetch('https://cdn.test/avatar.jpg');
    globalThis.fetch = fetcher;
    const customer: CustomerRecord = {
      id: 'customer-1',
      externalId: 'psid-1',
      profileData: {},
    };
    const { service, customerRepository } = createService(
      MESSENGER_CHANNEL,
      customer,
    );

    await expect(
      service.getSenderAvatar('tenant-1', 'conv-1'),
    ).resolves.toEqual({
      bytes: Buffer.from([1, 2, 3]),
      contentType: 'image/jpeg',
    });

    const graphCall = fetcher.mock.calls.find(([url]) =>
      String(url).includes('graph.test'),
    );
    expect(String(graphCall?.[0])).toContain('/v99.0/psid-1');
    expect(String(graphCall?.[0])).toContain('fields=profile_pic');
    // The page token must travel in a header, never in the URL.
    expect(String(graphCall?.[0])).not.toContain('page-token');
    expect(graphCall?.[1]?.headers).toEqual({
      Authorization: 'Bearer page-token',
    });

    expect(customerRepository.save).toHaveBeenCalled();
    expect(customer.profileData.providerAvatarUrl).toBe(
      'https://cdn.test/avatar.jpg',
    );
    expect(customer.profileData.noProviderAvatar).toBe(false);
  });

  it('reuses the cached URL instead of calling Graph on every render', async () => {
    const fetcher = messengerFetch('https://cdn.test/avatar.jpg');
    globalThis.fetch = fetcher;
    const customer: CustomerRecord = {
      id: 'customer-1',
      externalId: 'psid-1',
      profileData: {},
    };
    const { service } = createService(MESSENGER_CHANNEL, customer);

    await service.getSenderAvatar('tenant-1', 'conv-1');
    await service.getSenderAvatar('tenant-1', 'conv-1');

    const graphCalls = fetcher.mock.calls.filter(([url]) =>
      String(url).includes('graph.test'),
    );
    expect(graphCalls).toHaveLength(1);
  });

  it('records a negative cache when the person has no picture', async () => {
    globalThis.fetch = messengerFetch();
    const customer: CustomerRecord = {
      id: 'customer-1',
      externalId: 'psid-1',
      profileData: {},
    };
    const { service, customerRepository } = createService(
      MESSENGER_CHANNEL,
      customer,
    );

    await expect(
      service.getSenderAvatar('tenant-1', 'conv-1'),
    ).resolves.toBeNull();
    expect(customer.profileData.noProviderAvatar).toBe(true);
    expect(customerRepository.save).toHaveBeenCalled();
  });

  it('still resolves Telegram avatars from the cached file_id', async () => {
    const customer: CustomerRecord = {
      id: 'customer-1',
      externalId: '777',
      profileData: {
        profilePhotoFileId: 'telegram-file-1',
        profilePhotoFetchedAt: new Date().toISOString(),
        profilePhotoBotTokenHash: createHash('sha256')
          .update('bot-token')
          .digest('hex'),
      },
    };
    const { service } = createService(
      { id: 'channel-1', tenantId: 'tenant-1', channelType: 'telegram' },
      customer,
    );

    await expect(
      service.getSenderAvatar('tenant-1', 'conv-1'),
    ).resolves.toEqual({
      bytes: Buffer.from([1, 2, 3]),
      contentType: 'image/jpeg',
    });
  });

  it('returns null for a channel without an avatar provider', async () => {
    const { service } = createService(
      { id: 'channel-1', tenantId: 'tenant-1', channelType: 'viber' },
      { id: 'customer-1', externalId: 'viber-1', profileData: {} },
    );

    await expect(
      service.getSenderAvatar('tenant-1', 'conv-1'),
    ).resolves.toBeNull();
  });
});
