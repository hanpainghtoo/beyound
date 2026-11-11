import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  signServiceToken,
  verifyServiceToken,
} from '@zayos/internal-service-auth';

const signingKey = 'test-internal-service-token-signing-key-32-chars';

describe('internal service auth', () => {
  it('accepts a valid scoped token', () => {
    const token = signServiceToken({
      signingKey,
      issuer: 'zayos-test',
      subject: SERVICE_IDENTITIES.CORE,
      audience: SERVICE_IDENTITIES.INTEGRATION,
      scopes: [SERVICE_SCOPES.PROVIDER_SEND],
      nowMs: 1_800_000_000_000,
    });

    expect(
      verifyServiceToken(token, {
        signingKey,
        issuer: 'zayos-test',
        audience: SERVICE_IDENTITIES.INTEGRATION,
        requiredScopes: [SERVICE_SCOPES.PROVIDER_SEND],
        allowedCallers: [SERVICE_IDENTITIES.CORE],
        nowMs: 1_800_000_001_000,
      }),
    ).toMatchObject({
      sub: SERVICE_IDENTITIES.CORE,
      aud: SERVICE_IDENTITIES.INTEGRATION,
      scopes: [SERVICE_SCOPES.PROVIDER_SEND],
    });
  });

  it('rejects missing, malformed, expired, wrong audience and wrong scope tokens', () => {
    expect(() =>
      verifyServiceToken(undefined, {
        signingKey,
        audience: SERVICE_IDENTITIES.INTEGRATION,
      }),
    ).toThrow(/Missing service token/);

    expect(() =>
      verifyServiceToken('not-a-jwt', {
        signingKey,
        audience: SERVICE_IDENTITIES.INTEGRATION,
      }),
    ).toThrow(/Malformed service token/);

    const expired = signServiceToken({
      signingKey,
      subject: SERVICE_IDENTITIES.CORE,
      audience: SERVICE_IDENTITIES.INTEGRATION,
      scopes: [SERVICE_SCOPES.PROVIDER_SEND],
      ttlSeconds: 60,
      nowMs: 1_800_000_000_000,
    });
    expect(() =>
      verifyServiceToken(expired, {
        signingKey,
        audience: SERVICE_IDENTITIES.INTEGRATION,
        requiredScopes: [SERVICE_SCOPES.PROVIDER_SEND],
        nowMs: 1_800_000_120_000,
        clockSkewSeconds: 0,
      }),
    ).toThrow(/Expired service token/);

    const wrongAudience = signServiceToken({
      signingKey,
      subject: SERVICE_IDENTITIES.CORE,
      audience: SERVICE_IDENTITIES.CHAT_INGESTION,
      scopes: [SERVICE_SCOPES.PROVIDER_SEND],
    });
    expect(() =>
      verifyServiceToken(wrongAudience, {
        signingKey,
        audience: SERVICE_IDENTITIES.INTEGRATION,
      }),
    ).toThrow(/audience/);

    const wrongScope = signServiceToken({
      signingKey,
      subject: SERVICE_IDENTITIES.CORE,
      audience: SERVICE_IDENTITIES.INTEGRATION,
      scopes: [SERVICE_SCOPES.PROVIDER_TEST],
    });
    expect(() =>
      verifyServiceToken(wrongScope, {
        signingKey,
        audience: SERVICE_IDENTITIES.INTEGRATION,
        requiredScopes: [SERVICE_SCOPES.PROVIDER_SEND],
      }),
    ).toThrow(/required scope/);
  });

  it('rejects algorithm substitution and unknown callers without exposing secrets', () => {
    const unsigned = [
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
        'base64url',
      ),
      Buffer.from(
        JSON.stringify({
          iss: 'zayos-internal-services',
          sub: SERVICE_IDENTITIES.CORE,
          aud: SERVICE_IDENTITIES.INTEGRATION,
          iat: 1,
          exp: 9_999_999_999,
          jti: 'jti-for-test',
          scope: SERVICE_SCOPES.PROVIDER_SEND,
        }),
      ).toString('base64url'),
      '',
    ].join('.');

    expect(() =>
      verifyServiceToken(unsigned, {
        signingKey,
        audience: SERVICE_IDENTITIES.INTEGRATION,
      }),
    ).toThrow(/Invalid service token/);

    const disallowedCaller = signServiceToken({
      signingKey,
      subject: SERVICE_IDENTITIES.INTEGRATION,
      audience: SERVICE_IDENTITIES.CHAT_INGESTION,
      scopes: [SERVICE_SCOPES.CHAT_INGEST],
    });

    expect(() =>
      verifyServiceToken(disallowedCaller, {
        signingKey,
        audience: SERVICE_IDENTITIES.CHAT_INGESTION,
        requiredScopes: [SERVICE_SCOPES.CHAT_INGEST],
        allowedCallers: [SERVICE_IDENTITIES.WEBHOOK_HANDLER],
      }),
    ).toThrow(/not allowed/);
  });
});
