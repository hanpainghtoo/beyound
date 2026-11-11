import {
  PlatformAdminService,
  maskVerifyToken,
} from './platform-admin.service';

describe('maskVerifyToken', () => {
  it('returns null for missing tokens', () => {
    expect(maskVerifyToken(null)).toBeNull();
    expect(maskVerifyToken(undefined)).toBeNull();
    expect(maskVerifyToken('')).toBeNull();
  });

  it('masks short tokens fully', () => {
    expect(maskVerifyToken('abcd')).toBe('****');
  });

  it('reveals only the last 4 characters', () => {
    expect(maskVerifyToken('0123456789abcdef')).toBe('****cdef');
  });
});

describe('PlatformAdminService channel settings verify token', () => {
  const tenantId = '22222222-2222-4222-8222-222222222222';
  const fullToken =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const createService = (overrides?: {
    byoApp?: Record<string, unknown> | null;
  }) => {
    const tenantRepository = {
      findOne: jest.fn().mockResolvedValue({ id: tenantId }),
    };
    const channelSettingsService = {
      getTelegramBotTemplate: jest.fn().mockResolvedValue(null),
      getFacebookSettings: jest.fn().mockResolvedValue({
        facebookMode: 'byo_app',
        facebookBusinessVerified: null,
      }),
      updateFacebookSettings: jest.fn().mockResolvedValue({
        tenantId,
        facebookMode: 'byo_app',
      }),
    };
    const metaAppResolver = {
      decrypt: jest.fn().mockReturnValue({
        appSecret: 'app-secret',
        verifyToken: fullToken,
      }),
      newVerifyToken: jest.fn().mockReturnValue(fullToken),
      newWebhookPathSegment: jest.fn().mockReturnValue('t_testsegment'),
    };
    const byoApp =
      overrides && 'byoApp' in overrides
        ? overrides?.byoApp
        : {
            id: 'meta-app-1',
            tenantId,
            kind: 'byo',
            appId: '1234567890',
            status: 'pending',
            webhookPathSegment: 't_testsegment',
            lastValidatedAt: null,
            updatedAt: new Date('2026-10-03T00:00:00Z'),
          };
    const metaAppRepository = {
      findOne: jest.fn().mockResolvedValue(byoApp),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: unknown) => {
        metaAppRepository.findOne.mockResolvedValue(value);
        // Track save calls for backward compatibility with tests
        if (!metaAppRepository.__saveCalls) metaAppRepository.__saveCalls = [];
        metaAppRepository.__saveCalls.push([value as Record<string, unknown>]);
        return Promise.resolve(value);
      }),
      __saveCalls: [] as Array<[Record<string, unknown>]>,
      // Honest conditional-UPDATE fake: evaluates the WHERE guards in
      // validateTenantFacebookApp against the live row, emulating the
      // UpdateDateColumn bump on write like TypeORM does.
      createQueryBuilder: jest.fn(() => {
        let setClause: Record<string, unknown> = {};
        const wheres: Array<{ sql: string; params: Record<string, unknown> }> =
          [];
        const qb = {
          update: () => qb,
          set: (values: Record<string, unknown>) => {
            setClause = values;
            return qb;
          },
          where: (sql: string, params?: Record<string, unknown>) => {
            wheres.push({ sql, params: params ?? {} });
            return qb;
          },
          andWhere: (sql: string, params?: Record<string, unknown>) => {
            wheres.push({ sql, params: params ?? {} });
            return qb;
          },
          execute: () => Promise.resolve(applyConditionalUpdate()),
        };
        const applyConditionalUpdate = () => {
          const row = byoApp as unknown as Record<string, unknown> | null;
          const params = Object.assign(
            {},
            ...wheres.map((w) => w.params),
          ) as Record<string, unknown>;
          const sql = wheres.map((w) => w.sql).join(' ');
          const sameId = row !== null && String(params.id) === String(row.id);
          const sameUpdatedAt =
            row !== null &&
            params.updatedAt instanceof Date &&
            row.updatedAt instanceof Date &&
            params.updatedAt.getTime() === row.updatedAt.getTime();
          const sameAppId =
            row !== null &&
            (params.appId === undefined || params.appId === row.appId);
          const liveOk =
            !/live_confirmed_at IS NOT NULL/.test(sql) ||
            (row !== null && row.liveConfirmedAt != null);
          if (!sameId || !sameUpdatedAt || !sameAppId || !liveOk) {
            return { affected: 0, raw: [] };
          }
          Object.assign(row, setClause, { updatedAt: new Date() });
          // Track this update call for tests
          if (!metaAppRepository.__updateCalls)
            metaAppRepository.__updateCalls = [];
          metaAppRepository.__updateCalls.push([setClause]);
          return { affected: 1, raw: [] };
        };
        return qb;
      }),
      __updateCalls: [] as Array<[Record<string, unknown>]>,
    };
    const fillers = Array.from({ length: 20 }, () => ({}));
    const args = [
      tenantRepository,
      ...fillers,
      undefined,
      undefined,
      undefined,
      undefined,
      channelSettingsService,
      metaAppResolver,
      metaAppRepository,
    ];
    const Ctor = PlatformAdminService as unknown as new (
      ...ctorArgs: unknown[]
    ) => PlatformAdminService;
    const service = new Ctor(...args);
    return { service, metaAppRepository, metaAppResolver };
  };

  beforeEach(() => {
    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef';
  });

  it('masks the verify token on admin GET', async () => {
    const { service } = createService();

    const settings = await service.getTenantChannelSettings(tenantId);

    expect(settings.facebookApp?.verifyToken).toBe(
      `****${fullToken.slice(-4)}`,
    );
    expect(settings.facebookApp?.verifyToken).not.toBe(fullToken);
    expect(settings.facebookApp).not.toHaveProperty('appSecret');
  });

  it('returns null verify token when no BYO app exists', async () => {
    const { service } = createService({ byoApp: null });

    const settings = await service.getTenantChannelSettings(tenantId);

    expect(settings.facebookApp).toBeNull();
  });

  it('reveals the full verify token exactly once in the rotate response', async () => {
    const { service } = createService({ byoApp: null });

    const settings = await service.updateTenantFacebookApp(
      tenantId,
      '1234567890',
      'fresh-app-secret',
      null,
    );

    expect(settings.facebookApp?.verifyToken).toBe(fullToken);
  });

  it('clears live confirmation when App ID or Secret is re-saved', async () => {
    const { service, metaAppRepository } = createService({
      byoApp: {
        tenantId,
        kind: 'byo',
        appId: 'old-app-id',
        status: 'valid',
        webhookPathSegment: 't_testsegment',
        lastValidatedAt: new Date('2026-10-02T00:00:00Z'),
        updatedAt: new Date('2026-10-03T00:00:00Z'),
        liveConfirmedAt: new Date('2026-10-02T00:00:00Z'),
        liveConfirmedBy: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      },
    });

    const settings = await service.updateTenantFacebookApp(
      tenantId,
      'new-app-id',
      'new-app-secret',
      null,
    );

    const rotateCalls = metaAppRepository.__updateCalls as unknown as Array<
      [
        {
          status: string;
          liveConfirmedAt: Date | null;
          liveConfirmedBy: string | null;
        },
      ]
    >;
    const [[saved]] = rotateCalls;
    expect(saved.status).toBe('pending');
    expect(saved.liveConfirmedAt).toBeNull();
    expect(saved.liveConfirmedBy).toBeNull();
    expect(settings.facebookApp?.status).toBe('pending');
    expect(settings.facebookApp?.liveConfirmedAt).toBeNull();
  });

  it('throws ConflictException when rotate affects zero rows', async () => {
    const { service, metaAppRepository } = createService();
    const rotateQueryBuilder = {
      update: jest.fn(),
      set: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
    };
    rotateQueryBuilder.update.mockReturnValue(rotateQueryBuilder);
    rotateQueryBuilder.set.mockReturnValue(rotateQueryBuilder);
    rotateQueryBuilder.where.mockReturnValue(rotateQueryBuilder);
    rotateQueryBuilder.andWhere.mockReturnValue(rotateQueryBuilder);
    metaAppRepository.createQueryBuilder.mockReturnValue(rotateQueryBuilder);

    await expect(
      service.updateTenantFacebookApp(
        tenantId,
        'new-app-id',
        'new-app-secret',
        null,
      ),
    ).rejects.toThrow('Concurrent modification detected. Please retry.');
  });

  it('keeps the validate response masked', async () => {
    const { service } = createService();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '1234567890' }),
    });
    global.fetch = fetchMock as never;

    const result = await service.validateTenantFacebookApp(tenantId);

    expect(result.facebookApp?.verifyToken).toBe(`****${fullToken.slice(-4)}`);
    expect(result.facebookApp?.verifyToken).not.toBe(fullToken);
  });

  it('records live confirmation with the confirming admin', async () => {
    const { service, metaAppRepository } = createService();
    const adminId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

    const settings = await service.updateTenantFacebookLiveConfirmation(
      tenantId,
      true,
      adminId,
    );

    const updateCalls = metaAppRepository.__updateCalls as unknown as Array<
      [
        {
          liveConfirmedAt: Date | null;
          liveConfirmedBy: string | null;
          status: string;
        },
      ]
    >;
    const [[saved]] = updateCalls;
    expect(saved.liveConfirmedAt).toBeInstanceOf(Date);
    expect(saved.liveConfirmedBy).toBe(adminId);
    expect(settings.facebookApp?.liveConfirmedAt).toBeInstanceOf(Date);
  });

  it('clears live confirmation on uncheck', async () => {
    const { service, metaAppRepository } = createService({
      byoApp: {
        id: 'meta-app-1',
        tenantId,
        kind: 'byo',
        appId: '1234567890',
        status: 'valid',
        webhookPathSegment: 't_testsegment',
        lastValidatedAt: null,
        updatedAt: new Date('2026-10-03T00:00:00Z'),
        liveConfirmedAt: new Date('2026-10-01T00:00:00Z'),
        liveConfirmedBy: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      },
    });

    await service.updateTenantFacebookLiveConfirmation(tenantId, false, null);

    const updateCalls = metaAppRepository.__updateCalls as unknown as Array<
      [
        {
          liveConfirmedAt: Date | null;
          liveConfirmedBy: string | null;
          status: string;
        },
      ]
    >;
    const [[saved]] = updateCalls;
    expect(saved.liveConfirmedAt).toBeNull();
    expect(saved.liveConfirmedBy).toBeNull();
    expect(saved.status).toBe('pending');
  });

  it('throws ConflictException when live confirmation affects zero rows', async () => {
    const { service, metaAppRepository } = createService();
    const confirmationQueryBuilder = {
      update: jest.fn(),
      set: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
    };
    confirmationQueryBuilder.update.mockReturnValue(confirmationQueryBuilder);
    confirmationQueryBuilder.set.mockReturnValue(confirmationQueryBuilder);
    confirmationQueryBuilder.where.mockReturnValue(confirmationQueryBuilder);
    confirmationQueryBuilder.andWhere.mockReturnValue(confirmationQueryBuilder);
    metaAppRepository.createQueryBuilder.mockReturnValue(
      confirmationQueryBuilder,
    );

    await expect(
      service.updateTenantFacebookLiveConfirmation(tenantId, true, null),
    ).rejects.toThrow('Concurrent modification detected. Please retry.');
  });

  it('marks valid only when live confirmation is set', async () => {
    const confirmedAt = new Date('2026-10-02T00:00:00Z');
    const { service } = createService({
      byoApp: {
        id: 'meta-app-1',
        tenantId,
        kind: 'byo',
        appId: '1234567890',
        status: 'pending',
        webhookPathSegment: 't_testsegment',
        lastValidatedAt: null,
        updatedAt: new Date('2026-10-03T00:00:00Z'),
        liveConfirmedAt: confirmedAt,
        liveConfirmedBy: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      },
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '1234567890' }),
    }) as never;

    const result = await service.validateTenantFacebookApp(tenantId);

    expect(result.facebookApp?.status).toBe('valid');
    expect(result.validation).toMatchObject({ valid: true });
  });

  it('holds at pending when credentials pass but live is unconfirmed', async () => {
    const { service } = createService();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '1234567890' }),
    }) as never;

    const result = await service.validateTenantFacebookApp(tenantId);

    expect(result.facebookApp?.status).toBe('pending');
    expect(result.validation).toMatchObject({ valid: false });
    expect(String(result.validation?.message)).toMatch(/Live mode/);
  });

  it('validate + concurrent rotate keeps pending and clears confirmation', async () => {
    const row: Record<string, unknown> = {
      id: 'meta-app-1',
      tenantId,
      kind: 'byo',
      appId: '1234567890',
      status: 'pending',
      webhookPathSegment: 't_testsegment',
      lastValidatedAt: null,
      updatedAt: new Date('2026-10-03T00:00:00Z'),
      liveConfirmedAt: new Date('2026-10-02T00:00:00Z'),
      liveConfirmedBy: 'admin-1',
    };
    const { service } = createService({ byoApp: row });
    global.fetch = jest.fn().mockImplementation(() => {
      // A credential rotate lands during the Graph round-trip: it clears the
      // confirmation and bumps updated_at, exactly like repository.save().
      Object.assign(row, {
        liveConfirmedAt: null,
        liveConfirmedBy: null,
        status: 'pending',
        updatedAt: new Date('2026-10-03T00:01:00Z'),
      });
      return {
        ok: true,
        json: () => Promise.resolve({ id: '1234567890' }),
      };
    }) as never;

    const result = await service.validateTenantFacebookApp(tenantId);

    expect(row.status).toBe('pending');
    expect(row.liveConfirmedAt).toBeNull();
    expect(result.facebookApp?.status).toBe('pending');
    expect(result.validation).toMatchObject({ valid: false });
    expect(String(result.validation?.message)).toMatch(
      /changed during validation/,
    );
  });

  it('validate + concurrent uncheck never promotes to valid', async () => {
    const row: Record<string, unknown> = {
      id: 'meta-app-1',
      tenantId,
      kind: 'byo',
      appId: '1234567890',
      status: 'pending',
      webhookPathSegment: 't_testsegment',
      lastValidatedAt: null,
      updatedAt: new Date('2026-10-03T00:00:00Z'),
      liveConfirmedAt: new Date('2026-10-02T00:00:00Z'),
      liveConfirmedBy: 'admin-1',
    };
    const { service } = createService({ byoApp: row });
    global.fetch = jest.fn().mockImplementation(() => {
      // A live-confirmation uncheck lands during the Graph round-trip.
      Object.assign(row, {
        liveConfirmedAt: null,
        liveConfirmedBy: null,
        updatedAt: new Date('2026-10-03T00:01:00Z'),
      });
      return {
        ok: true,
        json: () => Promise.resolve({ id: '1234567890' }),
      };
    }) as never;

    const result = await service.validateTenantFacebookApp(tenantId);

    expect(row.status).not.toBe('valid');
    expect(result.facebookApp?.status).not.toBe('valid');
    expect(result.validation).toMatchObject({ valid: false });
  });

  it('stale invalid result does not overwrite a rotated row', async () => {
    const row: Record<string, unknown> = {
      id: 'meta-app-1',
      tenantId,
      kind: 'byo',
      appId: '1234567890',
      status: 'pending',
      webhookPathSegment: 't_testsegment',
      lastValidatedAt: null,
      updatedAt: new Date('2026-10-03T00:00:00Z'),
      liveConfirmedAt: null,
      liveConfirmedBy: null,
    };
    const { service } = createService({ byoApp: row });
    global.fetch = jest.fn().mockImplementation(() => {
      // Fresh credentials land during the failing Graph round-trip.
      Object.assign(row, {
        status: 'pending',
        updatedAt: new Date('2026-10-03T00:01:00Z'),
      });
      return {
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Bad old secret' } }),
      };
    }) as never;

    const result = await service.validateTenantFacebookApp(tenantId);

    expect(row.status).toBe('pending');
    expect(result.facebookApp?.status).toBe('pending');
    expect(result.validation).toMatchObject({ valid: false });
    expect(String(result.validation?.message)).toMatch(
      /changed during validation/,
    );
  });

  it('marks invalid when Meta rejects the credentials', async () => {
    const { service } = createService({
      byoApp: {
        id: 'meta-app-1',
        tenantId,
        kind: 'byo',
        appId: '1234567890',
        status: 'pending',
        webhookPathSegment: 't_testsegment',
        lastValidatedAt: null,
        updatedAt: new Date('2026-10-03T00:00:00Z'),
        liveConfirmedAt: new Date('2026-10-02T00:00:00Z'),
        liveConfirmedBy: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      },
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Bad credentials' } }),
    }) as never;

    const result = await service.validateTenantFacebookApp(tenantId);

    expect(result.facebookApp?.status).toBe('invalid');
    expect(result.validation).toMatchObject({ valid: false });
  });
});
