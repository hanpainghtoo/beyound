/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { TelegramCommerceService } from './telegram-commerce.service';

describe('Telegram checkout and read-only orders', () => {
  const update = {
    tenantId: 'tenant-1',
    channelId: 'channel-1',
    userId: 'user-1',
    chatId: 'chat-1',
    chatType: 'private',
  };

  function create(
    result: any = {
      kind: 'created',
      order: {
        id: 'order-1',
        orderNumber: 'MM-ORD-1001',
        status: 'pending',
        totalAmount: 100,
        currency: 'MMK',
        expiresAt: new Date('2030-01-01'),
      },
    },
  ) {
    const session: any = {
      version: 1,
      state: 'detail',
      data: { productId: 'product-1', quantity: 1 },
      expiresAt: '',
    };
    const api = {
      sendMessage: jest.fn().mockResolvedValue({ messageId: 1 }),
      answerCallbackQuery: jest.fn(),
      setMyCommands: jest.fn(),
      deleteMessage: jest.fn(),
      downloadFile: jest.fn().mockResolvedValue({
        bytes: Buffer.from('proof'),
        contentType: 'image/jpeg',
        filePath: 'proof.jpg',
      }),
    };
    const customer: any = {
      id: 'customer-1',
      tenantId: 'tenant-1',
      channelId: 'channel-1',
      provider: 'telegram',
      externalId: 'user-1',
      fullName: 'Saved Name',
      phone: null,
      profileData: {},
    };
    const channel: any = {
      id: 'channel-1',
      tenantId: 'tenant-1',
      credentials: { botToken: 'token' },
      configuration: {
        telegramShopping: {
          shopEnabled: true,
          orderingEnabled: true,
          currency: 'MMK',
        },
      },
    };
    const orderCreation = {
      createBotOrder: jest.fn().mockResolvedValue(result),
      replaceBotOrder: jest.fn().mockResolvedValue(result),
    };
    const transitionService = {
      submitPaymentProof: jest.fn().mockResolvedValue(result.order),
    };
    const sessions = {
      get: jest.fn().mockImplementation(() => session),
      set: jest
        .fn()
        .mockImplementation((_update: unknown, next: any) =>
          Object.assign(session, next),
        ),
      allowCallback: jest.fn().mockResolvedValue(true),
    };
    const service = new TelegramCommerceService(
      {
        getProductById: jest.fn().mockResolvedValue({
          id: 'product-1',
          name: 'Tea',
          price: 100,
          trackInventory: true,
          stockQuantity: 4,
          status: 'active',
        }),
      } as any,
      { routeCallback: jest.fn() } as any,
      sessions as any,
      transitionService as any,
      {
        findOneBy: jest.fn().mockResolvedValue(channel),
        save: jest.fn().mockResolvedValue(channel),
      } as any,
      {
        findOneBy: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          language: 'en',
          orderExpirySettings: { pendingPayment: 2 },
        }),
      } as any,
      {
        findOne: jest.fn().mockResolvedValue(customer),
        save: jest.fn().mockResolvedValue(customer),
      } as any,
      {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(result.order || null),
        count: jest.fn().mockResolvedValue(0),
      } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      orderCreation as any,
      { getEnabledMethods: jest.fn().mockResolvedValue([]) } as any,
      {
        createUpload: jest.fn().mockResolvedValue({
          file: { id: 'storage-proof-1' },
          upload: { url: 'https://storage.test/upload' },
        }),
      } as any,
    );
    (service as any).telegram = api;
    (service as any).botToken = jest.fn().mockReturnValue('token');
    return {
      service,
      api,
      session,
      customer,
      channel,
      orderCreation,
      transitionService,
    };
  }

  it('runs the happy path and sends no client price or total to the creation contract', async () => {
    const { service, session, orderCreation } = create();
    await (service as any).startCheckout(
      { channelId: 'channel-1' },
      update,
      'product-1',
      session.data,
    );
    await (service as any).handleCheckoutInput(
      { channelId: 'channel-1', normalized: {} },
      update,
      session,
      'New Customer',
    );
    await (service as any).handleCheckoutInput(
      { channelId: 'channel-1', normalized: {} },
      update,
      session,
      '09123456789',
    );
    await (service as any).handleCheckoutInput(
      { channelId: 'channel-1', normalized: {} },
      update,
      session,
      'New Customer | 09123456789 | 10 Main Street | Dagon | Yangon | gate',
    );
    await (service as any).confirmCheckout(
      { channelId: 'channel-1' },
      update,
      session.data,
    );
    expect(orderCreation.createBotOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        displayedPrice: 100,
        quantity: 1,
        paymentMethod: 'online',
      }),
    );
    expect(orderCreation.createBotOrder.mock.calls[0][0]).not.toHaveProperty(
      'total',
    );
    expect(orderCreation.createBotOrder.mock.calls[0][0]).not.toHaveProperty(
      'currency',
    );
    expect(session.state).toBe('menu');
  });

  it('does not consume a random photo as payment proof outside the payment or rejected-retry state', async () => {
    const { service, session, transitionService } = create();
    (service as any).orderRepository.findOne.mockImplementation((query: any) =>
      query.where?.status === 'rejected'
        ? null
        : { status: 'pending', paymentStatus: 'unpaid' },
    );
    session.state = 'detail';
    session.data = { productId: 'product-1', quantity: 1 };
    await expect(
      service.handle({
        provider: 'telegram',
        channelId: 'channel-1',
        normalized: {
          eventType: 'message',
          senderId: 'user-1',
          externalConversationId: 'chat-1',
          metadata: {
            raw: { message: { photo: [{ file_id: 'random-photo' }] } },
          },
        },
      }),
    ).resolves.toEqual({ handled: false });
    expect(transitionService.submitPaymentProof).not.toHaveBeenCalled();
  });

  it('rejects another user contact and normalizes typed phones', async () => {
    const { service, session, orderCreation } = create();
    session.state = 'checkout_phone';
    session.data = {
      productId: 'product-1',
      quantity: 1,
      displayedPrice: 100,
      checkoutSessionVersion: '2',
      name: 'Name',
    };
    await (service as any).handleCheckoutInput(
      {
        channelId: 'channel-1',
        normalized: {
          metadata: {
            raw: {
              message: {
                contact: { user_id: 'other', phone_number: '+959912345678' },
              },
            },
          },
        },
      },
      update,
      session,
      '',
    );
    expect(session.state).toBe('checkout_phone');
    await (service as any).handleCheckoutInput(
      { channelId: 'channel-1', normalized: {} },
      update,
      session,
      '09123456789',
    );
    expect(session.data.phone).toBe('+959123456789');
    expect(orderCreation.createBotOrder).not.toHaveBeenCalled();
  });

  it('routes a Telegram proof photo through the order transition service', async () => {
    const { service, session } = create();
    const submitPaymentProof = jest.fn().mockResolvedValue({});
    (service as any).transitionService = { submitPaymentProof };
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response);
    session.state = 'payment';
    session.data = { paymentOrderId: 'order-1' };
    await (service as any).handle({
      provider: 'telegram',
      channelId: 'channel-1',
      normalized: {
        eventType: 'message',
        senderId: 'user-1',
        externalConversationId: 'chat-1',
        metadata: {
          telegramChatType: 'private',
          raw: { message: { message_id: 44, photo: [{ file_id: 'proof-1' }] } },
        },
      },
    });
    expect(submitPaymentProof).toHaveBeenCalledWith(
      'tenant-1',
      'order-1',
      'customer-1',
      expect.objectContaining({
        fileId: 'storage-proof-1',
        telegramFileId: 'proof-1',
        sourceMessageId: '44',
      }),
    );
    fetchSpy.mockRestore();
  });

  it.each([
    [{ kind: 'price_changed', currentPrice: 125 }, 'The price is now'],
    [{ kind: 'out_of_stock', available: 0 }, 'unavailable'],
  ])('renders creation result %j', async (result, expected) => {
    const { service, api, session } = create(result);
    session.state = 'checkout_summary';
    session.data = {
      productId: 'product-1',
      productName: 'Tea',
      quantity: 1,
      displayedPrice: 100,
      checkoutSessionVersion: '2',
      name: 'Name',
      phone: '+959123456789',
      address: '10 Main Street, Dagon, Yangon',
    };
    await (service as any).confirmCheckout(
      { channelId: 'channel-1' },
      update,
      session.data,
    );
    expect(
      api.sendMessage.mock.calls
        .map((call: any[]) => call[1]?.text || '')
        .join(' '),
    ).toContain(expected);
  });

  it('offers keep/cancel replacement for an existing order', async () => {
    const { service, api, session } = create({
      kind: 'existing_order',
      order: { id: 'old-1', orderNumber: 'MM-ORD-1' },
    });
    session.state = 'checkout_summary';
    session.data = {
      productId: 'product-1',
      quantity: 1,
      displayedPrice: 100,
      checkoutSessionVersion: '2',
      name: 'Name',
      phone: '+959123456789',
      address: '10 Main Street, Dagon, Yangon',
    };
    await (service as any).confirmCheckout(
      { channelId: 'channel-1' },
      update,
      session.data,
    );
    expect(
      api.sendMessage.mock.calls
        .map((call: any[]) => JSON.stringify(call[1] || ''))
        .join(' '),
    ).toContain('Keep it');
    expect(session.state).toBe('existing_order');
  });
});
