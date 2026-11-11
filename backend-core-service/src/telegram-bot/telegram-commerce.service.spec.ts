/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- Focused commerce tests use in-memory provider doubles. */
import { TelegramCommerceService } from './telegram-commerce.service';

describe('TelegramCommerceService browse', () => {
  const product = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Phone',
    description: 'A phone',
    shortDescription: '',
    price: 1234567,
    stockQuantity: 2,
    trackInventory: true,
    status: 'active',
    images: ['media-1'],
    primaryImageUrl: 'https://public.example.com/image.jpg',
  };

  function create() {
    const calls: string[] = [];
    const api = {
      sendMessage: jest.fn().mockImplementation(() => {
        calls.push('sendMessage');
        return { messageId: 20 };
      }),
      sendPhoto: jest.fn().mockImplementation((_token, input) => {
        calls.push(`sendPhoto:${input.photo}`);
        return { messageId: 21, fileId: 'telegram-file-1' };
      }),
      deleteMessage: jest.fn().mockImplementation(() => {
        calls.push('deleteMessage');
        return { ok: true };
      }),
      editMessageCaption: jest
        .fn()
        .mockResolvedValue({ ok: false, notModified: true }),
      editMessageText: jest
        .fn()
        .mockResolvedValue({ ok: true, notModified: false }),
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      setMyCommands: jest.fn().mockResolvedValue(undefined),
    };
    const channel: any = {
      id: 'channel-1',
      tenantId: 'tenant-1',
      credentials: { botToken: 'token' },
      configuration: { telegramShopping: { currency: 'MMK' } },
    };
    const session = {
      version: 2,
      state: 'list',
      data: {
        listMessageId: 10,
        productId: product.id,
        detailMessageId: 11,
        quantity: 2,
      },
      expiresAt: '',
    };
    const sessions = {
      get: jest.fn().mockResolvedValue(session),
      set: jest.fn().mockImplementation((_update, next) => ({
        ...next,
        expiresAt: '',
      })),
      allowCallback: jest.fn().mockResolvedValue(true),
    };
    const router = {
      routeCallback: jest.fn().mockResolvedValue({
        accepted: true,
        callback: { action: 'd', id: product.id, version: 2 },
        session,
      }),
    };
    const productService = {
      getAllProducts: jest
        .fn()
        .mockResolvedValue({ data: [product], total: 1, totalPages: 1 }),
      getProductById: jest.fn().mockResolvedValue(product),
    };
    const channelRepository = {
      findOneBy: jest.fn().mockResolvedValue(channel),
      save: jest.fn().mockResolvedValue(channel),
    };
    const tenantRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        companyName: 'Shop',
        language: 'en',
      }),
    };
    const service = new TelegramCommerceService(
      productService as any,
      router as any,
      sessions as any,
      { submitPaymentProof: jest.fn() } as any,
      channelRepository as any,
      tenantRepository as any,
    );
    (service as any).telegram = api;
    (service as any).botToken = jest.fn().mockReturnValue('token');
    return { service, api, calls, sessions, router, productService, channel };
  }

  const update = {
    tenantId: 'tenant-1',
    channelId: 'channel-1',
    userId: 'user-1',
    chatId: 'chat-1',
    chatType: 'private',
  };

  it('uses stable six-item product pages and clamps pagination boundaries', async () => {
    const { service, productService } = create();
    await (service as any).showProducts(
      { channelId: 'channel-1' },
      update,
      0,
      true,
    );
    expect(productService.getAllProducts).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        page: 1,
        limit: 6,
        status: 'active',
        sortOrder: 'DESC',
      }),
    );
  });

  it('leaves /start on the normal inbox path when shopEnabled is false', async () => {
    const { service, api } = create();
    await expect(
      service.handle({
        provider: 'telegram',
        channelId: 'channel-1',
        normalized: {
          content: '/start',
          senderId: 'user-1',
          externalConversationId: 'chat-1',
        },
      }),
    ).resolves.toEqual({ handled: false });
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('acknowledges disabled-shop callbacks without rendering a shop menu', async () => {
    const { service, api } = create();
    await expect(
      service.handle({
        provider: 'telegram',
        channelId: 'channel-1',
        normalized: {
          eventType: 'callback_query',
          callbackQueryId: 'callback-disabled-shop',
          callbackData: 'p::1:1',
          senderId: 'user-1',
          externalConversationId: 'chat-1',
          metadata: { telegramChatType: 'private' },
        },
      }),
    ).resolves.toEqual({ handled: false });
    expect(api.answerCallbackQuery).toHaveBeenCalledWith(
      'token',
      'callback-disabled-shop',
      'Shop unavailable.',
    );
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('renders the shop menu only when shopEnabled is true', async () => {
    const { service, api, channel } = create();
    channel.configuration.telegramShopping.shopEnabled = true;
    await expect(
      service.handle({
        provider: 'telegram',
        channelId: 'channel-1',
        normalized: {
          content: '/start',
          senderId: 'user-1',
          externalConversationId: 'chat-1',
        },
      }),
    ).resolves.toEqual({ handled: true });
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('re-sends the menu after a callback arrives with an expired session', async () => {
    const { service, api, sessions, router, channel } = create();
    channel.configuration.telegramShopping.shopEnabled = true;
    sessions.get.mockResolvedValue(null);
    router.routeCallback.mockResolvedValue({
      accepted: false,
      reason: 'missing_session',
      callback: { action: 'n', version: 1 },
    });
    await service.handle({
      provider: 'telegram',
      channelId: 'channel-1',
      normalized: {
        eventType: 'callback_query',
        callbackData: 'n::1:1',
        callbackQueryId: 'callback-1',
        senderId: 'user-1',
        externalConversationId: 'chat-1',
        metadata: { telegramChatType: 'private' },
      },
    });
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(api.answerCallbackQuery).toHaveBeenCalledWith(
      'token',
      'callback-1',
      'This menu expired.',
    );
  });

  it('emits the version that it persists for successive menus', async () => {
    const { service, api, sessions } = create();
    const stored = {
      version: 2,
      state: 'menu',
      data: {},
      expiresAt: '',
    };
    sessions.get.mockImplementation(() => Promise.resolve(stored));
    sessions.set.mockImplementation((_update: unknown, next: any) => {
      Object.assign(stored, next);
      return Promise.resolve({ ...next, expiresAt: '' });
    });

    await (service as any).showMenu({ channelId: 'channel-1' }, update);
    await (service as any).showMenu({ channelId: 'channel-1' }, update);

    expect(
      api.sendMessage.mock.calls[0][1].replyMarkup.inline_keyboard[0][0],
    ).toEqual(expect.objectContaining({ callback_data: 'p::1:3' }));
    expect(
      api.sendMessage.mock.calls[1][1].replyMarkup.inline_keyboard[0][0],
    ).toEqual(expect.objectContaining({ callback_data: 'p::1:4' }));
    expect(sessions.set).toHaveBeenLastCalledWith(
      update,
      expect.objectContaining({ version: 4 }),
    );
  });

  it('renders the menu from the integrated template when enabled', async () => {
    const { service, api } = create();
    (service as any).botTemplates = {
      resolveChannelTemplate: jest.fn().mockResolvedValue({
        template: { id: 'tpl-1' },
        fields: [
          { key: 'greeting', sort: 0, layout: 'full', visible: true, condition: null, value: { label: 'Hello friends' } },
          { key: 'products', sort: 1, layout: 'full', visible: true, condition: null, value: { label: 'Catalog' } },
          { key: 'agent', sort: 2, layout: 'full', visible: true, condition: null, value: {} },
        ],
      }),
    };
    await (service as any).showMenu({ channelId: 'channel-1' }, update);
    const sent = api.sendMessage.mock.calls[0][1];
    expect(sent.text).toBe('Hello friends');
    const buttons = sent.replyMarkup.inline_keyboard.flat();
    expect(buttons.map((button: any) => button.text)).toEqual([
      'Catalog',
      'Chat with agent',
    ]);
    expect(buttons[0].callback_data.startsWith('p:')).toBe(true);
    expect(buttons[1].callback_data.startsWith('a:')).toBe(true);
  });

  it('falls back to the legacy menu when template resolution fails', async () => {
    const { service, api } = create();
    (service as any).botTemplates = {
      resolveChannelTemplate: jest.fn().mockRejectedValue(new Error('db down')),
    };
    await (service as any).showMenu({ channelId: 'channel-1' }, update);
    const buttons = api.sendMessage.mock.calls[0][1].replyMarkup.inline_keyboard.flat();
    expect(buttons.map((button: any) => button.text)).toEqual([
      'Products',
      'Shop info',
      'Chat with agent',
    ]);
  });
  it('falls back to the legacy menu when no template resolves', async () => {
    const { service, api } = create();
    (service as any).botTemplates = {
      resolveChannelTemplate: jest.fn().mockResolvedValue(null),
    };
    await (service as any).showMenu({ channelId: 'channel-1' }, update);
    const buttons = api.sendMessage.mock.calls[0][1].replyMarkup.inline_keyboard.flat();
    expect(buttons.map((button: any) => button.text)).toEqual([
      'Products',
      'Shop info',
      'Chat with agent',
    ]);
  });

  it('sends detail before deleting the old list and caches Telegram file_id', async () => {
    const { service, calls, channel } = create();
    await (service as any).showDetail(
      { channelId: 'channel-1' },
      update,
      product.id,
      true,
    );
    expect(calls.slice(0, 2)).toEqual([
      'sendPhoto:https://public.example.com/image.jpg',
      'deleteMessage',
    ]);
    expect(channel.configuration.telegramShopping.photoFileIds['media-1']).toBe(
      'telegram-file-1',
    );
  });

  it('uses the cached file_id on later detail sends', async () => {
    const { service, api, channel } = create();
    channel.configuration.telegramShopping.photoFileIds = {
      'media-1': 'cached-file',
    };
    await (service as any).showDetail(
      { channelId: 'channel-1' },
      update,
      product.id,
      false,
    );
    expect(api.sendPhoto.mock.calls[0][1].photo).toBe('cached-file');
  });

  it('caps tracked quantity by stock and untracked quantity by the default cap', async () => {
    const { service, sessions, productService } = create();
    await (service as any).changeQuantity(
      { channelId: 'channel-1' },
      update,
      product.id,
      1,
    );
    expect(sessions.set).toHaveBeenCalledWith(
      update,
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 2 }),
      }),
    );
    productService.getProductById.mockResolvedValue({
      ...product,
      trackInventory: false,
      stockQuantity: 0,
    });
    sessions.get.mockResolvedValue({
      version: 2,
      state: 'detail',
      data: { detailMessageId: 11, productId: product.id, quantity: 10 },
    });
    await (service as any).changeQuantity(
      { channelId: 'channel-1' },
      update,
      product.id,
      1,
    );
    expect(sessions.set).toHaveBeenLastCalledWith(
      update,
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 10 }),
      }),
    );
  });

  it('handles not-modified edits and hides Order now for out-of-stock products', async () => {
    const { service, api, productService } = create();
    const toast = await (service as any).changeQuantity(
      { channelId: 'channel-1' },
      update,
      product.id,
      0,
    );
    expect(toast).toMatch(/quantity/i);
    productService.getProductById.mockResolvedValue({
      ...product,
      status: 'out_of_stock',
      stockQuantity: 0,
    });
    await (service as any).showDetail(
      { channelId: 'channel-1' },
      update,
      product.id,
      false,
    );
    const markup = api.sendPhoto.mock.calls.at(-1)?.[1].replyMarkup;
    expect(JSON.stringify(markup)).not.toContain('Order now');
  });
  describe('TelegramCommerceService payment images', () => {
    const paymentUpdate = {
      tenantId: 'tenant-1',
      channelId: 'channel-1',
      userId: 'user-1',
      chatId: 'chat-1',
      chatType: 'private',
    };

    async function showPayment(
      options: {
        image?: boolean;
        cached?: boolean;
        photoFailure?: boolean;
        longDetails?: boolean;
        invalidImage?: boolean;
      } = {},
    ) {
      const context = create();
      const method = {
        id: 'method-1',
        name: options.longDetails ? 'Method '.repeat(200) : 'KBZPay',
        accountName: options.longDetails ? 'Account '.repeat(200) : 'Shop',
        accountNumber: options.longDetails ? '09'.repeat(400) : '09781234567',
        qrMediaId: options.image ? 'media-qr' : null,
        enabled: true,
        displayOrder: 0,
      };
      Reflect.set(context.service, 'paymentService', {
        getEnabledMethods: jest.fn().mockResolvedValue([method]),
      });
      Reflect.set(context.service, 'orderRepository', {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'ORD-1',
          tenantId: 'tenant-1',
          paymentMethodId: 'method-1',
          totalAmount: 25000,
          currency: 'MMK',
          expiresAt: new Date('2026-10-10T12:00:00Z'),
        }),
      });
      Reflect.set(context.service, 'mediaLibrary', {
        getPaymentMethodImage: options.invalidImage
          ? jest
              .fn()
              .mockRejectedValue(new Error('wrong payment image purpose'))
          : jest.fn().mockResolvedValue({
              fileId: 'media-qr',
              downloadUrl: 'https://files.test/qr',
              expiresAt: 'future',
            }),
        getDownloadUrl: jest
          .fn()
          .mockResolvedValue({ download: { url: 'https://files.test/qr' } }),
      });
      if (options.cached)
        context.channel.configuration.telegramShopping.paymentQrFileIds = {
          'media-qr': 'cached-qr',
        };
      if (options.photoFailure)
        context.api.sendPhoto.mockRejectedValueOnce(new Error('stale file id'));
      const show = Reflect.get(context.service, 'showPaymentScreen') as (
        channel: unknown,
        update: typeof paymentUpdate,
        orderId: string,
      ) => Promise<void>;
      await Reflect.apply(show, context.service, [
        context.channel,
        paymentUpdate,
        'order-1',
      ]);
      return context;
    }

    it('sends a selected payment image with the inline keyboard', async () => {
      const { api } = await showPayment({ image: true });
      expect(api.sendPhoto).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          photo: 'https://files.test/qr',
          replyMarkup: expect.anything(),
        }),
      );
    });

    it('sends text only when the method has no image', async () => {
      const { api } = await showPayment();
      expect(api.sendPhoto).not.toHaveBeenCalled();
      expect(api.sendMessage).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          text: expect.stringContaining('Exact total'),
        }),
      );
    });

    it('falls back to text when the signed-url photo fails', async () => {
      const { api } = await showPayment({ image: true, photoFailure: true });
      expect(api.sendMessage).toHaveBeenCalled();
    });

    it('sends text only for a file that fails payment-image validation', async () => {
      const { api } = await showPayment({ image: true, invalidImage: true });
      expect(api.sendPhoto).not.toHaveBeenCalled();
      expect(api.sendMessage).toHaveBeenCalled();
    });

    it('falls back to text and clears a stale cached Telegram file id', async () => {
      const { api, channel } = await showPayment({
        image: true,
        cached: true,
        photoFailure: true,
      });
      expect(api.sendMessage).toHaveBeenCalled();
      expect(
        channel.configuration.telegramShopping.paymentQrFileIds,
      ).not.toHaveProperty('media-qr');
    });

    it('keeps required payment facts within Telegram photo-caption limits', async () => {
      const { api } = await showPayment({ image: true, longDetails: true });
      const caption = api.sendPhoto.mock.calls[0][1].caption as string;
      expect(caption.length).toBeLessThanOrEqual(1024);
      expect(caption).toContain('ORD-1');
      expect(caption).toContain('Exact total');
      expect(caption).toContain('Payment deadline');
    });
  });
});
