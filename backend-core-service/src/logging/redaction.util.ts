export const REDACTED = '[REDACTED]';
const UNSUPPORTED = '[UNSUPPORTED]';
const CIRCULAR = '[CIRCULAR]';

const sensitiveKeys = new Set(
  [
    'password',
    'passwordHash',
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'token',
    'resetToken',
    'inviteToken',
    'emailVerificationToken',
    'accessToken',
    'refreshToken',
    'authorization',
    'cookie',
    'setCookie',
    'clientSecret',
    'appSecret',
    'verifyToken',
    'authToken',
    'apiKey',
    'secret',
    'credentials',
    'credential',
    'encryptedCredentials',
    'resetUrl',
    'inviteUrl',
    'verificationUrl',
    'signedUrl',
    'signature',
    'xApiKey',
    'xInternalServiceToken',
    'xHubSignature',
    'xHubSignature256',
    'xLineSignature',
    'xTelegramBotApiSecretToken',
  ].map(normalizeKey),
);

const wholeUrlKeys = new Set([
  'reseturl',
  'inviteurl',
  'verificationurl',
  'signedurl',
]);
const sensitiveQueryParameters = new Set([
  'token',
  'signature',
  'sig',
  'expires',
  'tenant',
  'key',
  'secret',
  'code',
]);

export function normalizeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

export function isSensitiveFieldName(key: string) {
  const normalized = normalizeKey(key);
  return sensitiveKeys.has(normalized);
}

function shouldRedactWholeUrl(key: string) {
  return wholeUrlKeys.has(normalizeKey(key));
}

function sanitizeUrlValue(value: string) {
  try {
    const url = new URL(value);
    let changed = false;
    for (const parameter of sensitiveQueryParameters) {
      if (url.searchParams.has(parameter)) {
        url.searchParams.set(parameter, REDACTED);
        changed = true;
      }
    }
    return changed ? url.toString() : value;
  } catch {
    return value;
  }
}

function sanitizeString(key: string | undefined, value: string) {
  if (key && shouldRedactWholeUrl(key)) return REDACTED;
  return redactSensitiveStringPatterns(sanitizeUrlValue(value));
}

function redactSensitiveStringPatterns(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b(password|password_hash|passwordHash|token|accessToken|refreshToken|inviteToken|resetToken|apiKey|secret|signature)=([^&\s]+)/gi,
      (_match, name) => `${name}=${REDACTED}`,
    );
}

export function redactSensitiveData<T>(value: T): T {
  return redactValue(value, undefined, new WeakSet<object>()) as T;
}

export function redactHeaders(headers: Record<string, any> | undefined | null) {
  if (!headers) return {};
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(headers)) {
    sanitized[key] = isSensitiveFieldName(key)
      ? REDACTED
      : redactValue(value, key, new WeakSet<object>());
  }
  return sanitized;
}

function redactValue(
  value: unknown,
  key: string | undefined,
  seen: WeakSet<object>,
): unknown {
  if (key && isSensitiveFieldName(key)) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(key, value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (
    typeof value === 'bigint' ||
    typeof value === 'symbol' ||
    typeof value === 'function'
  )
    return UNSUPPORTED;
  if (value instanceof Date) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(key, value.message),
    };
  }
  if (typeof value !== 'object') return UNSUPPORTED;
  if (seen.has(value)) return CIRCULAR;
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.map((item) => redactValue(item, key, seen));
    seen.delete(value);
    return result;
  }

  const result: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    result[entryKey] = redactValue(entryValue, entryKey, seen);
  }
  seen.delete(value);
  return result;
}
