import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  InternalServiceAuthGuard,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  signServiceToken,
} from '@zayos/internal-service-auth';
import { AppController } from './app.controller';

const signingKey = 'test-internal-service-token-signing-key-32-chars';

describe('file-storage-service internal auth', () => {
  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = signingKey;
  });

  it('protects metadata routes and leaves signed content routes unguarded', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.listFiles)).toHaveLength(1);
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.createSignedUpload)).toHaveLength(1);
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.readFileContent)).toBeUndefined();
  });

  it('rejects missing and wrong-scope tokens', () => {
    const guard = readGuard();
    expect(() => guard.canActivate(context())).toThrow(/Missing service token/);
    expect(() =>
      guard.canActivate(context(token([SERVICE_SCOPES.FILE_WRITE]))),
    ).toThrow(/required scope/);
  });

  it('allows core service with file:read scope', () => {
    expect(readGuard().canActivate(context(token([SERVICE_SCOPES.FILE_READ])))).toBe(true);
  });
});

function readGuard() {
  return new InternalServiceAuthGuard({
    audience: SERVICE_IDENTITIES.FILE_STORAGE,
    scopes: [SERVICE_SCOPES.FILE_READ],
    allowedCallers: [SERVICE_IDENTITIES.CORE, SERVICE_IDENTITIES.MEDIA_PROCESSING],
  });
}

function token(scopes: string[]) {
  return signServiceToken({
    signingKey,
    subject: SERVICE_IDENTITIES.CORE,
    audience: SERVICE_IDENTITIES.FILE_STORAGE,
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
