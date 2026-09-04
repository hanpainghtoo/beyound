const knownPlaceholderSecrets = new Set([
  'your-secret-key',
  'your-super-secret-jwt-key-here',
  'local-dev-change-me',
  'changeme',
  'change-me',
  'replace-me',
  'replace_this_secret',
  'placeholder-secret',
  'placeholder',
]);

export const MINIMUM_JWT_SECRET_LENGTH = 32;

export function isKnownPlaceholderSecret(value: string) {
  return knownPlaceholderSecrets.has(value.trim().toLowerCase());
}

export function assertSafeSecret(
  value: string | undefined,
  options: {
    envVarName: string;
    minimumLength?: number;
    allowMissing?: boolean;
  },
) {
  const normalized = value?.trim() || '';
  if (!normalized) {
    if (options.allowMissing) return;
    throw new Error(`${options.envVarName} is required.`);
  }

  if (isKnownPlaceholderSecret(normalized)) {
    throw new Error(
      `${options.envVarName} must not use a known placeholder value.`,
    );
  }

  if (
    (options.minimumLength || 0) > 0 &&
    normalized.length < (options.minimumLength || 0)
  ) {
    throw new Error(
      `${options.envVarName} must be at least ${options.minimumLength} characters.`,
    );
  }
}
