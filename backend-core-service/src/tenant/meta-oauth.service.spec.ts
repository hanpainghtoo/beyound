import {
  BadGatewayException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { META_OAUTH_ERROR_CODES, MetaOAuthService } from './meta-oauth.service';

const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = 'user-1';
const REDIRECT_URI = 'https://ws.example/workspace/channels/meta/callback';

const byoAppRow = () => ({
  id: 'meta-byo-1',
  tenantId: TENANT_ID,
  kind: 'byo',
  appId: 'byo-app-id',
  status: 'valid',
  webhookPathSegment: 't_byosegment',
  loginConfigId: null,
});

const platformAppRow = () => ({
  id: 'meta-platform-1',
  tenantId: null,
  kind: 'platform',
  appId: 'platform-app-id',
  status: 'valid',
  webhookPathSegment: 'shared',
  loginConfigId: null,
});

const graphOk = (payload: unknown) => ({
  ok: true,
  json: () => Promise.resolve(payload),
});

const graphFail = (error: unknown) => ({
  ok: false,
  json: () => Promise.resolve({ error }),
});

describe('MetaOAuthService', () => {
  const OLD_ENV = process.env;
  let fetchMock: jest.Mock<Promise<unknown>, [string]>;

  const createService = (overrides?: {
    appRow?: Record<string, unknown> | (() => never);
    pages?: Array<Record<string, unknown>>;
    fetchImpl?: (url: string) => unknown;
  }) => {
    const appRow = overrides?.appRow ?? byoAppRow();
    const metaAppResolver = {
      getMetaApp: jest.fn(() => {
        if (typeof appRow === 'function') return appRow();
        return Promise.resolve(appRow);
      }),
      decrypt: jest.fn(() => ({
        appSecret: 'byo-app-secret',
        verifyToken: 'byo-verify-token',
      })),
    };
    const tenantService = {
      createChannel: jest.fn(() => Promise.resolve({ id: 'channel-1' })),
      testChannelConnection: jest.fn(() =>
        Promise.resolve({
          ok: true,
          channel: { id: 'channel-1' },
          errors: [],
        }),
      ),
      deleteChannel: jest.fn(() => Promise.resolve(undefined)),
    };
    const channelRepository = {
      update: jest.fn(() => Promise.resolve({ affected: 1 })),
    };
    const store = new Map<string, string>();
    const counters = new Map<string, number>();
    const redis = {
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      eval: jest.fn(
        (script: string, options: { keys: string[]; arguments: string[] }) => {
          const key = options.keys[0];
          if (script.includes('INCR')) {
            const next = (counters.get(key) ?? 0) + 1;
            counters.set(key, next);
            return Promise.resolve(next);
          }
          const value = store.get(key) ?? null;
          if (value !== null) store.delete(key);
          return Promise.resolve(value);
        },
      ),
      quit: jest.fn(() => Promise.resolve('OK')),
    };
    const pages = overrides?.pages ?? [
      {
        id: 'page-1',
        name: 'Page One',
        access_token: 'page-short-1',
        category: 'Test',
      },
    ];
    fetchMock = jest.fn((url: string): Promise<unknown> => {
      if (overrides?.fetchImpl)
        return Promise.resolve(overrides.fetchImpl(url));
      if (url.includes('/subscribed_apps'))
        return Promise.resolve(graphOk({ success: true }));
      if (url.includes('/me/accounts'))
        return Promise.resolve(graphOk({ data: pages }));
      if (url.includes('grant_type=fb_exchange_token')) {
        const token = new URL(url).searchParams.get('fb_exchange_token');
        return Promise.resolve(graphOk({ access_token: `${token}-long` }));
      }
      if (url.includes('/oauth/access_token'))
        return Promise.resolve(graphOk({ access_token: 'user-short' }));
      return Promise.reject(new Error(`unexpected graph url ${url}`));
    });
    global.fetch = fetchMock as never;
    const Ctor = MetaOAuthService as unknown as new (
      ...args: unknown[]
    ) => MetaOAuthService;
    const service = new Ctor(
      metaAppResolver,
      tenantService,
      channelRepository,
      redis,
    );
    return { service, metaAppResolver, tenantService, channelRepository };
  };

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      PROVIDER_CREDENTIAL_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
      WORKSPACE_ORIGIN: 'https://ws.example',
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  const issueAndExchange = async (
    service: MetaOAuthService,
    body?: Record<string, unknown>,
  ): Promise<unknown> => {
    const issued = await service.issueState(TENANT_ID, USER_ID);
    return service.exchangeCode(TENANT_ID, USER_ID, {
      code: 'auth-code',
      redirectUri: REDIRECT_URI,
      state: issued.state,
      ...body,
    });
  };

  it('issues a single-use state bound to the tenant and user', async () => {
    const { service } = createService();

    const issued = await service.issueState(TENANT_ID, USER_ID);

    expect(issued.state).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.redirectUri).toBe(REDIRECT_URI);
    expect(issued.expiresIn).toBe(600);
  });

  it('connects a single page end to end and stamps meta_app_id', async () => {
    const { service, tenantService, channelRepository } = createService();

    const result = (await issueAndExchange(service)) as {
      ok: boolean;
      page: { id: string };
      errors: unknown[];
    };

    expect(result.ok).toBe(true);
    expect(result.page.id).toBe('page-1');
    expect(result.errors).toEqual([]);
    const [[calledTenant, payload]] = tenantService.createChannel.mock
      .calls as unknown as Array<
      [
        string,
        {
          channelType: string;
          credentials: Record<string, string>;
          configuration: Record<string, string | number | string[] | null>;
        },
        string,
      ]
    >;
    expect(calledTenant).toBe(TENANT_ID);
    expect(payload.channelType).toBe('messenger');
    expect(payload.credentials.pageId).toBe('page-1');
    expect(payload.credentials.pageAccessToken).toBe('page-short-1-long');
    expect(payload.credentials.appSecret).toBe('byo-app-secret');
    expect(payload.credentials.verifyToken).toBe('byo-verify-token');
    expect(payload.configuration.metaAppId).toBe('byo-app-id');
    expect(payload.configuration.providerAppRoutingId).toBe('t_byosegment');
    expect(channelRepository.update).toHaveBeenCalledWith('channel-1', {
      metaAppId: 'meta-byo-1',
    });
    expect(
      fetchMock.mock.calls.some(([url]: [string]) =>
        url.includes('/page-1/subscribed_apps'),
      ),
    ).toBe(true);
    expect(tenantService.testChannelConnection).toHaveBeenCalledWith(
      TENANT_ID,
      'channel-1',
      USER_ID,
    );
  });

  it('rejects state replay with no fallback', async () => {
    const { service } = createService();
    const issued = await service.issueState(TENANT_ID, USER_ID);
    const body = {
      code: 'auth-code',
      redirectUri: REDIRECT_URI,
      state: issued.state,
    };

    await service.exchangeCode(TENANT_ID, USER_ID, body);
    const replay = service.exchangeCode(TENANT_ID, USER_ID, body);

    await expect(replay).rejects.toMatchObject({
      response: {
        code: META_OAUTH_ERROR_CODES.OAUTH_STATE_INVALID,
      },
    });
  });

  it('rejects a tampered redirect URI', async () => {
    const { service } = createService();

    await expect(
      issueAndExchange(service, { redirectUri: 'https://evil.example/cb' }),
    ).rejects.toMatchObject({
      response: {
        code: META_OAUTH_ERROR_CODES.REDIRECT_URI_MISMATCH,
      },
    });
  });

  it('maps a wrong app secret to a distinct actionable error', async () => {
    const { service } = createService({
      fetchImpl: (url: string) => {
        if (url.includes('/oauth/access_token') && !url.includes('grant_type'))
          return graphFail({
            message: 'Error validating client secret.',
            type: 'OAuthException',
            code: 104,
          });
        return graphOk({});
      },
    });

    await expect(issueAndExchange(service)).rejects.toMatchObject({
      response: {
        code: META_OAUTH_ERROR_CODES.INVALID_APP_SECRET,
      },
    });
  });

  it('maps an unregistered redirect URI to a distinct actionable error', async () => {
    const { service } = createService({
      fetchImpl: (url: string) => {
        if (url.includes('/oauth/access_token') && !url.includes('grant_type'))
          return graphFail({
            message:
              'Invalid redirect_uri: Given URL is not allowed by the Application configuration.',
            type: 'OAuthException',
            code: 191,
          });
        return graphOk({});
      },
    });

    await expect(issueAndExchange(service)).rejects.toMatchObject({
      response: {
        code: META_OAUTH_ERROR_CODES.REDIRECT_URI_NOT_REGISTERED,
      },
    });
  });

  it('maps a non-live app to a distinct actionable error', async () => {
    const { service } = createService({
      fetchImpl: (url: string) => {
        if (url.includes('/oauth/access_token') && !url.includes('grant_type'))
          return graphFail({
            message:
              'This app is in development mode and cannot be used for login.',
            type: 'OAuthException',
            code: 1,
          });
        return graphOk({});
      },
    });

    const error: unknown = await issueAndExchange(service).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: META_OAUTH_ERROR_CODES.APP_NOT_LIVE,
    });
  });

  it('returns 409 BYO_APP_NOT_CONFIGURED with no platform fallback', async () => {
    const { service, tenantService } = createService({
      appRow: () => {
        throw new NotFoundException('BYO_APP_NOT_CONFIGURED');
      },
    });

    const error: unknown = await issueAndExchange(service).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: META_OAUTH_ERROR_CODES.BYO_APP_NOT_CONFIGURED,
    });
    expect(tenantService.createChannel).not.toHaveBeenCalled();
  });

  it('keeps the platform flow on platform credentials', async () => {
    const { service } = createService({ appRow: platformAppRow() });
    const issued = await service.issueState(TENANT_ID, USER_ID);

    await service.exchangeCode(TENANT_ID, USER_ID, {
      code: 'auth-code',
      redirectUri: REDIRECT_URI,
      state: issued.state,
    });

    const tokenCall = fetchMock.mock.calls.find(([url]) =>
      url.includes('/oauth/access_token'),
    )?.[0];
    expect(tokenCall).toContain('client_id=platform-app-id');
    expect(tokenCall).not.toContain('client_id=byo-app-id');
  });

  it('holds multi-page logins for selection and expires the token', async () => {
    const { service } = createService({
      pages: [
        { id: 'page-1', name: 'One', access_token: 'page-short-1' },
        { id: 'page-2', name: 'Two', access_token: 'page-short-2' },
      ],
    });

    const pending = (await issueAndExchange(service)) as {
      needsPageSelection: boolean;
      selectionToken: string;
      pages: Array<{ id: string }>;
    };
    expect(pending.needsPageSelection).toBe(true);
    expect(pending.pages.map((p) => p.id)).toEqual(['page-1', 'page-2']);

    const done = (await service.exchangeCode(TENANT_ID, USER_ID, {
      selectionToken: pending.selectionToken,
      pageId: 'page-2',
    })) as { ok: boolean; page: { id: string } };
    expect(done.ok).toBe(true);
    expect(done.page.id).toBe('page-2');

    await expect(
      service.exchangeCode(TENANT_ID, USER_ID, {
        selectionToken: pending.selectionToken,
        pageId: 'page-2',
      }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('rejects a page outside the authorized list', async () => {
    const { service } = createService();

    await expect(
      issueAndExchange(service, { pageId: 'page-unknown' }),
    ).rejects.toMatchObject({
      response: {
        code: META_OAUTH_ERROR_CODES.PAGE_NOT_AUTHORIZED,
      },
    });
  });

  it('maps an unknown Graph failure to a generic upstream error', async () => {
    const { service } = createService({
      fetchImpl: (url: string) => {
        if (url.includes('/oauth/access_token') && !url.includes('grant_type'))
          return graphFail({
            message: 'Invalid OAuth access token.',
            type: 'OAuthException',
            code: 190,
          });
        return graphOk({});
      },
    });

    const error: unknown = await issueAndExchange(service).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).getResponse()).toMatchObject({
      code: META_OAUTH_ERROR_CODES.META_UPSTREAM_ERROR,
    });
  });

  it('rate-limits state issuance per tenant and user', async () => {
    process.env.META_OAUTH_STATE_RATE_LIMIT = '2';
    const { service } = createService();

    await service.issueState(TENANT_ID, USER_ID);
    await service.issueState(TENANT_ID, USER_ID);
    const limited = service.issueState(TENANT_ID, USER_ID);

    await expect(limited).rejects.toMatchObject({ status: 429 });
    await expect(limited).rejects.toMatchObject({
      response: { code: META_OAUTH_ERROR_CODES.META_OAUTH_RATE_LIMITED },
    });
    // A different user keeps their own budget.
    await expect(
      service.issueState(TENANT_ID, 'user-2'),
    ).resolves.toBeDefined();
  });

  it('rate-limits code exchange per tenant and user', async () => {
    process.env.META_OAUTH_EXCHANGE_RATE_LIMIT = '1';
    const { service } = createService();

    await issueAndExchange(service);
    const extra = issueAndExchange(service);

    await expect(extra).rejects.toMatchObject({ status: 429 });
  });

  it('binds page selection to the issuing tenant and user', async () => {
    const { service } = createService({
      pages: [
        { id: 'page-1', name: 'One', access_token: 'page-short-1' },
        { id: 'page-2', name: 'Two', access_token: 'page-short-2' },
      ],
    });
    const pending = (await issueAndExchange(service)) as {
      needsPageSelection: boolean;
      selectionToken: string;
    };

    await expect(
      service.exchangeCode('other-tenant', USER_ID, {
        selectionToken: pending.selectionToken,
        pageId: 'page-2',
      }),
    ).rejects.toMatchObject({
      response: { code: META_OAUTH_ERROR_CODES.OAUTH_STATE_INVALID },
    });
    // The mismatched attempt above already burned the single-use token.
    await expect(
      service.exchangeCode(TENANT_ID, 'other-user', {
        selectionToken: pending.selectionToken,
        pageId: 'page-2',
      }),
    ).rejects.toMatchObject({
      response: { code: META_OAUTH_ERROR_CODES.PAGE_SELECTION_EXPIRED },
    });
  });

  it('never returns secrets in success payloads', async () => {
    const { service } = createService();

    const result = JSON.stringify(await issueAndExchange(service));

    expect(result).not.toContain('byo-app-secret');
    expect(result).not.toContain('page-short-1');
    expect(result).not.toContain('user-short');
  });
});
