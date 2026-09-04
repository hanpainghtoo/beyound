import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  InternalServiceAuthGuard,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  signServiceToken,
} from '@zayos/internal-service-auth';
import { AppController } from './app.controller';

const signingKey = 'test-internal-service-token-signing-key-32-chars';

describe('integration-service internal auth', () => {
  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = signingKey;
  });

  it('protects provider routes with a service guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.getProviders)).toHaveLength(1);
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.send)).toHaveLength(1);
  });

  it('rejects missing and wrong-scope tokens', () => {
    const guard = providerTestGuard();
    expect(() => guard.canActivate(context())).toThrow(/Missing service token/);
    expect(() =>
      guard.canActivate(context(token([SERVICE_SCOPES.PROVIDER_SEND]))),
    ).toThrow(/required scope/);
  });

  it('allows core service with provider:test scope', () => {
    expect(providerTestGuard().canActivate(context(token([SERVICE_SCOPES.PROVIDER_TEST])))).toBe(true);
  });
});

function providerTestGuard() {
  return new InternalServiceAuthGuard({
    audience: SERVICE_IDENTITIES.INTEGRATION,
    scopes: [SERVICE_SCOPES.PROVIDER_TEST],
    allowedCallers: [SERVICE_IDENTITIES.CORE, SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  });
}

function token(scopes: string[]) {
  return signServiceToken({
    signingKey,
    subject: SERVICE_IDENTITIES.CORE,
    audience: SERVICE_IDENTITIES.INTEGRATION,
    scopes,
  });
}

function context(bearerToken?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: bearerToken ? { authorization: `Bearer ${bearerToken}` } : {},
      }),
    }),
  } as any;
}
