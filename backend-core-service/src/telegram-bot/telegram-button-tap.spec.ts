/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- Focused trail tests use in-memory provider doubles. */
import { TelegramCommerceService } from './telegram-commerce.service';

describe('TelegramCommerceService button trail (Plan 75)', () => {
  const update = {
    tenantId: 'tenant-1',
    channelId: 'channel-1',
    userId: 'user-1',
    chatId: 'chat-1',
    chatType: 'private',
  };
  const customer = { id: 'customer-1' };
  const conversation = { id: 'conversation-1' };

  function create() {
    const service = new TelegramCommerceService(
      {} as any,
      {
        routeCallback: jest.fn().mockResolvedValue({
          accepted: true,
          callback: { action: 'p' },
          session: { state: 'menu', version: 1, data: {} },
        }),
      } as any,
      {
        get: jest.fn().mockResolvedValue(null),
        allowCallback: jest.fn().mockResolvedValue(true),
      } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const customerRepository = {
      findOne: jest.fn().mockResolvedValue(customer),
    };
    const conversationRepository = {
      findOne: jest.fn().mockResolvedValue(conversation),
    };
    const messageRepository = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
      create: jest.fn((value: unknown): unknown => value),
      save: jest.fn(
        (value: unknown): Promise<unknown> =>
          Promise.resolve({
            ...(value as Record<string, unknown>),
            id: 'msg-1',
          }),
      ),
    };
    const websocketService = { emitNewMessage: jest.fn() };
    Object.assign(service as any, {
      customerRepository,
      conversationRepository,
      messageRepository,
      websocketService,
      answer: jest.fn().mockResolvedValue(undefined),
      showProducts: jest.fn().mockResolvedValue(undefined),
    });
    return {
      service,
      customerRepository,
      conversationRepository,
      messageRepository,
      websocketService,
    };
  }

  it('records an accepted tap with label and emits it', async () => {
    const { service, messageRepository, websocketService } = create();
    await (service as any).handleCallback(
      {
        channelId: 'channel-1',
        normalized: { eventType: 'callback_query', callbackQueryId: 'cb-1' },
      },
      update,
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(messageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Customer tapped Products',
        senderType: 'system',
        messageType: 'system_event',
        isInternal: true,
        metadata: expect.objectContaining({
          systemEvent: true,
          eventName: 'telegram.button_tap',
          idempotencyKey: 'telegram-tap:cb-1',
          action: 'p',
        }),
      }),
    );
    expect(websocketService.emitNewMessage).toHaveBeenCalledWith(
      'tenant-1',
      'conversation-1',
      expect.objectContaining({ id: 'msg-1' }),
    );
  });

  it('skips taps without an id and unknown actions', async () => {
    const { service, messageRepository } = create();
    await (service as any).recordButtonTap(update, 'p', undefined);
    await (service as any).recordButtonTap(update, 'zzz', 'cb-2');
    expect(messageRepository.save).not.toHaveBeenCalled();
  });

  it('skips when customer or conversation is missing', async () => {
    const { service, customerRepository, messageRepository } = create();
    customerRepository.findOne.mockResolvedValue(null);
    await (service as any).recordButtonTap(update, 'p', 'cb-3');
    expect(messageRepository.save).not.toHaveBeenCalled();
  });

  it('skips duplicate taps by idempotency key', async () => {
    const { service, messageRepository } = create();
    messageRepository.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'existing' }),
    }));
    await (service as any).recordButtonTap(update, 'o', 'cb-4');
    expect(messageRepository.save).not.toHaveBeenCalled();
  });
});
