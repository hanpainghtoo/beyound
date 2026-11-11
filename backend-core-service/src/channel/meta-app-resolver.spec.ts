import { MetaAppResolver } from './meta-app-resolver.service';

describe('MetaAppResolver', () => {
  const OLD_ENV = process.env;

  const createResolver = (overrides?: {
    platformRow?: Record<string, unknown> | null;
    byoRow?: Record<string, unknown> | null;
    facebookMode?: string;
  }) => {
    const repository = {
      findOne: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        if (where.webhookPathSegment) {
          if (where.webhookPathSegment === 't_seg')
            return Promise.resolve({ id: 'meta-1', status: 'valid' });
          if (where.webhookPathSegment === 't_retired')
            return Promise.resolve({ id: 'meta-2', status: 'retired' });
          return Promise.resolve(null);
        }
        if (where.kind === 'platform')
          return Promise.resolve(overrides?.platformRow ?? null);
        if (where.kind === 'byo')
          return Promise.resolve(overrides?.byoRow ?? null);
        return Promise.resolve(null);
      }),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
    };
    const settings = {
      getFacebookSettings: jest.fn().mockResolvedValue({
        facebookMode: overrides?.facebookMode ?? 'platform_one_click',
      }),
    };
    const resolver = new MetaAppResolver(
      repository as never,
      settings as never,
    );
    return { resolver, repository };
  };

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef';
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('resolves the platform app in platform_one_click mode', async () => {
    const { resolver } = createResolver({
      platformRow: { id: 'meta-plat', kind: 'platform' },
    });

    const app = await resolver.getMetaApp('tenant-1');

    expect(app.id).toBe('meta-plat');
  });

  it('throws when the platform app was never seeded', async () => {
    const { resolver } = createResolver({ platformRow: null });

    await expect(resolver.getMetaApp('tenant-1')).rejects.toThrow(
      'Platform Meta app is not configured',
    );
  });

  it('resolves a valid BYO app without falling back to platform', async () => {
    const { resolver, repository } = createResolver({
      facebookMode: 'byo_app',
      byoRow: {
        id: 'meta-byo',
        kind: 'byo',
        status: 'valid',
        liveConfirmedAt: new Date('2026-10-01T00:00:00Z'),
      },
      platformRow: { id: 'meta-plat', kind: 'platform' },
    });

    const app = await resolver.getMetaApp('tenant-1');

    expect(app.id).toBe('meta-byo');
    expect(repository.findOne).not.toHaveBeenCalledWith({
      where: { kind: 'platform' },
    });
  });

  it.each([
    ['missing', null],
    ['invalid status', { id: 'meta-byo', kind: 'byo', status: 'invalid' }],
    ['pending status', { id: 'meta-byo', kind: 'byo', status: 'pending' }],
    [
      'valid but unconfirmed',
      { id: 'meta-byo', kind: 'byo', status: 'valid', liveConfirmedAt: null },
    ],
  ])(
    'rejects BYO mode with %s app and no platform fallback',
    async (_label, byoRow) => {
      const { resolver } = createResolver({
        facebookMode: 'byo_app',
        byoRow: byoRow as Record<string, unknown> | null,
        platformRow: { id: 'meta-plat', kind: 'platform' },
      });

      await expect(resolver.getMetaApp('tenant-1')).rejects.toThrow(
        'BYO_APP_NOT_CONFIGURED',
      );
    },
  );

  it('resolves webhook routes by path segment and rejects retired/unknown', async () => {
    const { resolver } = createResolver();

    await expect(resolver.resolveByPathSegment('t_seg')).resolves.toMatchObject(
      { id: 'meta-1' },
    );
    await expect(resolver.resolveByPathSegment('t_retired')).rejects.toThrow(
      'Webhook route not found',
    );
    await expect(resolver.resolveByPathSegment('nope')).rejects.toThrow(
      'Webhook route not found',
    );
  });

  it('skips the platform seed when env vars are missing', async () => {
    const { resolver, repository } = createResolver();
    delete process.env.META_APP_ID;

    await expect(resolver.ensurePlatformApp()).resolves.toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('round-trips app secrets through decrypt', async () => {
    const { resolver } = createResolver();
    const row = {
      appSecretEncrypted: (
        await import('./provider-credentials.util')
      ).encryptProviderCredentials(
        { value: 's3cret' },
        process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY as string,
      ),
      verifyTokenEncrypted: (
        await import('./provider-credentials.util')
      ).encryptProviderCredentials(
        { value: 'verify-me' },
        process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY as string,
      ),
    };

    expect(resolver.decrypt(row as never)).toEqual({
      appSecret: 's3cret',
      verifyToken: 'verify-me',
    });
  });
});
