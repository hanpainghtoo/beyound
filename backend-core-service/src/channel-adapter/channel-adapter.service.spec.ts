/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- Adapter unit test doubles intentionally use partial repository/adapter shapes. */
import { ChannelAdapterService } from './channel-adapter.service';

describe('ChannelAdapterService Telegram reachability', () => {
  beforeEach(() => {
    process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY =
      'test-telegram-encryption-key-with-32-chars';
  });

  afterAll(() => {
    delete process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY;
  });

  const channel = {
    id: 'channel-1',
    status: 'active',
    connectionStatus: 'ready',
    credentials: {},
  };

  function createService(result: Record<string, unknown>) {
    const channelRepository = {
      findOne: jest.fn().mockResolvedValue(channel),
    };
    const customerRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'customer-1',
        channelId: 'channel-1',
        provider: 'telegram',
        externalId: 'chat-1',
        botBlockedAt: null,
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ChannelAdapterService(
      channelRepository as any,
      customerRepository as any,
    );
    (service as any).adapters.set('telegram', {
      type: 'telegram',
      sendMessage: jest.fn().mockResolvedValue(result),
    });
    return { service, customerRepository };
  }

  const input = {
    channelId: 'channel-1',
    conversationId: 'conversation-1',
    recipientId: 'chat-1',
    content: 'Hello',
  };

  it('marks a customer for Telegram blocked-user 403 results', async () => {
    const { service, customerRepository } = createService({
      status: 'failed',
      metadata: {
        providerStatus: 'forbidden',
        providerError: { code: 'bot_blocked' },
      },
    });

    await service.sendMessage('telegram', input);

    expect(customerRepository.update).toHaveBeenCalledWith(
      {
        channelId: 'channel-1',
        provider: 'telegram',
        externalId: 'chat-1',
      },
      expect.objectContaining({ botBlockedReason: 'bot_blocked' }),
    );
  });

  it('does not mark for another Telegram 403 cause', async () => {
    const { service, customerRepository } = createService({
      status: 'failed',
      metadata: {
        providerStatus: 'forbidden',
        providerError: { code: 'chat_not_found' },
      },
    });

    await service.sendMessage('telegram', input);

    expect(customerRepository.update).not.toHaveBeenCalled();
  });

  it('skips sends to a customer already marked blocked', async () => {
    const { service, customerRepository } = createService({
      status: 'sent',
    });
    customerRepository.findOne.mockResolvedValue({
      id: 'customer-1',
      botBlockedAt: new Date('2026-09-30T00:00:00.000Z'),
      botBlockedReason: 'bot_blocked',
    });

    const result = await service.sendMessage('telegram', input);

    expect(result).toMatchObject({
      status: 'failed',
      metadata: {
        providerStatus: 'customer_bot_blocked',
        skipped: true,
        retry: { recommended: false },
      },
    });
    expect(customerRepository.update).not.toHaveBeenCalled();
  });
});
