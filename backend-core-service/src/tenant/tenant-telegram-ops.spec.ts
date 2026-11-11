/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- Focused ops tests use a lightweight service double. */
import { TenantService } from './tenant.service';

describe('TenantService telegram ops (Plan 73, Phase 4b)', () => {
  const tenantId = 'tenant-1';
  const channelId = '9db7cb15-f4d4-4ac6-b87e-c21f84d32875';
  const webhookUrl = `https://hooks.example.com/webhooks/telegram/${channelId}`;
  const originalFetch = global.fetch;
  const originalKey = process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
  const originalIntegrationUrl = process.env.INTEGRATION_SERVICE_URL;
  const originalSigningKey = process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;
  const originalIssuer = process.env.INTERNAL_SERVICE_TOKEN_ISSUER;

  const telegramChannel = () => ({
    id: channelId,
    tenantId,
    channelType: 'telegram',
    channelName: 'Shop Bot',
    status: 'active',
    connectionStatus: 'connected',
    webhookRegistrationStatus: 'registered',
    webhookUrl,
    configuration: {
      telegramShopping: { shopEnabled: true, orderingEnabled: true },
    },
    credentials: { botToken: '123456:bot-token' },
  });

  function createService(overrides: Record<string, any> = {}) {
    const tenantChannelRepository = {
      findOne: jest.fn().mockResolvedValue(telegramChannel()),
      save: jest.fn((value: any) => Promise.resolve(value)),
      ...overrides.tenantChannelRepository,
    };
    const channelAdapterService = {
      validateConfig: jest.fn(() =>
        Promise.resolve({
          valid: true,
          errors: [],
          verifiedIdentity: { username: 'shopbot' },
        }),
      ),
      ...overrides.channelAdapterService,
    };
    const auditLogService = {
      logTenantUserAction: jest.fn(() => Promise.resolve(undefined)),
    };
    const botTemplates = {
      getTemplate: jest.fn((tenant: string, id: string) =>
        Promise.resolve({
          id,
          tenantId: tenant,
        }),
      ),
      setChannelTemplate: jest.fn(
        (
          tenant: string,
          channel: string,
          input: { templateId?: string | null; useBotTemplate: boolean },
        ): Promise<unknown> =>
          Promise.resolve({
            channelId: channel,
            templateId: input.templateId ?? null,
            useBotTemplate: input.useBotTemplate,
          }),
      ),
      ...overrides.botTemplates,
    };
    const telegram = {
      setMyCommands: jest.fn(() => Promise.resolve(undefined)),
      ...overrides.telegram,
    };
    const service = Object.create(TenantService.prototype) as TenantService;
    Object.assign(service, {
      tenantChannelRepository,
      channelAdapterService,
      auditLogService,
      botTemplates,
      telegram,
    });
    return {
      service,
      tenantChannelRepository,
      channelAdapterService,
      auditLogService,
      botTemplates,
      telegram,
    };
  }

  beforeEach(() => {
    process.env.WEBHOOK_PUBLIC_BASE_URL = 'https://hooks.example.com';
    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY =
      'test-encryption-key-32-chars';
    process.env.INTEGRATION_SERVICE_URL = 'http://integration.test';
    process.env.INTERNAL_SERVICE_TOKEN_ISSUER = 'zayos-local-internal-services';
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY =
      'local-dev-internal-service-token-signing-key-32-chars';
    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
            ok: true,
            // camelCase on purpose: the integration service normalises
            // Telegram's snake_case into TelegramWebhookInfo before returning
            // it. Fixtures modelled the raw payload, which is how a
            // permanently-red "Button clicks" row shipped unnoticed.
            webhookInfo: {
              url: webhookUrl,
              allowedUpdates: ['message', 'callback_query'],
              pendingUpdateCount: 0,
              lastErrorMessage: null,
            },
          }),
      }),
    ) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined)
      delete process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = originalKey;
    if (originalIntegrationUrl === undefined)
      delete process.env.INTEGRATION_SERVICE_URL;
    else process.env.INTEGRATION_SERVICE_URL = originalIntegrationUrl;
    if (originalSigningKey === undefined)
      delete process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;
    else process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = originalSigningKey;
    if (originalIssuer === undefined)
      delete process.env.INTERNAL_SERVICE_TOKEN_ISSUER;
    else process.env.INTERNAL_SERVICE_TOKEN_ISSUER = originalIssuer;
  });

  it('reregisters the webhook with message + callback_query', async () => {
    const { service, tenantChannelRepository, auditLogService } =
      createService();
    const result: any = await service.reregisterTelegramWebhook(
      tenantId,
      channelId,
      'actor-1',
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/providers/telegram/webhook/register'),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(
      ((global.fetch as jest.Mock).mock.calls[0] as any[])[1].body,
    );
    expect(body.allowedUpdates).toEqual(['message', 'callback_query']);
    expect(body.webhookUrl).toBe(webhookUrl);
    expect(tenantChannelRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookRegistrationStatus: 'registered',
        connectionStatus: 'connected',
      }),
    );
    expect(auditLogService.logTenantUserAction).toHaveBeenCalledWith(
      tenantId,
      'actor-1',
      expect.objectContaining({ action: 'channel_webhook_reregistered' }),
      undefined,
    );
    expect(result.webhookRegistrationStatus).toBe('registered');
  });

  it('refuses reregister for non-telegram and disabled channels', async () => {
    const messenger = createService({
      tenantChannelRepository: {
        findOne: jest.fn().mockResolvedValue({
          ...telegramChannel(),
          channelType: 'messenger',
        }),
        save: jest.fn((value: any) => Promise.resolve(value)),
      },
    });
    await expect(
      messenger.service.reregisterTelegramWebhook(tenantId, channelId),
    ).rejects.toThrow('only available for Telegram channels');

    const disabled = createService({
      tenantChannelRepository: {
        findOne: jest.fn().mockResolvedValue({
          ...telegramChannel(),
          status: 'disabled',
        }),
        save: jest.fn((value: any) => Promise.resolve(value)),
      },
    });
    await expect(
      disabled.service.reregisterTelegramWebhook(tenantId, channelId),
    ).rejects.toThrow('reactivated before re-registering');
  });

  it('reports healthy token and webhook state', async () => {
    const { service } = createService();
    const health: any = await service.telegramChannelHealth(
      tenantId,
      channelId,
    );
    expect(health).toMatchObject({
      channelId,
      tokenOk: true,
      tokenUsername: 'shopbot',
      webhookUrl,
      webhook: {
        url: webhookUrl,
        urlMatches: true,
        allowedUpdates: ['message', 'callback_query'],
        hasCallbackQuery: true,
        pendingUpdateCount: 0,
        lastErrorMessage: null,
      },
    });
    expect(health.checkedAt).toEqual(expect.any(String));
    expect(health.webhookError).toBeNull();
  });

  it('also accepts a raw snake_case webhook info payload', async () => {
    const { service } = createService();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          ok: true,
          webhookInfo: {
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query'],
            pending_update_count: 7,
          },
        }),
    });
    const health: any = await service.telegramChannelHealth(
      tenantId,
      channelId,
    );
    expect(health.webhook).toMatchObject({
      allowedUpdates: ['message', 'callback_query'],
      hasCallbackQuery: true,
      pendingUpdateCount: 7,
    });
  });

  it('leaves the button-click state unknown when Telegram omits it', async () => {
    const { service } = createService();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          ok: true,
          webhookInfo: { url: webhookUrl },
        }),
    });
    const health: any = await service.telegramChannelHealth(
      tenantId,
      channelId,
    );
    // Unknown must not masquerade as a verified failure.
    expect(health.webhook.allowedUpdates).toBeNull();
    expect(health.webhook.hasCallbackQuery).toBe(false);
  });

  it('flags a webhook missing callback_query', async () => {
    const { service } = createService();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          ok: true,
          webhookInfo: {
            url: 'https://old.example.com/hook',
            allowed_updates: ['message'],
            pending_update_count: 3,
            last_error_message: 'Wrong response from the webhook: 502',
          },
        }),
    });
    const health: any = await service.telegramChannelHealth(
      tenantId,
      channelId,
    );
    expect(health.webhook).toMatchObject({
      urlMatches: false,
      hasCallbackQuery: false,
      pendingUpdateCount: 3,
      lastErrorMessage: 'Wrong response from the webhook: 502',
    });
  });

  it('degrades gracefully when providers are unreachable', async () => {
    const { service } = createService({
      channelAdapterService: {
        validateConfig: jest.fn(() => Promise.reject(new Error('timeout'))),
      },
    });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('down'));
    const health: any = await service.telegramChannelHealth(
      tenantId,
      channelId,
    );
    expect(health.tokenOk).toBe(false);
    expect(health.webhook).toBeNull();
    expect(health.webhookError).toBe('webhook_info_unavailable');
  });

  it('surfaces the provider error code when info is not ok', async () => {
    const { service } = createService();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          ok: false,
          status: 'rate_limited',
          providerError: { code: 'rate_limited' },
        }),
    });
    const health: any = await service.telegramChannelHealth(
      tenantId,
      channelId,
    );
    expect(health.webhook).toBeNull();
    expect(health.webhookError).toBe('rate_limited');
  });

  it('applies template: validates, re-registers, then attaches', async () => {
    const { service, botTemplates } = createService();
    const result: any = await service.applyChannelTemplate(
      tenantId,
      channelId,
      { templateId: 'tpl-9', useBotTemplate: true },
      'actor-1',
    );
    expect(botTemplates.getTemplate).toHaveBeenCalledWith(tenantId, 'tpl-9');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/providers/telegram/webhook/register'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(botTemplates.setChannelTemplate).toHaveBeenCalledWith(
      tenantId,
      channelId,
      { templateId: 'tpl-9', useBotTemplate: true },
      'actor-1',
    );
    expect(
      (botTemplates.getTemplate as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan((global.fetch as jest.Mock).mock.invocationCallOrder[0]);
    expect(
      (global.fetch as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan(
      (botTemplates.setChannelTemplate as jest.Mock).mock
        .invocationCallOrder[0],
    );
    expect(result.selection).toMatchObject({
      channelId,
      templateId: 'tpl-9',
      useBotTemplate: true,
    });
    expect(result.webhook).toMatchObject({ webhookUrl });
  });

  it('registers the bot command list when a template is confirmed', async () => {
    const { service, telegram } = createService();
    const result: any = await service.applyChannelTemplate(
      tenantId,
      channelId,
      { templateId: 'tpl-9', useBotTemplate: true },
      'actor-1',
    );
    expect(telegram.setMyCommands).toHaveBeenCalledWith('123456:bot-token', [
      { command: 'start', description: 'Start shopping' },
      { command: 'menu', description: 'Open menu' },
    ]);
    expect(result.commandsRegistered).toBe(true);
  });

  it('attaches the template even when command registration fails', async () => {
    const { service, botTemplates, telegram } = createService({
      telegram: {
        setMyCommands: jest.fn(() =>
          Promise.reject(new Error('command_registration_failed')),
        ),
      },
    });
    const result: any = await service.applyChannelTemplate(
      tenantId,
      channelId,
      { templateId: 'tpl-9', useBotTemplate: true },
      'actor-1',
    );
    expect(telegram.setMyCommands).toHaveBeenCalled();
    expect(botTemplates.setChannelTemplate).toHaveBeenCalled();
    expect(result.selection).toMatchObject({ templateId: 'tpl-9' });
    expect(result.commandsRegistered).toBe(false);
  });

  it('reports commands unregistered when the bot token is missing', async () => {
    const { service, telegram } = createService({
      tenantChannelRepository: {
        findOne: jest.fn().mockResolvedValue({
          ...telegramChannel(),
          credentials: {},
        }),
      },
    });
    const result: any = await service.applyChannelTemplate(
      tenantId,
      channelId,
      { templateId: 'tpl-9', useBotTemplate: true },
    );
    expect(telegram.setMyCommands).not.toHaveBeenCalled();
    expect(result.commandsRegistered).toBe(false);
  });

  it('never registers commands when detaching', async () => {
    const { service, telegram } = createService();
    const result: any = await service.applyChannelTemplate(
      tenantId,
      channelId,
      { templateId: null, useBotTemplate: false },
    );
    expect(telegram.setMyCommands).not.toHaveBeenCalled();
    expect(result.commandsRegistered).toBe(false);
  });

  it('refuses to re-register for an unknown template', async () => {
    const { service, botTemplates } = createService({
      botTemplates: {
        getTemplate: jest.fn(() =>
          Promise.reject(new Error('Bot template not found')),
        ),
      },
    });
    await expect(
      service.applyChannelTemplate(tenantId, channelId, {
        templateId: 'missing',
        useBotTemplate: true,
      }),
    ).rejects.toThrow('Bot template not found');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(botTemplates.setChannelTemplate).not.toHaveBeenCalled();
  });

  it('skips the webhook when detaching', async () => {
    const { service, botTemplates } = createService();
    const result: any = await service.applyChannelTemplate(
      tenantId,
      channelId,
      { templateId: null, useBotTemplate: false },
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(botTemplates.setChannelTemplate).toHaveBeenCalled();
    expect(result.webhook).toBeNull();
  });
});
