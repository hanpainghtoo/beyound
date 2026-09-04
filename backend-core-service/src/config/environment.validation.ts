import { assertSafeSecret, MINIMUM_JWT_SECRET_LENGTH } from './secret-policy';
import { normalizePublicBaseUrl } from './public-base-url';

type Environment = Record<string, string | undefined>;

const productionRequiredKeys = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_NAME',
  'REDIS_HOST',
  'REDIS_PORT',
  'JWT_SECRET',
  'FRONTEND_URLS',
  'INTERNAL_SERVICE_TOKEN_ISSUER',
  'INTERNAL_SERVICE_TOKEN_SIGNING_KEY',
  'WORKSPACE_PUBLIC_APP_URL',
  'PLATFORM_CONSOLE_PUBLIC_APP_URL',
  'WEBHOOK_PUBLIC_BASE_URL',
];

export function validateEnvironment(config: Environment) {
  const nodeEnv = config.NODE_ENV || 'development';
  const errors: string[] = [];

  if (nodeEnv === 'production') {
    for (const key of productionRequiredKeys) {
      if (!config[key]?.trim()) {
        errors.push(`${key} is required in production.`);
      }
    }

    for (const [envVarName, value, minimumLength] of [
      ['JWT_SECRET', config.JWT_SECRET, MINIMUM_JWT_SECRET_LENGTH],
      [
        'JWT_REFRESH_SECRET',
        config.JWT_REFRESH_SECRET || config.JWT_SECRET,
        MINIMUM_JWT_SECRET_LENGTH,
      ],
      [
        'INTERNAL_SERVICE_TOKEN_SIGNING_KEY',
        config.INTERNAL_SERVICE_TOKEN_SIGNING_KEY,
        32,
      ],
      [
        'PROVIDER_CREDENTIAL_ENCRYPTION_KEY',
        config.PROVIDER_CREDENTIAL_ENCRYPTION_KEY,
        32,
      ],
    ] as const) {
      try {
        assertSafeSecret(value, {
          envVarName,
          minimumLength,
          allowMissing: envVarName === 'PROVIDER_CREDENTIAL_ENCRYPTION_KEY',
        });
      } catch (error) {
        if (
          !(
            envVarName === 'PROVIDER_CREDENTIAL_ENCRYPTION_KEY' &&
            !config.PROVIDER_CREDENTIAL_ENCRYPTION_KEY?.trim()
          )
        ) {
          errors.push(
            error instanceof Error
              ? error.message
              : `${envVarName} is invalid.`,
          );
        }
      }
    }

    if (config.DB_SYNCHRONIZE === 'true') {
      errors.push('DB_SYNCHRONIZE=true is not allowed in production.');
    }

    if (config.FRONTEND_URLS?.includes('*')) {
      errors.push(
        'FRONTEND_URLS cannot contain wildcard origins in production.',
      );
    }

    for (const envVarName of [
      'WORKSPACE_PUBLIC_APP_URL',
      'PLATFORM_CONSOLE_PUBLIC_APP_URL',
      'WEBHOOK_PUBLIC_BASE_URL',
    ] as const) {
      try {
        normalizePublicBaseUrl(config[envVarName] || '', {
          envVarName,
          allowLocalhost: false,
        });
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : `${envVarName} is invalid.`,
        );
      }
    }
  }

  for (const numericKey of [
    'PORT',
    'DB_PORT',
    'BCRYPT_ROUNDS',
    'THROTTLE_TTL',
    'THROTTLE_LIMIT',
    'AUTH_LOGIN_RATE_LIMIT',
    'AUTH_REGISTER_RATE_LIMIT',
    'AUTH_REFRESH_RATE_LIMIT',
    'AUTH_PASSWORD_RESET_RATE_LIMIT',
    'AUTH_PASSWORD_RESET_CONFIRM_RATE_LIMIT',
  ]) {
    if (config[numericKey] && Number.isNaN(Number(config[numericKey]))) {
      errors.push(`${numericKey} must be numeric.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  return config;
}
