import { BadRequestException } from '@nestjs/common';
import { TelegramBotRouter } from './telegram-bot.router';
import { encodeTelegramCallback } from './telegram-bot.types';

describe('TelegramBotRouter', () => {
  const sessions = { get: jest.fn() };
  const router = new TelegramBotRouter(sessions as never);
  const update = {
    tenantId: 'tenant-1',
    channelId: 'channel-1',
    userId: 'user-1',
    chatId: 'chat-1',
    chatType: 'private',
  };

  beforeEach(() => jest.clearAllMocks());

  it('parses compact callback payloads', () => {
    expect(router.parseCallback('products:abc:2')).toEqual({
      action: 'products',
      id: 'abc',
      page: 2,
    });
  });

  it('rejects callbacks over Telegram’s byte limit', () => {
    expect(() => router.parseCallback('x:' + '😀'.repeat(32))).toThrow(
      BadRequestException,
    );
  });

  it('keeps the worst-case compressed UUID callback below 64 bytes', () => {
    const payload = encodeTelegramCallback(
      'products',
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
      9999,
      999999999,
    );
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(64);
    expect(router.parseCallback(payload)).toMatchObject({
      action: 'products',
      page: 9999,
      version: 999999999,
      id: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
    });
  });

  it('rejects non-private chats', () => {
    expect(() =>
      router.assertPrivateChat({ ...update, chatType: 'group' }),
    ).toThrow(BadRequestException);
  });

  it('does not route stale callback state', async () => {
    sessions.get.mockResolvedValue({
      version: 3,
      state: 'catalog',
      data: {},
      expiresAt: '',
    });
    await expect(
      router.routeCallback(
        { ...update, callbackData: 'next:products:2' },
        'product',
        3,
      ),
    ).resolves.toMatchObject({ accepted: false, reason: 'version_mismatch' });
  });

  it('accepts root navigation from an old menu version', async () => {
    sessions.get.mockResolvedValue({
      version: 4,
      state: 'detail',
      data: {},
      expiresAt: '',
    });
    await expect(
      router.routeCallback({ ...update, callbackData: 'p::1:1' }, 'detail', 4),
    ).resolves.toMatchObject({ accepted: true, callback: { action: 'p' } });
  });

  it('keeps root navigation working across repeated menu renders', async () => {
    const session = {
      version: 2,
      state: 'menu',
      data: {},
      expiresAt: '',
    };
    sessions.get.mockResolvedValue(session);
    await expect(
      router.routeCallback({ ...update, callbackData: 'p::1:1' }, 'menu', 2),
    ).resolves.toMatchObject({ accepted: true, callback: { action: 'p' } });
    session.version = 3;
    await expect(
      router.routeCallback({ ...update, callbackData: 'm:::2' }, 'list', 3),
    ).resolves.toMatchObject({ accepted: true, callback: { action: 'm' } });
    session.version = 4;
    await expect(
      router.routeCallback({ ...update, callbackData: 'p::1:1' }, 'menu', 4),
    ).resolves.toMatchObject({ accepted: true, callback: { action: 'p' } });
  });

  it('rejects stale paging and quantity callbacks', async () => {
    sessions.get.mockResolvedValue({
      version: 2,
      state: 'list',
      data: {},
      expiresAt: '',
    });
    await expect(
      router.routeCallback({ ...update, callbackData: 'n::2:1' }, 'list', 2),
    ).resolves.toMatchObject({ accepted: false, reason: 'version_mismatch' });
    sessions.get.mockResolvedValue({
      version: 2,
      state: 'detail',
      data: {},
      expiresAt: '',
    });
    await expect(
      router.routeCallback(
        { ...update, callbackData: 'i:product::1' },
        'detail',
        2,
      ),
    ).resolves.toMatchObject({ accepted: false, reason: 'version_mismatch' });
  });

  it('accepts root navigation when the session has expired', async () => {
    sessions.get.mockResolvedValue(null);
    await expect(
      router.routeCallback({ ...update, callbackData: 'm:::2' }, '', 0),
    ).resolves.toMatchObject({ accepted: true, callback: { action: 'm' } });
  });

  it('classifies malformed callbacks for structured rejection logging', async () => {
    sessions.get.mockResolvedValue(null);
    await expect(
      router.routeCallback({ ...update, callbackData: 'bad payload' }, '', 0),
    ).resolves.toMatchObject({ accepted: false, reason: 'bad_payload' });
  });
});
