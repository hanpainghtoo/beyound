import {
  assertProductionBootstrapDatabaseConfig,
  getProductionBootstrapAdminConfig,
  productionSubscriptionPlans,
} from './production-bootstrap.data';

describe('production bootstrap data', () => {
  it('rejects .local bootstrap admin addresses', () => {
    expect(() =>
      getProductionBootstrapAdminConfig({
        PRODUCTION_PLATFORM_ADMIN_FULL_NAME: 'Launch Admin',
        PRODUCTION_PLATFORM_ADMIN_EMAIL: 'admin@example.local',
        PRODUCTION_PLATFORM_ADMIN_PASSWORD: 'StrongPassword!123',
      }),
    ).toThrow(/must not use a \.local address/);
  });

  it('does not contain demo tenants or .local seed identities', () => {
    expect(
      JSON.stringify(productionSubscriptionPlans).includes('KME-DEMO'),
    ).toBe(false);
    expect(JSON.stringify(productionSubscriptionPlans).includes('.local')).toBe(
      false,
    );
  });

  it('requires explicit database configuration for production bootstrap', () => {
    expect(() =>
      assertProductionBootstrapDatabaseConfig({
        DB_HOST: '',
        DB_PORT: '5432',
        DB_USERNAME: 'zayos',
        DB_PASSWORD: 'db-password',
        DB_NAME: 'zayos',
      }),
    ).toThrow(/DB_HOST is required/);
  });
});
