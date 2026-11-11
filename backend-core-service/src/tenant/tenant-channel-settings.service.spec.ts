import {
  CHANNEL_SETTINGS_CACHE_TTL_MS,
  TenantChannelSettingsService,
} from './tenant-channel-settings.service';
import { QueryFailedError } from 'typeorm';

describe('TenantChannelSettingsService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  const createService = () => {
    const repository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const botTemplates = { ensureDefaultTemplate: jest.fn() };
    const channels = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
    };
    const mappings = { find: jest.fn().mockResolvedValue([]) };
    const service = new TenantChannelSettingsService(
      repository as never,
      botTemplates as never,
      channels as never,
      mappings as never,
    );
    return { service, repository, botTemplates, channels, mappings };
  };

  it('reads a missing row as template-off (null / false)', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(null);

    await expect(service.getTelegramBotTemplate(tenantId)).resolves.toBeNull();
    await expect(service.isTelegramBotTemplateEnabled(tenantId)).resolves.toBe(
      false,
    );
  });

  it('reads an enabled row as commerce', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue({
      tenantId,
      telegramBotTemplate: 'commerce',
    });

    await expect(service.getTelegramBotTemplate(tenantId)).resolves.toBe(
      'commerce',
    );
    await expect(service.isTelegramBotTemplateEnabled(tenantId)).resolves.toBe(
      true,
    );
  });

  it('treats unexpected stored values as off', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue({
      tenantId,
      telegramBotTemplate: 'booking',
    });

    await expect(service.getTelegramBotTemplate(tenantId)).resolves.toBeNull();
  });

  it('updates an existing row and reports the previous value', async () => {
    const { service, repository } = createService();
    const existing = { tenantId, telegramBotTemplate: null, updatedBy: null };
    repository.findOne.mockResolvedValue(existing);

    const result = await service.updateTelegramBotTemplate(
      tenantId,
      'commerce',
      'admin-id',
    );

    expect(result).toEqual({
      tenantId,
      telegramBotTemplate: 'commerce',
      previousTemplate: null,
      cascade: {
        channelsVisited: 0,
        commandsUpdated: 0,
        flagsUpdated: 0,
        failures: [],
      },
    });
    expect(repository.update).toHaveBeenCalledWith(
      { tenantId },
      { telegramBotTemplate: 'commerce', updatedBy: 'admin-id' },
    );
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('inserts a row when the targeted update affects no rows', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(null);
    repository.update.mockResolvedValue({ affected: 0 });

    const result = await service.updateTelegramBotTemplate(
      tenantId,
      null,
      null,
    );
    expect(result.telegramBotTemplate).toBeNull();
    expect(result.previousTemplate).toBeNull();
    expect(repository.update).toHaveBeenCalledWith(
      { tenantId },
      { telegramBotTemplate: null, updatedBy: null },
    );
    expect(repository.insert).toHaveBeenCalledWith({
      tenantId,
      telegramBotTemplate: null,
      updatedBy: null,
    });
  });

  it('rejects values other than commerce or null', async () => {
    const { service } = createService();

    await expect(
      service.updateTelegramBotTemplate(tenantId, 'booking' as never),
    ).rejects.toThrow("telegramBotTemplate must be 'commerce' or null");
  });

  it('caches reads and invalidates on update', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(null);

    await service.getTelegramBotTemplate(tenantId);
    await service.getTelegramBotTemplate(tenantId);
    expect(repository.findOne).toHaveBeenCalledTimes(1);

    await service.updateTelegramBotTemplate(tenantId, 'commerce', null);
    repository.findOne.mockResolvedValue({
      tenantId,
      telegramBotTemplate: 'commerce',
    });
    await expect(service.getTelegramBotTemplate(tenantId)).resolves.toBe(
      'commerce',
    );
    // 1 initial read + 1 read inside update + 1 read after invalidation.
    expect(repository.findOne).toHaveBeenCalledTimes(3);
  });

  it('expires cached reads after the TTL', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(null);

    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1_000);
      await service.getTelegramBotTemplate(tenantId);
      expect(repository.findOne).toHaveBeenCalledTimes(1);

      now.mockReturnValue(1_000 + CHANNEL_SETTINGS_CACHE_TTL_MS - 1);
      await service.getTelegramBotTemplate(tenantId);
      expect(repository.findOne).toHaveBeenCalledTimes(1);

      now.mockReturnValue(1_000 + CHANNEL_SETTINGS_CACHE_TTL_MS + 1);
      await service.getTelegramBotTemplate(tenantId);
      expect(repository.findOne).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('ensures the default template when enabling commerce', async () => {
    const { service, repository, botTemplates } = createService();
    repository.findOne.mockResolvedValue(null);

    await service.updateTelegramBotTemplate(tenantId, 'commerce', 'admin-1');

    expect(botTemplates.ensureDefaultTemplate).toHaveBeenCalledWith(
      tenantId,
      'admin-1',
    );
  });

  it('does not touch templates when disabling', async () => {
    const { service, repository, botTemplates } = createService();
    repository.findOne.mockResolvedValue({
      tenantId,
      telegramBotTemplate: 'commerce',
    });

    await service.updateTelegramBotTemplate(tenantId, null, null);

    expect(botTemplates.ensureDefaultTemplate).not.toHaveBeenCalled();
  });

  it('leaves settings untouched when default creation fails', async () => {
    const { service, repository, botTemplates } = createService();
    botTemplates.ensureDefaultTemplate.mockRejectedValue(
      new Error('template store unavailable'),
    );

    await expect(
      service.updateTelegramBotTemplate(tenantId, 'commerce', null),
    ).rejects.toThrow('template store unavailable');
    expect(repository.findOne).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('retries the targeted update after a concurrent insert conflict', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(null);
    repository.update
      .mockResolvedValueOnce({ affected: 0 })
      .mockResolvedValueOnce({ affected: 1 });
    repository.insert.mockRejectedValue(
      new QueryFailedError('INSERT INTO tenant_channel_settings', [], {
        code: '23505',
      } as never),
    );

    await expect(
      service.updateTelegramBotTemplate(tenantId, null, 'admin-1'),
    ).resolves.toMatchObject({ telegramBotTemplate: null });

    expect(repository.update).toHaveBeenCalledTimes(2);
    expect(repository.update).toHaveBeenNthCalledWith(
      1,
      { tenantId },
      { telegramBotTemplate: null, updatedBy: 'admin-1' },
    );
    expect(repository.update).toHaveBeenNthCalledWith(
      2,
      { tenantId },
      { telegramBotTemplate: null, updatedBy: 'admin-1' },
    );
  });

  it('rethrows non-unique insert failures', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(null);
    repository.update.mockResolvedValue({ affected: 0 });
    repository.insert.mockRejectedValue(new Error('settings store unavailable'));

    await expect(
      service.updateTelegramBotTemplate(tenantId, null),
    ).rejects.toThrow('settings store unavailable');
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  // Plan 78: the cascade that makes the bot match the platform toggle.
  describe('commerce cascade', () => {
    const telegramChannel = (overrides: Record<string, unknown> = {}) => ({
      id: 'channel-1',
      tenantId,
      channelType: 'telegram',
      credentials: { botToken: '123:token' },
      configuration: {
        telegramShopping: { shopEnabled: true, orderingEnabled: true },
      },
      ...overrides,
    });

    const setup = (channels: unknown[], mappings: unknown[] = []) => {
      const created = createService();
      created.channels.find.mockResolvedValue(channels);
      created.mappings.find.mockResolvedValue(mappings);
      created.repository.findOne.mockResolvedValue({
        tenantId,
        telegramBotTemplate: 'commerce',
      });
      return created;
    };

    it('deletes bot commands and clears shop flags when commerce turns off', async () => {
      const { service, channels } = setup([telegramChannel()]);
      const telegram = {
        deleteMyCommands: jest.fn().mockResolvedValue(undefined),
        setMyCommands: jest.fn().mockResolvedValue(undefined),
      };
      (service as unknown as { telegram: typeof telegram }).telegram = telegram;

      const result = await service.updateTelegramBotTemplate(tenantId, null);

      expect(telegram.deleteMyCommands).toHaveBeenCalledWith('123:token');
      expect(telegram.setMyCommands).not.toHaveBeenCalled();
      expect(channels.save).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            telegramShopping: { shopEnabled: false, orderingEnabled: false },
          }),
        }),
      );
      expect(result.cascade).toMatchObject({
        channelsVisited: 1,
        commandsUpdated: 1,
        flagsUpdated: 1,
        failures: [],
      });
    });

    it('restores commands for every channel but flags only mapped channels', async () => {
      const mapped = telegramChannel({
        id: 'channel-1',
        configuration: {
          telegramShopping: { shopEnabled: false, orderingEnabled: false },
        },
      });
      const bare = telegramChannel({
        id: 'channel-2',
        configuration: {
          telegramShopping: { shopEnabled: false, orderingEnabled: false },
        },
      });
      const { service, channels } = setup([mapped, bare], [
        { channelId: 'channel-1' },
      ]);
      const telegram = {
        deleteMyCommands: jest.fn().mockResolvedValue(undefined),
        setMyCommands: jest.fn().mockResolvedValue(undefined),
      };
      (service as unknown as { telegram: typeof telegram }).telegram = telegram;

      await service.updateTelegramBotTemplate(tenantId, 'commerce');

      expect(telegram.setMyCommands).toHaveBeenCalledTimes(2);
      expect(telegram.setMyCommands).toHaveBeenCalledWith('123:token', [
        { command: 'start', description: 'Start shopping' },
        { command: 'menu', description: 'Open menu' },
      ]);
      // Only the mapped channel's flags are written.
      expect(channels.save).toHaveBeenCalledTimes(1);
      expect(channels.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'channel-1' }));
    });

    it('never writes flags that already match the target state', async () => {
      const off = telegramChannel({
        configuration: {
          telegramShopping: { shopEnabled: false, orderingEnabled: false },
        },
      });
      const { service, channels } = setup([off]);
      (service as unknown as { telegram: Record<string, unknown> }).telegram = {
        deleteMyCommands: jest.fn().mockResolvedValue(undefined),
      };

      await service.updateTelegramBotTemplate(tenantId, null);

      expect(channels.save).not.toHaveBeenCalled();
    });

    it('reports a per-channel failure without failing the toggle', async () => {
      const { service } = setup([telegramChannel()]);
      (service as unknown as { telegram: Record<string, unknown> }).telegram = {
        deleteMyCommands: jest
          .fn()
          .mockRejectedValue(new Error('telegram unreachable')),
      };

      const result = await service.updateTelegramBotTemplate(tenantId, null);

      expect(result.telegramBotTemplate).toBeNull();
      expect(result.cascade.failures).toEqual(['commands:channel-1']);
    });
  });

  describe('facebook mode', () => {
    it('reads a missing row as platform_one_click with unverified business', async () => {
      const { service, repository } = createService();
      repository.findOne.mockResolvedValue(null);

      await expect(service.getFacebookSettings(tenantId)).resolves.toEqual({
        facebookMode: 'platform_one_click',
        facebookBusinessVerified: null,
      });
    });

    it('creates a row when switching mode with no existing settings', async () => {
      const { service, repository } = createService();
      repository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          tenantId,
          facebookMode: 'byo_app',
          facebookBusinessVerified: null,
        });
      repository.update.mockResolvedValue({ affected: 0 });

      const result = await service.updateFacebookSettings(
        tenantId,
        'byo_app',
        null,
        null,
      );

      expect(result).toMatchObject({
        tenantId,
        facebookMode: 'byo_app',
        previousFacebookMode: 'platform_one_click',
      });
      expect(repository.update).toHaveBeenCalledWith(
        { tenantId },
        {
          facebookMode: 'byo_app',
          facebookBusinessVerified: null,
          updatedBy: null,
        },
      );
      expect(repository.insert).toHaveBeenCalledWith({
        tenantId,
        facebookMode: 'byo_app',
        facebookBusinessVerified: null,
        updatedBy: null,
      });
    });

    it('rejects an unknown facebook mode', async () => {
      const { service } = createService();

      await expect(
        service.updateFacebookSettings(tenantId, 'custom_app' as never),
      ).rejects.toThrow('facebookMode must be platform_one_click or byo_app');
    });

    it('stores the business-verified flag alongside the mode', async () => {
      const { service, repository } = createService();
      repository.findOne
        .mockResolvedValueOnce({
          tenantId,
          telegramBotTemplate: null,
          facebookMode: 'byo_app',
          facebookBusinessVerified: null,
          updatedBy: null,
        })
        .mockResolvedValue({
          tenantId,
          facebookMode: 'byo_app',
          facebookBusinessVerified: true,
        });

      const result = await service.updateFacebookSettings(
        tenantId,
        'byo_app',
        true,
        'admin-1',
      );

      expect(result.facebookBusinessVerified).toBe(true);
      expect(repository.update).toHaveBeenCalledWith(
        { tenantId },
        {
          facebookMode: 'byo_app',
          facebookBusinessVerified: true,
          updatedBy: 'admin-1',
        },
      );
      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('keeps telegram columns out of facebook writes', async () => {
      const { service, repository } = createService();
      repository.findOne.mockResolvedValue({
        tenantId,
        facebookMode: 'platform_one_click',
      });

      await service.updateFacebookSettings(
        tenantId,
        'byo_app',
        undefined,
        'admin-1',
      );

      expect(repository.update).toHaveBeenCalledWith(
        { tenantId },
        expect.not.objectContaining({ telegramBotTemplate: expect.anything() }),
      );
    });
  });
});
