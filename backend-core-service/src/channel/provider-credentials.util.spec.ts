import {
  decryptProviderCredentials,
  decryptProviderCredentialsWithFallback,
  encryptProviderCredentials,
} from './provider-credentials.util';

describe('provider credential encryption', () => {
  it('decrypts credentials encrypted with the legacy JWT secret fallback', () => {
    const legacySecret = 'legacy-jwt-secret-value';
    const currentSecret = 'current-provider-encryption-secret';
    const envelope = encryptProviderCredentials(
      { botToken: '123:legacy' },
      legacySecret,
    );
    process.env.JWT_SECRET = legacySecret;

    expect(decryptProviderCredentials(envelope, currentSecret)).toEqual({
      botToken: '123:legacy',
    });
    expect(
      decryptProviderCredentialsWithFallback(envelope, [
        currentSecret,
        legacySecret,
      ]),
    ).toMatchObject({
      credentials: { botToken: '123:legacy' },
      secret: legacySecret,
    });
    delete process.env.JWT_SECRET;
  });
});
