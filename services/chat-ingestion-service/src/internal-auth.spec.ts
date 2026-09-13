import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  InternalServiceAuthGuard,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  signServiceToken,
} from '@zayos/internal-service-auth';
import { AppController } from './app.controller';

const signingKey = 'test-internal-service-token-signing-key-32-chars';

describe('chat-ingestion-service internal auth', () => {
  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = signingKey;
  });

  it('protects ingestion while leaving health unguarded', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.ingest)).toHaveLength(1);
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.getHealth)).toBeUndefined();
  });

  it('rejects unauthenticated and disallowed callers', () => {
    const guard = ingestGuard();
    expect(() => guard.canActivate(context())).toThrow(/Missing service token/);
    expect(() =>
      guard.canActivate(context(token(SERVICE_IDENTITIES.INTEGRATION))),
    ).toThrow(/not allowed/);
  });

  it('allows webhook handler with chat:ingest scope', () => {
    expect(ingestGuard().canActivate(context(token(SERVICE_IDENTITIES.WEBHOOK_HANDLER)))).toBe(true);
  });
});

function ingestGuard() {
  return new InternalServiceAuthGuard({
    audience: SERVICE_IDENTITIES.CHAT_INGESTION,
    scopes: [SERVICE_SCOPES.CHAT_INGEST],
    allowedCallers: [SERVICE_IDENTITIES.WEBHOOK_HANDLER],
  });
}

function token(subject: string) {
  return signServiceToken({
    signingKey,
    subject,
    audience: SERVICE_IDENTITIES.CHAT_INGESTION,
    scopes: [SERVICE_SCOPES.CHAT_INGEST],
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
