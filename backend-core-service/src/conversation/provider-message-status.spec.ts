/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { NotFoundException } from '@nestjs/common';

import { ConversationService } from './conversation.service';

describe('ConversationService provider message status', () => {
  const conversationRepository = {
    findOne: jest.fn(),
  };
  const messageRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };
  const service = new ConversationService(
    conversationRepository as any,
    {} as any,
    messageRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    } as any,
    { find: jest.fn(async () => []) } as any,
    { resolveActivePeriodId: jest.fn(async () => null) } as any,
    { assertProviderMessageUsageAvailable: jest.fn() } as any,
    { emitNewMessage: jest.fn(), emitConversationUpdate: jest.fn() } as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    messageRepository.save.mockImplementation(async (value) => value);
  });

  it('persists provider send failures and retry metadata', async () => {
    const message = {
      id: 'message-1',
      externalMessageId: null,
      status: 'sent',
      metadata: {},
    };
    messageRepository.findOne.mockResolvedValue(message);
    await expect(
      service.updateProviderMessageStatus({
        messageId: 'message-1',
        provider: 'telegram',
        status: 'failed',
        providerStatus: 'provider_error',
        providerError: { code: 429, description: 'Too Many Requests' },
        retry: { recommended: true, retryAfterSeconds: 3 },
      }),
    ).resolves.toMatchObject({
      updated: true,
      messageId: 'message-1',
      status: 'failed',
    });

    expect(messageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        metadata: {
          providerDelivery: expect.objectContaining({
            provider: 'telegram',
            providerStatus: 'provider_error',
            providerError: { code: 429, description: 'Too Many Requests' },
            retry: { recommended: true, retryAfterSeconds: 3 },
          }),
        },
      }),
    );
  });

  it('rejects callbacks for unknown messages', async () => {
    messageRepository.findOne.mockResolvedValue(null);

    await expect(
      service.updateProviderMessageStatus({
        messageId: 'missing',
        provider: 'telegram',
        status: 'failed',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('persists Messenger delivery callbacks by external message ID', async () => {
    const message = {
      id: 'message-2',
      externalMessageId: 'mid.2',
      status: 'sent',
      metadata: {},
    };
    conversationRepository.findOne.mockResolvedValue({ id: 'conversation-1' });
    messageRepository.findOne.mockResolvedValue(message);

    await expect(
      service.updateProviderMessageStatus({
        externalMessageId: 'mid.2',
        channelId: 'channel-1',
        externalConversationId: 'psid-1',
        provider: 'messenger',
        status: 'delivered',
        providerStatus: 'delivery',
        providerMetadata: { watermark: 1_750_000_000_000 },
      }),
    ).resolves.toMatchObject({
      updated: true,
      messageId: 'message-2',
      status: 'delivered',
      statusApplied: true,
    });

    expect(messageRepository.findOne).toHaveBeenCalledWith({
      where: {
        conversationId: 'conversation-1',
        externalMessageId: 'mid.2',
      },
    });
    expect(messageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'delivered',
        metadata: {
          providerDelivery: expect.objectContaining({
            provider: 'messenger',
            providerStatus: 'delivery',
            providerMetadata: { watermark: 1_750_000_000_000 },
          }),
        },
      }),
    );
  });

  it('marks eligible outbound messages read through a Messenger watermark callback', async () => {
    const beforeWatermark = {
      id: 'message-3',
      status: 'delivered',
      senderType: 'csr',
      createdAt: new Date('2026-06-23T01:00:00.000Z'),
      metadata: {},
    };
    const afterWatermark = {
      id: 'message-4',
      status: 'sent',
      senderType: 'csr',
      createdAt: new Date('2026-06-23T03:00:00.000Z'),
      metadata: {},
    };
    conversationRepository.findOne.mockResolvedValue({ id: 'conversation-2' });
    messageRepository.find.mockResolvedValue([beforeWatermark, afterWatermark]);

    await expect(
      service.updateProviderMessageStatus({
        channelId: 'channel-1',
        externalConversationId: 'psid-1',
        watermark: new Date('2026-06-23T02:00:00.000Z').getTime(),
        provider: 'messenger',
        status: 'read',
        providerStatus: 'read',
      }),
    ).resolves.toMatchObject({
      updated: true,
      updatedCount: 1,
      conversationId: 'conversation-2',
      status: 'read',
    });

    expect(beforeWatermark.status).toBe('read');
    expect(afterWatermark.status).toBe('sent');
    expect(messageRepository.save).toHaveBeenCalledWith([beforeWatermark]);
  });

  it('does not downgrade a read message when an older delivery callback arrives', async () => {
    const message = {
      id: 'message-5',
      externalMessageId: 'mid.5',
      status: 'read',
      metadata: {},
    };
    messageRepository.findOne.mockResolvedValue(message);

    await expect(
      service.updateProviderMessageStatus({
        externalMessageId: 'mid.5',
        provider: 'messenger',
        status: 'delivered',
        providerStatus: 'delivery',
      }),
    ).resolves.toMatchObject({
      status: 'read',
      statusApplied: false,
    });
    expect(message.status).toBe('read');
  });

  it('does not fall back to another conversation when a scoped callback target is missing', async () => {
    conversationRepository.findOne.mockResolvedValue(null);

    await expect(
      service.updateProviderMessageStatus({
        externalMessageId: 'mid.shared',
        channelId: 'channel-1',
        externalConversationId: 'psid-missing',
        provider: 'messenger',
        status: 'delivered',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(messageRepository.findOne).not.toHaveBeenCalled();
  });
});
