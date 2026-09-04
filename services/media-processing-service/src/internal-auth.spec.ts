import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  InternalServiceAuthGuard,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  signServiceToken,
} from '@zayos/internal-service-auth';
import { AppController } from './app.controller';

const signingKey = 'test-internal-service-token-signing-key-32-chars';

describe('media-processing-service internal auth', () => {
  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = signingKey;
  });

  it('protects media job routes', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.createJob)).toHaveLength(1);
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.drainJobs)).toHaveLength(1);
  });

  it('rejects unauthenticated and wrong service identity for job creation', () => {
    const guard = createGuard();
    expect(() => guard.canActivate(context())).toThrow(/Missing service token/);
    expect(() => guard.canActivate(context(token(SERVICE_IDENTITIES.INTEGRATION)))).toThrow(/not allowed/);
  });

  it('allows core service to create media jobs', () => {
    expect(createGuard().canActivate(context(token(SERVICE_IDENTITIES.CORE)))).toBe(true);
  });
});

function createGuard() {
  return new InternalServiceAuthGuard({
    audience: SERVICE_IDENTITIES.MEDIA_PROCESSING,
    scopes: [SERVICE_SCOPES.MEDIA_JOB_CREATE],
    allowedCallers: [SERVICE_IDENTITIES.CORE],
  });
}

function token(subject: string) {
  return signServiceToken({
    signingKey,
    subject,
    audience: SERVICE_IDENTITIES.MEDIA_PROCESSING,
    scopes: [SERVICE_SCOPES.MEDIA_JOB_CREATE],
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
