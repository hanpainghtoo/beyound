import {
  InternalIngestionController,
  TEMPLATE_DISABLED_CALLBACK_TOAST,
} from './internal-ingestion.controller';

describe('InternalIngestionController telegram template gate', () => {
  const channelId = '22222222-2222-4222-8222-222222222222';
  const tenantId = '11111111-1111-4111-8111-111111111111';

  const telegramBody = (normalized: Record<string, unknown>) => ({
    eventId: 'event-1',
    provider: 'telegram',
    channelId,
    normalized: {
      externalConversationId: 'chat-1',
      externalMessageId: 'msg-1',
      senderId: 'sender-1',
      messageType: 'text',
      content: 'hello',
      metadata: {},
      eventType: 'message',
      ...normalized,
    },
  });

  const createController = (templateEnabled: boolean) => {
    const conversationService = {
      recordTelegramShoppingActivity: jest.fn().mockResolvedValue({}),
      ingestProviderMessage: jest
        .fn()
        .mockResolvedValue({ accepted: true, templateSkipped: false }),
    };
    const telegramCommerceService = {
      handle: jest.fn(),
    };
    const channelSettingsService = {
      isTelegramBotTemplateEnabled: jest
        .fn()
        .mockResolvedValue(templateEnabled),
    };
    const channelRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: channelId,
        tenantId,
        credentials: { botToken: 'bot-token' },
      }),
    };
    const telegramClient = {
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new InternalIngestionController(
      conversationService as never,
      telegramCommerceService as never,
      channelSettingsService as never,
      channelRepository as never,
      telegramClient as never,
    );
    return {
      controller,
      conversationService,
      telegramCommerceService,
      channelSettingsService,
      channelRepository,
      telegramClient,
    };
  };

  it('template on: runs the commerce chain unchanged (handled)', async () => {
    const { controller, conversationService, telegramCommerceService } =
      createController(true);
    telegramCommerceService.handle.mockResolvedValue({ handled: true });

    const body = telegramBody({});
    const result = await controller.ingestProviderEvent(body);

    expect(
      conversationService.recordTelegramShoppingActivity,
    ).toHaveBeenCalledTimes(1);
    expect(telegramCommerceService.handle).toHaveBeenCalledWith(body);
    expect(result).toEqual({ handled: true });
    expect(conversationService.ingestProviderMessage).not.toHaveBeenCalled();
  });

  it('template on: falls through to ingestion when commerce declines', async () => {
    const { controller, conversationService, telegramCommerceService } =
      createController(true);
    telegramCommerceService.handle.mockResolvedValue({ handled: false });

    const body = telegramBody({});
    await controller.ingestProviderEvent(body);

    expect(conversationService.ingestProviderMessage).toHaveBeenCalledWith(
      body,
    );
  });

  it('template off: skips commerce and ingests plain messages', async () => {
    const { controller, conversationService, telegramCommerceService } =
      createController(false);

    for (const normalized of [
      { content: 'hello' },
      { content: '/start' },
      { content: 'photo', messageType: 'photo' },
    ]) {
      const body = telegramBody(normalized);
      await controller.ingestProviderEvent(body);
      expect(conversationService.ingestProviderMessage).toHaveBeenCalledWith(
        body,
      );
    }
    expect(
      conversationService.recordTelegramShoppingActivity,
    ).not.toHaveBeenCalled();
    expect(telegramCommerceService.handle).not.toHaveBeenCalled();
  });

  it('template off: answers callbacks and does not ingest them as chat', async () => {
    const fixtures = createController(false);
    const { controller, conversationService, telegramCommerceService } =
      fixtures;

    const body = telegramBody({
      eventType: 'callback_query',
      callbackQueryId: 'query-1',
      callbackData: 'm:1',
      metadata: { telegramCallbackQueryId: 'query-1' },
    });
    const result = await controller.ingestProviderEvent(body);

    expect(
      conversationService.recordTelegramShoppingActivity,
    ).not.toHaveBeenCalled();
    expect(telegramCommerceService.handle).not.toHaveBeenCalled();
    expect(conversationService.ingestProviderMessage).not.toHaveBeenCalled();
    expect(fixtures.telegramClient.answerCallbackQuery).toHaveBeenCalledWith(
      'bot-token',
      'query-1',
      TEMPLATE_DISABLED_CALLBACK_TOAST,
    );
    expect(result).toMatchObject({
      accepted: true,
      callbackQuery: true,
      templateSkipped: true,
      channelId,
    });
  });

  it('template off: answers via metadata callback id with the unavailable toast', async () => {
    const fixtures = createController(false);
    const body = telegramBody({
      eventType: 'callback_query',
      metadata: { telegramCallbackQueryId: 'query-2' },
    });
    await fixtures.controller.ingestProviderEvent(body);

    expect(fixtures.telegramClient.answerCallbackQuery).toHaveBeenCalledWith(
      'bot-token',
      'query-2',
      TEMPLATE_DISABLED_CALLBACK_TOAST,
    );
  });

  it('unknown channel: preserves the existing commerce chain', async () => {
    const fixtures = createController(false);
    fixtures.channelRepository.findOne.mockResolvedValue(null);
    fixtures.telegramCommerceService.handle.mockResolvedValue({
      handled: true,
      ignored: true,
    });

    const body = telegramBody({});
    await fixtures.controller.ingestProviderEvent(body);

    expect(
      fixtures.conversationService.recordTelegramShoppingActivity,
    ).toHaveBeenCalledTimes(1);
    expect(fixtures.telegramCommerceService.handle).toHaveBeenCalledWith(body);
    expect(
      fixtures.channelSettingsService.isTelegramBotTemplateEnabled,
    ).not.toHaveBeenCalled();
  });

  it('non-telegram providers ingest directly without template checks', async () => {
    const fixtures = createController(false);
    const body = { ...telegramBody({}), provider: 'messenger' };

    await fixtures.controller.ingestProviderEvent(body);

    expect(fixtures.channelRepository.findOne).not.toHaveBeenCalled();
    expect(
      fixtures.channelSettingsService.isTelegramBotTemplateEnabled,
    ).not.toHaveBeenCalled();
    expect(
      fixtures.conversationService.recordTelegramShoppingActivity,
    ).not.toHaveBeenCalled();
    expect(fixtures.telegramCommerceService.handle).not.toHaveBeenCalled();
    expect(
      fixtures.conversationService.ingestProviderMessage,
    ).toHaveBeenCalledWith(body);
  });
});
