import {
  BOT_TEMPLATE_CACHE_TTL_MS,
  BotTemplateService,
} from './bot-template.service';
import {
  DEFAULT_BOT_TEMPLATE_FIELDS,
  DEFAULT_BOT_TEMPLATE_NAME,
} from './bot-template.constants';
import { TenantBotTemplate } from './entities/tenant-bot-template.entity';
import { TenantBotTemplateField } from './entities/tenant-bot-template-field.entity';

describe('BotTemplateService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const otherTenant = '22222222-2222-4222-8222-222222222222';

  const createService = () => {
    const txTemplates = {
      create: jest.fn((value: unknown) => ({
        ...(value as object),
        id: 'tpl-1',
      })),
      save: jest.fn((value: unknown) =>
        Promise.resolve(value as TenantBotTemplate),
      ),
    };
    const txFields = {
      create: jest.fn((value: unknown) => value),
      save: jest.fn((rows: unknown) =>
        Promise.resolve(rows as TenantBotTemplateField[]),
      ),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const stubManager = {
      getRepository: jest.fn((target: { name: string }) =>
        target.name === 'TenantBotTemplate' ? txTemplates : txFields,
      ),
    };
    const templates = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: unknown) =>
        Promise.resolve(value as TenantBotTemplate),
      ),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: {
        transaction: jest.fn((work: (manager: unknown) => unknown) =>
          work(stubManager),
        ),
      },
    };
    const fields = {};
    const mappings = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const channels = {
      findOne: jest.fn(),
      save: jest.fn((row: unknown): Promise<unknown> => Promise.resolve(row)),
      manager: {
        transaction: jest.fn((work: (manager: unknown) => unknown) =>
          work(stubManager),
        ),
      },
    };
    const audit = {
      logTenantUserAction: jest.fn().mockResolvedValue(undefined),
    };
    const service = new BotTemplateService(
      templates as never,
      fields as never,
      mappings as never,
      channels as never,
      audit as never,
    );
    return {
      service,
      templates,
      mappings,
      channels,
      txTemplates,
      txFields,
      audit,
    };
  };

  const fieldInputs = () =>
    DEFAULT_BOT_TEMPLATE_FIELDS.map((field) => ({ ...field }));

  it('lists tenant templates with fields ordered', async () => {
    const { service, templates } = createService();
    templates.find.mockResolvedValue([]);
    await service.listTemplates(tenantId);
    expect(templates.find).toHaveBeenCalledWith({
      where: { tenantId },
      relations: { fields: true },
      order: { createdAt: 'ASC', fields: { sort: 'ASC' } },
    });
  });

  it('scopes reads to the tenant', async () => {
    const { service, templates } = createService();
    templates.findOne.mockResolvedValue(null);
    await expect(service.getTemplate(otherTenant, 'tpl-1')).rejects.toThrow(
      'Bot template not found',
    );
    expect(templates.findOne).toHaveBeenCalledWith({
      where: { id: 'tpl-1', tenantId: otherTenant },
      relations: { fields: true },
    });
  });

  it('returns null when no default exists', async () => {
    const { service, templates } = createService();
    templates.findOne.mockResolvedValue(null);
    await expect(service.getDefaultTemplate(tenantId)).resolves.toBeNull();
  });

  it('creates a template with dense sort order', async () => {
    const { service, txFields, audit } = createService();
    const created = await service.createTemplate(
      tenantId,
      { name: '  Promo  ', fields: fieldInputs() },
      'actor-1',
    );
    expect(created.name).toBe('Promo');
    expect(created.isDefault).toBe(false);
    expect(audit.logTenantUserAction).toHaveBeenCalledWith(
      tenantId,
      'actor-1',
      expect.objectContaining({
        action: 'bot_template_created',
        resourceType: 'bot_template',
      }),
    );
    const rows = txFields.save.mock.calls[0][0] as Array<{
      sort: number;
      key: string;
    }>;
    expect(rows.map((row) => [row.sort, row.key])).toEqual([
      [0, 'greeting'],
      [1, 'products'],
      [2, 'shop_info'],
      [3, 'orders'],
      [4, 'agent'],
    ]);
  });

  it.each([
    ['unknown key', [{ key: 'nope', layout: 'full' }]],
    [
      'duplicate key',
      [
        { key: 'agent', layout: 'full' },
        { key: 'agent', layout: 'half' },
      ],
    ],
    ['bad layout', [{ key: 'agent', layout: 'quarter' }]],
    ['bad condition', [{ key: 'orders', layout: 'half', condition: 'always' }]],
    ['no visible button', [{ key: 'greeting', layout: 'full', visible: true }]],
    ['empty fields', []],
  ])('rejects %s', async (_label, fields) => {
    const { service } = createService();
    await expect(
      service.createTemplate(tenantId, {
        name: 'Bad',
        fields: fields as never,
      }),
    ).rejects.toThrow();
  });

  it('rejects blank names', async () => {
    const { service } = createService();
    await expect(
      service.createTemplate(tenantId, { name: '   ', fields: fieldInputs() }),
    ).rejects.toThrow('Template name must be between 1 and 100 characters');
  });

  it('replaces fields on update', async () => {
    const { service, templates, txFields } = createService();
    templates.findOne.mockResolvedValue({ id: 'tpl-1', tenantId });
    const updated = await service.updateTemplate(
      tenantId,
      'tpl-1',
      { name: 'New', fields: [{ key: 'agent', layout: 'full' }] },
      null,
    );
    expect(updated.name).toBe('New');
    expect(txFields.delete).toHaveBeenCalledWith({ templateId: 'tpl-1' });
    const rows = txFields.save.mock.calls[0][0] as Array<{ sort: number }>;
    expect(rows.map((row) => row.sort)).toEqual([0]);
  });

  it('refuses to delete the default template', async () => {
    const { service, templates } = createService();
    templates.findOne.mockResolvedValue({
      id: 'tpl-1',
      tenantId,
      isDefault: true,
    });
    await expect(service.deleteTemplate(tenantId, 'tpl-1')).rejects.toThrow(
      'The default template cannot be deleted',
    );
  });

  it('refuses to delete an integrated template', async () => {
    const { service, templates, mappings } = createService();
    templates.findOne.mockResolvedValue({
      id: 'tpl-1',
      tenantId,
      isDefault: false,
    });
    mappings.count.mockResolvedValue(2);
    await expect(service.deleteTemplate(tenantId, 'tpl-1')).rejects.toThrow(
      'integrated into a channel',
    );
  });

  it('deletes a plain template', async () => {
    const { service, templates } = createService();
    templates.findOne.mockResolvedValue({
      id: 'tpl-1',
      tenantId,
      isDefault: false,
    });
    await service.deleteTemplate(tenantId, 'tpl-1');
    expect(templates.delete).toHaveBeenCalledWith({
      id: 'tpl-1',
      tenantId,
    });
  });

  it('ensureDefaultTemplate returns the existing default', async () => {
    const { service, templates } = createService();
    const existing = { id: 'tpl-9', tenantId, isDefault: true };
    templates.findOne.mockResolvedValue(existing);
    await expect(service.ensureDefaultTemplate(tenantId)).resolves.toBe(
      existing,
    );
    expect(templates.manager.transaction).not.toHaveBeenCalled();
  });

  it('ensureDefaultTemplate creates the Phase-0 default set', async () => {
    const { service, templates, txFields } = createService();
    templates.findOne.mockResolvedValue(null);
    const created = await service.ensureDefaultTemplate(tenantId, 'admin-1');
    expect(created.name).toBe(DEFAULT_BOT_TEMPLATE_NAME);
    expect(created.isDefault).toBe(true);
    const rows = txFields.save.mock.calls[0][0] as Array<{
      key: string;
      layout: string;
      condition: string | null;
    }>;
    expect(rows).toHaveLength(DEFAULT_BOT_TEMPLATE_FIELDS.length);
    expect(rows.find((row) => row.key === 'orders')).toMatchObject({
      layout: 'half',
      condition: 'requires_ordering',
    });
  });

  describe('channel integration', () => {
    const channelId = '33333333-3333-4333-8333-333333333333';
    const templateId = '44444444-4444-4444-8444-444444444444';
    const telegramChannel = () => ({
      id: channelId,
      tenantId,
      channelType: 'telegram',
      configuration: {
        webhookUrl: 'https://hooks.example.com/webhooks/telegram/x',
        telegramShopping: { shopEnabled: true, orderingEnabled: true },
      },
    });

    it('reads selection and flag', async () => {
      const { service, channels, mappings } = createService();
      channels.findOne.mockResolvedValue(telegramChannel());
      mappings.findOne.mockResolvedValue({
        templateId,
        channelId,
        tenantId,
      });
      await expect(
        service.getChannelTemplate(tenantId, channelId),
      ).resolves.toEqual({ channelId, templateId, useBotTemplate: false });
    });

    it('attaches a template and turns the flag on', async () => {
      const { service, channels, templates, txFields, audit } = createService();
      channels.findOne.mockResolvedValue(telegramChannel());
      templates.findOne.mockResolvedValue({ id: templateId, tenantId });
      const result = await service.setChannelTemplate(tenantId, channelId, {
        templateId,
        useBotTemplate: true,
      });
      expect(result).toEqual({ channelId, templateId, useBotTemplate: true });
      expect(audit.logTenantUserAction).toHaveBeenCalledWith(
        tenantId,
        null,
        expect.objectContaining({
          action: 'bot_template_channel_updated',
          resourceType: 'tenant_channel',
          resourceId: channelId,
        }),
      );
      expect(txFields.save).toHaveBeenCalledWith(
        expect.objectContaining({ templateId, channelId, tenantId }),
      );
      const savedChannel = txFields.save.mock.calls[1][0] as {
        configuration: { telegramShopping: Record<string, unknown> };
      };
      expect(savedChannel.configuration.telegramShopping).toEqual({
        shopEnabled: true,
        orderingEnabled: true,
        useBotTemplate: true,
      });
    });

    it('turns the whole sale flow on when confirming a template', async () => {
      const { service, channels, templates, txFields } = createService();
      channels.findOne.mockResolvedValue({
        id: channelId,
        tenantId,
        channelType: 'telegram',
        configuration: {
          telegramShopping: { shopEnabled: false, orderingEnabled: false },
        },
      });
      templates.findOne.mockResolvedValue({ id: templateId, tenantId });
      const result = await service.setChannelTemplate(tenantId, channelId, {
        templateId,
        useBotTemplate: true,
      });
      expect(result).toEqual({
        channelId,
        templateId,
        useBotTemplate: true,
      });
      const savedChannel = txFields.save.mock.calls[1][0] as {
        configuration: { telegramShopping: Record<string, unknown> };
      };
      expect(savedChannel.configuration.telegramShopping).toEqual({
        shopEnabled: true,
        orderingEnabled: true,
        useBotTemplate: true,
      });
    });

    it('rejects enabling without a selection', async () => {
      const { service, channels } = createService();
      channels.findOne.mockResolvedValue(telegramChannel());
      await expect(
        service.setChannelTemplate(tenantId, channelId, {
          templateId: null,
          useBotTemplate: true,
        }),
      ).rejects.toThrow('Select a template before turning on');
    });

    it('rejects a template from another tenant', async () => {
      const { service, channels, templates } = createService();
      channels.findOne.mockResolvedValue(telegramChannel());
      templates.findOne.mockResolvedValue(null);
      await expect(
        service.setChannelTemplate(tenantId, channelId, {
          templateId,
          useBotTemplate: false,
        }),
      ).rejects.toThrow('Bot template not found');
      expect(templates.findOne).toHaveBeenCalledWith({
        where: { id: templateId, tenantId },
        relations: { fields: true },
      });
    });

    it('rejects non-telegram channels', async () => {
      const { service, channels } = createService();
      channels.findOne.mockResolvedValue({
        ...telegramChannel(),
        channelType: 'messenger',
      });
      await expect(
        service.getChannelTemplate(tenantId, channelId),
      ).rejects.toThrow('Telegram channels only');
    });

    it('detaches on explicit null and clears the flag', async () => {
      const { service, channels, mappings, txFields } = createService();
      channels.findOne.mockResolvedValue(telegramChannel());
      mappings.findOne.mockResolvedValue({
        templateId,
        channelId,
        tenantId,
      });
      const result = await service.setChannelTemplate(tenantId, channelId, {
        templateId: null,
        useBotTemplate: false,
      });
      expect(result).toEqual({
        channelId,
        templateId: null,
        useBotTemplate: false,
      });
      expect(txFields.delete).toHaveBeenCalledWith({ channelId, tenantId });
      const savedChannel = txFields.save.mock.calls[0][0] as {
        configuration: { telegramShopping: Record<string, unknown> };
      };
      expect(savedChannel.configuration.telegramShopping).toMatchObject({
        useBotTemplate: false,
      });
    });

    // Plan 79: detaching stops the sale flow for this channel only.
    describe('detaching stops the sale flow', () => {
      const sellingChannel = () => ({
        id: channelId,
        tenantId,
        channelType: 'telegram',
        credentials: { botToken: '123:token' },
        configuration: {
          telegramShopping: { shopEnabled: true, orderingEnabled: true },
        },
      });

      const withTelegram = (service: BotTemplateService) => {
        const telegram = {
          setMyCommands: jest.fn().mockResolvedValue(undefined),
          deleteMyCommands: jest.fn().mockResolvedValue(undefined),
        };
        (service as unknown as { telegram: typeof telegram }).telegram =
          telegram;
        return telegram;
      };

      it('turns the sale flow off and removes the bot commands', async () => {
        const { service, channels, mappings, txFields } = createService();
        channels.findOne.mockResolvedValue(sellingChannel());
        mappings.findOne.mockResolvedValue({
          templateId,
          channelId,
          tenantId,
        });
        const telegram = withTelegram(service);

        await service.setChannelTemplate(tenantId, channelId, {
          useBotTemplate: false,
        });

        const savedChannel = txFields.save.mock.calls[0][0] as {
          configuration: { telegramShopping: Record<string, unknown> };
        };
        expect(savedChannel.configuration.telegramShopping).toEqual({
          shopEnabled: false,
          orderingEnabled: false,
          useBotTemplate: false,
        });
        expect(telegram.deleteMyCommands).toHaveBeenCalledWith('123:token');
        expect(telegram.setMyCommands).not.toHaveBeenCalled();
      });

      it('drops the mapping row while detached', async () => {
        const { service, channels, mappings, txFields } = createService();
        channels.findOne.mockResolvedValue(sellingChannel());
        mappings.findOne.mockResolvedValue({
          templateId,
          channelId,
          tenantId,
        });
        withTelegram(service);

        await service.setChannelTemplate(tenantId, channelId, {
          useBotTemplate: false,
        });

        expect(txFields.delete).toHaveBeenCalledWith({ channelId, tenantId });
        // Only the channel is saved — no mapping row is re-created.
        expect(txFields.save).toHaveBeenCalledTimes(1);
        expect(txFields.save).toHaveBeenCalledWith(
          expect.objectContaining({ id: channelId }),
        );
      });

      it('restores flags, mapping and commands when switched back on', async () => {
        const { service, channels, templates, txFields } = createService();
        channels.findOne.mockResolvedValue({
          ...sellingChannel(),
          configuration: {
            telegramShopping: {
              shopEnabled: false,
              orderingEnabled: false,
            },
          },
        });
        templates.findOne.mockResolvedValue({ id: templateId, tenantId });
        const telegram = withTelegram(service);

        await service.setChannelTemplate(tenantId, channelId, {
          templateId,
          useBotTemplate: true,
        });

        const savedChannel = txFields.save.mock.calls[1][0] as {
          configuration: { telegramShopping: Record<string, unknown> };
        };
        expect(savedChannel.configuration.telegramShopping).toEqual({
          shopEnabled: true,
          orderingEnabled: true,
          useBotTemplate: true,
        });
        expect(txFields.save).toHaveBeenCalledWith(
          expect.objectContaining({ templateId, channelId, tenantId }),
        );
        expect(telegram.setMyCommands).toHaveBeenCalledWith('123:token', [
          { command: 'start', description: 'Start shopping' },
          { command: 'menu', description: 'Open menu' },
        ]);
        expect(telegram.deleteMyCommands).not.toHaveBeenCalled();
      });

      it('still commits the flags when Telegram rejects the command update', async () => {
        const { service, channels, mappings, txFields } = createService();
        channels.findOne.mockResolvedValue(sellingChannel());
        mappings.findOne.mockResolvedValue({
          templateId,
          channelId,
          tenantId,
        });
        const telegram = withTelegram(service);
        telegram.deleteMyCommands.mockRejectedValue(
          new Error('telegram unreachable'),
        );

        await expect(
          service.setChannelTemplate(tenantId, channelId, {
            useBotTemplate: false,
          }),
        ).resolves.toMatchObject({ useBotTemplate: false });
        expect(txFields.save).toHaveBeenCalledTimes(1);
      });
    });

    it('keeps the selection when only flipping the flag', async () => {
      const { service, channels, mappings } = createService();
      channels.findOne.mockResolvedValue(telegramChannel());
      mappings.findOne.mockResolvedValue({
        templateId,
        channelId,
        tenantId,
      });
      const result = await service.setChannelTemplate(tenantId, channelId, {
        useBotTemplate: false,
      });
      expect(result).toEqual({
        channelId,
        templateId,
        useBotTemplate: false,
      });
    });
  });

  describe('resolveChannelTemplate', () => {
    const channelId = '55555555-5555-4555-8555-555555555555';
    const templateId = '66666666-6666-4666-8666-666666666666';
    const templateRow = (fields: unknown[]) => ({
      id: templateId,
      tenantId,
      isDefault: true,
      fields,
    });
    const flaggedChannel = (useBotTemplate: boolean) => ({
      id: channelId,
      tenantId,
      channelType: 'telegram',
      configuration: {
        telegramShopping: { shopEnabled: true, useBotTemplate },
      },
    });

    it('caches the resolved template per channel', async () => {
      const { service, channels, mappings, templates } = createService();
      channels.findOne.mockResolvedValue(flaggedChannel(true));
      mappings.findOne.mockResolvedValue({ templateId, channelId, tenantId });
      templates.findOne.mockResolvedValue(
        templateRow([
          {
            key: 'agent',
            sort: 0,
            layout: 'full',
            visible: true,
            condition: null,
            value: {},
          },
        ]),
      );
      const first = await service.resolveChannelTemplate(tenantId, channelId);
      const second = await service.resolveChannelTemplate(tenantId, channelId);
      expect(first?.template.id).toBe(templateId);
      expect(second).toBe(first);
      expect(channels.findOne).toHaveBeenCalledTimes(1);
    });

    it('falls back to the tenant default when the flag is off', async () => {
      const { service, channels, mappings, templates } = createService();
      channels.findOne.mockResolvedValue(flaggedChannel(false));
      mappings.findOne.mockResolvedValue(null);
      const defaults = templateRow([
        {
          key: 'agent',
          sort: 0,
          layout: 'full',
          visible: true,
          condition: null,
          value: {},
        },
      ]);
      templates.findOne.mockResolvedValue(defaults);
      const resolved = await service.resolveChannelTemplate(
        tenantId,
        channelId,
      );
      expect(resolved?.template).toBe(defaults);
      expect(templates.manager.transaction).not.toHaveBeenCalled();
    });

    it('creates the default on first miss', async () => {
      const { service, channels, mappings, templates } = createService();
      channels.findOne.mockResolvedValue(flaggedChannel(false));
      mappings.findOne.mockResolvedValue(null);
      templates.findOne.mockResolvedValue(null);
      const resolved = await service.resolveChannelTemplate(
        tenantId,
        channelId,
      );
      expect(templates.manager.transaction).toHaveBeenCalledTimes(1);
      expect(resolved?.template).toMatchObject({ isDefault: true });
    });

    it('refetches after the TTL expires', async () => {
      const { service, channels, mappings, templates } = createService();
      channels.findOne.mockResolvedValue(flaggedChannel(true));
      mappings.findOne.mockResolvedValue({ templateId, channelId, tenantId });
      templates.findOne.mockResolvedValue(templateRow([]));
      const now = jest.spyOn(Date, 'now');
      try {
        now.mockReturnValue(1_000);
        await service.resolveChannelTemplate(tenantId, channelId);
        expect(channels.findOne).toHaveBeenCalledTimes(1);
        now.mockReturnValue(1_000 + BOT_TEMPLATE_CACHE_TTL_MS + 1);
        await service.resolveChannelTemplate(tenantId, channelId);
        expect(channels.findOne).toHaveBeenCalledTimes(2);
      } finally {
        now.mockRestore();
      }
    });

    it('invalidates the channel entry on setChannelTemplate', async () => {
      const { service, channels, mappings, templates } = createService();
      channels.findOne.mockResolvedValue(flaggedChannel(true));
      mappings.findOne.mockResolvedValue({ templateId, channelId, tenantId });
      templates.findOne.mockResolvedValue(templateRow([]));
      await service.resolveChannelTemplate(tenantId, channelId);
      expect(channels.findOne).toHaveBeenCalledTimes(1);
      await service.setChannelTemplate(tenantId, channelId, {
        templateId,
        useBotTemplate: false,
      });
      // setChannelTemplate re-reads the channel itself (+1); the second
      // resolve must miss the cache (+1) instead of serving stale data.
      await service.resolveChannelTemplate(tenantId, channelId);
      expect(channels.findOne).toHaveBeenCalledTimes(3);
    });
  });

  describe('setShopSettings', () => {
    const channelId = '77777777-7777-4777-8777-777777777777';
    const shoppableChannel = () => ({
      id: channelId,
      tenantId,
      channelType: 'telegram',
      configuration: {
        webhookUrl: 'https://hooks.example.com/webhooks/telegram/x',
        telegramShopping: {
          shopEnabled: false,
          orderingEnabled: false,
          useBotTemplate: true,
          photoFileIds: { 'media-1': 'file-1' },
        },
      },
    });

    it('merges flags while preserving the rest of telegramShopping', async () => {
      const { service, channels, mappings, audit } = createService();
      const channel = shoppableChannel();
      channels.findOne.mockResolvedValue(channel);
      mappings.findOne.mockResolvedValue(null);
      const result = await service.setShopSettings(
        tenantId,
        channelId,
        { shopEnabled: true, orderingEnabled: true },
        'actor-1',
      );
      const saved = channels.save.mock.calls[0][0] as {
        configuration: { telegramShopping: Record<string, unknown> };
      };
      expect(saved.configuration.telegramShopping).toEqual({
        shopEnabled: true,
        orderingEnabled: true,
        useBotTemplate: true,
        photoFileIds: { 'media-1': 'file-1' },
      });
      expect(result).toEqual({
        channelId,
        templateId: null,
        useBotTemplate: true,
      });
      expect(audit.logTenantUserAction).toHaveBeenCalledWith(
        tenantId,
        'actor-1',
        expect.objectContaining({ action: 'bot_shop_settings_updated' }),
      );
    });

    it('rejects empty and non-boolean input', async () => {
      const { service, channels } = createService();
      channels.findOne.mockResolvedValue(shoppableChannel());
      await expect(
        service.setShopSettings(tenantId, channelId, {}),
      ).rejects.toThrow('Provide shopEnabled and/or orderingEnabled');
      await expect(
        service.setShopSettings(tenantId, channelId, {
          shopEnabled: 'yes' as never,
        }),
      ).rejects.toThrow('shopEnabled must be a boolean');
    });

    it('rejects non-telegram channels', async () => {
      const { service, channels } = createService();
      channels.findOne.mockResolvedValue({
        ...shoppableChannel(),
        channelType: 'messenger',
      });
      await expect(
        service.setShopSettings(tenantId, channelId, { shopEnabled: true }),
      ).rejects.toThrow('Telegram channels only');
    });
  });
});
