import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  const validProductionEnvironment = {
    NODE_ENV: 'production',
    DB_HOST: 'db.internal',
    DB_PORT: '5432',
    DB_USERNAME: 'zayos',
    DB_PASSWORD: 'db-password',
    DB_NAME: 'zayos',
    REDIS_HOST: 'redis.internal',
    REDIS_PORT: '6379',
    JWT_SECRET: 'valid-jwt-secret-value-with-32-characters!',
    JWT_REFRESH_SECRET: 'valid-refresh-secret-value-with-32-chars!',
    FRONTEND_URLS: 'https://zayos.com.mm,https://admin.zayos.com.mm',
    INTERNAL_SERVICE_TOKEN_ISSUER: 'zayos-test-internal-services',
    INTERNAL_SERVICE_TOKEN_SIGNING_KEY:
      'valid-internal-token-signing-key-with-32-chars',
    PROVIDER_CREDENTIAL_ENCRYPTION_KEY:
      'valid-provider-credential-key-32chars!',
    WORKSPACE_PUBLIC_APP_URL: 'https://zayos.com.mm',
    PLATFORM_CONSOLE_PUBLIC_APP_URL: 'https://admin.zayos.com.mm',
    WEBHOOK_PUBLIC_BASE_URL: 'https://api.zayos.com.mm',
    TELEGRAM_MANAGER_BOT_TOKEN: '123456789:validTelegramManagerBotTokenValue',
    TELEGRAM_MANAGER_BOT_USERNAME: 'ZayOSManagerBot',
    TELEGRAM_MANAGER_WEBHOOK_SECRET: 'valid-telegram-manager-webhook-secret',
    TELEGRAM_MANAGER_WEBHOOK_URL:
      'https://hooks.zayos.com.mm/webhooks/telegram/manager',
    TELEGRAM_MERCHANT_WEBHOOK_BASE_URL: 'https://hooks.zayos.com.mm',
    TELEGRAM_TOKEN_ENCRYPTION_KEY: 'valid-telegram-token-key-with-32-chars',
  };

  it('fails when JWT_SECRET is absent in production', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        JWT_SECRET: undefined,
      }),
    ).toThrow(/JWT_SECRET is required in production/);
  });

  it('fails when JWT_SECRET uses a known placeholder', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        JWT_SECRET: 'your-secret-key',
      }),
    ).toThrow(/JWT_SECRET must not use a known placeholder value/);
  });

  it('accepts valid production-like values', () => {
    expect(validateEnvironment(validProductionEnvironment)).toEqual(
      validProductionEnvironment,
    );
  });

  it('fails when a production public app URL is missing', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        WORKSPACE_PUBLIC_APP_URL: undefined,
      }),
    ).toThrow(/WORKSPACE_PUBLIC_APP_URL is required in production/);
  });

  it('fails when a production public app URL uses localhost', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        WORKSPACE_PUBLIC_APP_URL: 'http://localhost:3000',
      }),
    ).toThrow(
      /WORKSPACE_PUBLIC_APP_URL must be publicly reachable in production/,
    );
  });

  it('does not fail core startup when optional Telegram manager config is missing', () => {
    expect(
      validateEnvironment({
        ...validProductionEnvironment,
        TELEGRAM_MANAGER_BOT_TOKEN: undefined,
      }),
    ).toEqual({
      ...validProductionEnvironment,
      TELEGRAM_MANAGER_BOT_TOKEN: undefined,
    });
  });
});
