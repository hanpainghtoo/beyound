const placeholderUrlValues = new Set([
  'http://example.com',
  'https://example.com',
  'http://example.invalid',
  'https://example.invalid',
]);

const localHostnames = new Set(['localhost', '127.0.0.1', '::1']);

export class PublicBaseUrlConfigurationError extends Error {
  constructor(
    message: string,
    public readonly envVarName?: string,
  ) {
    super(message);
    this.name = 'PublicBaseUrlConfigurationError';
  }
}

export function normalizePublicBaseUrl(
  rawValue: string,
  options: { envVarName?: string; allowLocalhost?: boolean } = {},
) {
  const envVarName = options.envVarName || 'PUBLIC_BASE_URL';
  const trimmed = rawValue.trim();

  if (!trimmed) {
    throw new PublicBaseUrlConfigurationError(
      `Missing required environment variable: ${envVarName}`,
      envVarName,
    );
  }

  if (placeholderUrlValues.has(trimmed.toLowerCase())) {
    throw new PublicBaseUrlConfigurationError(
      `Invalid ${envVarName}.`,
      envVarName,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PublicBaseUrlConfigurationError(
      `Invalid ${envVarName}.`,
      envVarName,
    );
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new PublicBaseUrlConfigurationError(
      `Invalid ${envVarName}.`,
      envVarName,
    );
  }

  if (
    !options.allowLocalhost &&
    localHostnames.has(parsed.hostname.toLowerCase())
  ) {
    throw new PublicBaseUrlConfigurationError(
      `${envVarName} must be publicly reachable in production.`,
      envVarName,
    );
  }

  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';

  return parsed.toString().replace(/\/$/, '');
}

export function resolvePublicBaseUrl(
  env: Record<string, string | undefined>,
  envVarName: string,
  options: {
    fallbackEnvVarNames?: string[];
    allowMissingInDevelopment?: boolean;
  } = {},
) {
  const nodeEnv = env.NODE_ENV || 'development';
  const candidateKeys = [envVarName, ...(options.fallbackEnvVarNames || [])];
  const configuredKey = candidateKeys.find((key) => env[key]?.trim());

  if (!configuredKey) {
    if (
      nodeEnv === 'production' ||
      options.allowMissingInDevelopment !== true
    ) {
      throw new PublicBaseUrlConfigurationError(
        `Missing required environment variable: ${envVarName}`,
        envVarName,
      );
    }
    return null;
  }

  return normalizePublicBaseUrl(env[configuredKey] as string, {
    envVarName: configuredKey,
    allowLocalhost: nodeEnv !== 'production',
  });
}

export function isPublicBaseUrlConfigurationError(
  error: unknown,
): error is PublicBaseUrlConfigurationError {
  return error instanceof PublicBaseUrlConfigurationError;
}
