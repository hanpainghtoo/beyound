import { redactHeaders, redactSensitiveData, REDACTED } from './redaction.util';

describe('redaction utility', () => {
  it('redacts sensitive fields at the root, nested objects, and arrays', () => {
    const input = {
      password: 'secret-password',
      profile: {
        password_hash: 'hash',
        items: [{ accessToken: 'access-token' }, { safe: 'value' }],
      },
    };

    const output = redactSensitiveData(input);

    expect(output).toEqual({
      password: REDACTED,
      profile: {
        password_hash: REDACTED,
        items: [{ accessToken: REDACTED }, { safe: 'value' }],
      },
    });
    expect(input.profile.items[0].accessToken).toBe('access-token');
  });

  it('redacts field-name variants with different case and separators', () => {
    expect(
      redactSensitiveData({
        PasswordHash: 'hash',
        'refresh-token': 'refresh',
        current_password: 'current',
        xApiKey: 'api-key',
      }),
    ).toEqual({
      PasswordHash: REDACTED,
      'refresh-token': REDACTED,
      current_password: REDACTED,
      xApiKey: REDACTED,
    });
  });

  it('redacts authorization, cookies, and internal service headers', () => {
    expect(
      redactHeaders({
        authorization: 'Bearer jwt',
        Cookie: 'session=abc',
        'set-cookie': 'session=abc',
        'x-internal-service-token': 'internal',
        'x-hub-signature-256': 'signature',
        'user-agent': 'jest',
      }),
    ).toEqual({
      authorization: REDACTED,
      Cookie: REDACTED,
      'set-cookie': REDACTED,
      'x-internal-service-token': REDACTED,
      'x-hub-signature-256': REDACTED,
      'user-agent': 'jest',
    });
  });

  it('redacts token-bearing URLs and sensitive query parameters', () => {
    const output = redactSensitiveData({
      resetUrl: 'https://zayos.com.mm/reset-password?token=raw-token',
      callbackUrl:
        'https://api.zayos.com.mm/callback?code=oauth-code&safe=yes&signature=sig',
    });

    expect(output.resetUrl).toBe(REDACTED);
    expect(output.callbackUrl).not.toContain('oauth-code');
    expect(output.callbackUrl).not.toContain('signature=sig');
    expect(output.callbackUrl).toContain('safe=yes');
  });

  it('handles circular references and unsupported values without raw fallback', () => {
    const input: Record<string, any> = { safe: 'value' };
    input.self = input;
    input.big = BigInt(1);
    input.fn = () => 'secret';

    const output = redactSensitiveData(input);

    expect(output).toEqual({
      safe: 'value',
      self: '[CIRCULAR]',
      big: '[UNSUPPORTED]',
      fn: '[UNSUPPORTED]',
    });
  });
});
