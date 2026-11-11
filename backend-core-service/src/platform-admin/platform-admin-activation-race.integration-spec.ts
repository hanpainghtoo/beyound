import { DataSource, Repository } from 'typeorm';
import { URL } from 'node:url';
import { Tenant } from '../tenant/entities/tenant.entity';
import { MetaApp } from '../channel/entities/meta-app.entity';
import { PlatformAdmin } from '../auth/entities/platform-admin.entity';
import { TenantChannelSettings } from '../tenant/entities/tenant-channel-settings.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { TenantChannelSettingsService } from '../tenant/tenant-channel-settings.service';
import { MetaAppResolver } from '../channel/meta-app-resolver.service';
import { PlatformAdminService } from './platform-admin.service';
import { encryptProviderCredentials } from '../channel/provider-credentials.util';

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl)
  throw new Error('TEST_DATABASE_URL is required for integration tests');
const parsedUrl = new URL(rawUrl);
const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
if (!databaseName.toLowerCase().includes('test')) {
  throw new Error(
    `Refusing integration tests: database name must contain "test", got "${databaseName}"`,
  );
}

const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

describe('BYO activation gate race (real PostgreSQL)', () => {
  let dataSource: DataSource;
  let tenants: Repository<Tenant>;
  let metaApps: Repository<MetaApp>;
  let service: PlatformAdminService;
  const realFetch = global.fetch;

  beforeAll(async () => {
    process.env.DB_HOST = parsedUrl.hostname;
    process.env.DB_PORT = parsedUrl.port || '5432';
    process.env.DB_USERNAME = decodeURIComponent(parsedUrl.username);
    process.env.DB_PASSWORD = decodeURIComponent(parsedUrl.password);
    process.env.DB_NAME = databaseName;
    process.env.DB_SYNCHRONIZE = 'false';
    process.env.NODE_ENV = 'test';
    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = ENCRYPTION_KEY;
    // Own DataSource with exactly the entities under test: the shared
    // AppDataSource does not register MetaApp.
    dataSource = new DataSource({
      type: 'postgres',
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port || '5432'),
      username: decodeURIComponent(parsedUrl.username),
      password: decodeURIComponent(parsedUrl.password),
      database: databaseName,
      entities: [
        Tenant,
        MetaApp,
        TenantChannelSettings,
        PlatformAdmin,
        TenantUser,
      ],
      synchronize: false,
    });
    await dataSource.initialize();
    tenants = dataSource.getRepository(Tenant);
    metaApps = dataSource.getRepository(MetaApp);
    const settingsRepository = dataSource.getRepository(TenantChannelSettings);
    const settings = new TenantChannelSettingsService(
      settingsRepository,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    const resolver = new MetaAppResolver(metaApps, settings);
    const fillers = Array.from({ length: 20 }, () => ({}));
    const args = [
      tenants,
      ...fillers,
      undefined,
      undefined,
      undefined,
      undefined,
      settings,
      resolver,
      metaApps,
    ];
    const Ctor = PlatformAdminService as unknown as new (
      ...ctorArgs: unknown[]
    ) => PlatformAdminService;
    service = new Ctor(...args);
  });

  afterAll(async () => {
    global.fetch = realFetch;
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('a rotate landing mid-validation cannot promote the stale row', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tenant = await tenants.save(
      tenants.create({
        tenantCode: `race-${suffix}`,
        companyName: 'Race tenant',
        contactEmail: `${suffix}@example.test`,
        status: 'active',
        orderSettings: {},
        orderExpirySettings: {},
      }),
    );
    const app = await metaApps.save(
      metaApps.create({
        tenantId: tenant.id,
        kind: 'byo',
        appId: 'race-app-id',
        appSecretEncrypted: encryptProviderCredentials(
          { value: 'original-secret' },
          ENCRYPTION_KEY,
        ),
        verifyTokenEncrypted: encryptProviderCredentials(
          { value: 'race-verify-token' },
          ENCRYPTION_KEY,
        ),
        webhookPathSegment: `t_race_${suffix.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}`,
        status: 'pending',
        loginConfigId: null,
        liveConfirmedAt: new Date(),
        liveConfirmedBy: null,
        lastValidatedAt: null,
      }),
    );
    try {
      let releaseGraph!: () => void;
      const graphGate = new Promise<void>((resolve) => {
        releaseGraph = resolve;
      });
      global.fetch = jest.fn(async () => {
        await graphGate;
        return {
          ok: true,
          json: () => Promise.resolve({ id: 'race-app-id' }),
        };
      }) as never;

      const validating = service.validateTenantFacebookApp(tenant.id);
      // Concurrent credential rotate: clears confirmation, sets pending.
      await service.updateTenantFacebookApp(
        tenant.id,
        'race-app-id',
        'rotated-secret',
        null,
      );
      releaseGraph();
      const result = await validating;

      const finalRow = await metaApps.findOne({ where: { id: app.id } });
      expect(finalRow?.status).toBe('pending');
      expect(finalRow?.liveConfirmedAt).toBeNull();
      expect(result.validation).toMatchObject({ valid: false });
      expect(String(result.validation?.message)).toMatch(
        /changed during validation/,
      );
    } finally {
      await metaApps.delete({ tenantId: tenant.id });
      await tenants.delete(tenant.id);
      global.fetch = realFetch;
    }
  });

  it('a rotate landing mid-uncheck makes the uncheck lose', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tenant = await tenants.save(
      tenants.create({
        tenantCode: `uncheck-race-${suffix}`,
        companyName: 'Uncheck race tenant',
        contactEmail: `${suffix}@example.test`,
        status: 'active',
        orderSettings: {},
        orderExpirySettings: {},
      }),
    );
    await metaApps.save(
      metaApps.create({
        tenantId: tenant.id,
        kind: 'byo',
        appId: 'uncheck-app-id',
        appSecretEncrypted: encryptProviderCredentials(
          { value: 'original-secret' },
          ENCRYPTION_KEY,
        ),
        verifyTokenEncrypted: encryptProviderCredentials(
          { value: 'uncheck-verify-token' },
          ENCRYPTION_KEY,
        ),
        webhookPathSegment: `t_uncheck_${suffix.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}`,
        status: 'valid',
        loginConfigId: null,
        liveConfirmedAt: new Date(),
        liveConfirmedBy: null,
        lastValidatedAt: new Date(),
      }),
    );
    const originalFindOne = metaApps.findOne.bind(metaApps);
    let firstLoad = true;
    let markLoaded!: () => void;
    let releaseLoad!: () => void;
    const loadedGate = new Promise<void>((resolve) => {
      markLoaded = resolve;
    });
    const writeGate = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    metaApps.findOne = (async (options) => {
      const row = await originalFindOne(options);
      if (firstLoad && row?.kind === 'byo') {
        firstLoad = false;
        markLoaded();
        await writeGate;
      }
      return row;
    }) as typeof metaApps.findOne;
    try {
      const unchecking = service.updateTenantFacebookLiveConfirmation(
        tenant.id,
        false,
        null,
      );
      await loadedGate;
      await service.updateTenantFacebookApp(
        tenant.id,
        'uncheck-rotated-app-id',
        'rotated-secret',
        null,
      );
      releaseLoad();

      await expect(unchecking).rejects.toThrow(
        'Concurrent modification detected. Please retry.',
      );
      const finalRow = await originalFindOne({ where: { tenantId: tenant.id } });
      expect(finalRow?.appId).toBe('uncheck-rotated-app-id');
      expect(finalRow?.status).toBe('pending');
      expect(finalRow?.liveConfirmedAt).toBeNull();
    } finally {
      metaApps.findOne = originalFindOne as typeof metaApps.findOne;
      await metaApps.delete({ tenantId: tenant.id });
      await tenants.delete(tenant.id);
    }
  });

  it('a second rotate makes the first rotate lose', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tenant = await tenants.save(
      tenants.create({
        tenantCode: `rotate-race-${suffix}`,
        companyName: 'Rotate race tenant',
        contactEmail: `${suffix}@example.test`,
        status: 'active',
        orderSettings: {},
        orderExpirySettings: {},
      }),
    );
    await metaApps.save(
      metaApps.create({
        tenantId: tenant.id,
        kind: 'byo',
        appId: 'rotate-app-id',
        appSecretEncrypted: encryptProviderCredentials(
          { value: 'original-secret' },
          ENCRYPTION_KEY,
        ),
        verifyTokenEncrypted: encryptProviderCredentials(
          { value: 'rotate-verify-token' },
          ENCRYPTION_KEY,
        ),
        webhookPathSegment: `t_rotate_${suffix.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}`,
        status: 'valid',
        loginConfigId: null,
        liveConfirmedAt: new Date(),
        liveConfirmedBy: null,
        lastValidatedAt: new Date(),
      }),
    );
    const originalFindOne = metaApps.findOne.bind(metaApps);
    let firstLoad = true;
    let releaseLoad!: () => void;
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    metaApps.findOne = (async (options) => {
      const row = await originalFindOne(options);
      if (firstLoad && row?.kind === 'byo') {
        firstLoad = false;
        await loadGate;
      }
      return row;
    }) as typeof metaApps.findOne;
    try {
      const firstRotate = service.updateTenantFacebookApp(
        tenant.id,
        'first-rotated-app-id',
        'first-rotated-secret',
        null,
      );
      while (firstLoad) await new Promise((resolve) => setImmediate(resolve));
      await service.updateTenantFacebookApp(
        tenant.id,
        'second-rotated-app-id',
        'second-rotated-secret',
        null,
      );
      releaseLoad();

      await expect(firstRotate).rejects.toThrow(
        'Concurrent modification detected. Please retry.',
      );
      const finalRow = await originalFindOne({ where: { tenantId: tenant.id } });
      expect(finalRow?.appId).toBe('second-rotated-app-id');
      expect(finalRow?.status).toBe('pending');
      expect(finalRow?.liveConfirmedAt).toBeNull();
    } finally {
      metaApps.findOne = originalFindOne as typeof metaApps.findOne;
      await metaApps.delete({ tenantId: tenant.id });
      await tenants.delete(tenant.id);
    }
  });

  it('unchecking a confirmed valid app clears confirmation and returns to pending', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tenant = await tenants.save(
      tenants.create({
        tenantCode: `uncheck-valid-${suffix}`,
        companyName: 'Uncheck valid tenant',
        contactEmail: `${suffix}@example.test`,
        status: 'active',
        orderSettings: {},
        orderExpirySettings: {},
      }),
    );
    await metaApps.save(
      metaApps.create({
        tenantId: tenant.id,
        kind: 'byo',
        appId: 'uncheck-valid-app-id',
        appSecretEncrypted: encryptProviderCredentials(
          { value: 'original-secret' },
          ENCRYPTION_KEY,
        ),
        verifyTokenEncrypted: encryptProviderCredentials(
          { value: 'uncheck-valid-verify-token' },
          ENCRYPTION_KEY,
        ),
        webhookPathSegment: `t_uncheck_valid_${suffix.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 35)}`,
        status: 'valid',
        loginConfigId: null,
        liveConfirmedAt: new Date(),
        liveConfirmedBy: null,
        lastValidatedAt: new Date(),
      }),
    );
    try {
      await service.updateTenantFacebookLiveConfirmation(tenant.id, false, null);

      const finalRow = await metaApps.findOne({ where: { tenantId: tenant.id } });
      expect(finalRow?.status).toBe('pending');
      expect(finalRow?.liveConfirmedAt).toBeNull();
      expect(finalRow?.liveConfirmedBy).toBeNull();
    } finally {
      await metaApps.delete({ tenantId: tenant.id });
      await tenants.delete(tenant.id);
    }
  });

  it('accepts sequential validate, rotate, and live confirmation updates', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tenant = await tenants.save(
      tenants.create({
        tenantCode: `precision-${suffix}`,
        companyName: 'Precision tenant',
        contactEmail: `${suffix}@example.test`,
        status: 'active',
        orderSettings: {},
        orderExpirySettings: {},
      }),
    );
    await metaApps.save(
      metaApps.create({
        tenantId: tenant.id,
        kind: 'byo',
        appId: 'precision-app-id',
        appSecretEncrypted: encryptProviderCredentials(
          { value: 'original-secret' },
          ENCRYPTION_KEY,
        ),
        verifyTokenEncrypted: encryptProviderCredentials(
          { value: 'precision-verify-token' },
          ENCRYPTION_KEY,
        ),
        webhookPathSegment: `t_precision_${suffix.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}`,
        status: 'pending',
        loginConfigId: null,
        liveConfirmedAt: null,
        liveConfirmedBy: null,
        lastValidatedAt: null,
      }),
    );
    try {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: () => Promise.resolve({ id: 'precision-app-id' }),
      })) as never;

      const validation = await service.validateTenantFacebookApp(tenant.id);
      expect(validation.validation).toMatchObject({ valid: false });
      expect(validation.validation?.message).toMatch(/not confirmed yet/);

      const rotated = await service.updateTenantFacebookApp(
        tenant.id,
        'precision-app-id-rotated',
        'rotated-secret',
        null,
      );
      expect(rotated).toBeDefined();

      const confirmed = await service.updateTenantFacebookLiveConfirmation(
        tenant.id,
        true,
        null,
      );
      expect(confirmed).toBeDefined();

      const finalRow = await metaApps.findOne({ where: { tenantId: tenant.id } });
      expect(finalRow?.appId).toBe('precision-app-id-rotated');
      expect(finalRow?.status).toBe('pending');
      expect(finalRow?.liveConfirmedAt).toBeInstanceOf(Date);
    } finally {
      await metaApps.delete({ tenantId: tenant.id });
      await tenants.delete(tenant.id);
      global.fetch = realFetch;
    }
  });
});
