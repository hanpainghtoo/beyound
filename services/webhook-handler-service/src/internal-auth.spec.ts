import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  InternalServiceAuthGuard,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  signServiceToken,
} from '@zayos/internal-service-auth';
import { AppController } from './app.controller';

const signingKey = 'test-internal-service-token-signing-key-32-chars';

describe('webhook-handler-service internal auth', () => {
  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = signingKey;
  });

  it('protects queue/admin routes and leaves provider callbacks public', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.getQueueStats)).toHaveLength(1);
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.registerViberWebhook)).toHaveLength(1);
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.receiveWebhook)).toBeUndefined();
  });

  it('rejects queue inspection without the operator scope', () => {
    const guard = queueInspectGuard();
    expect(() => guard.canActivate(context())).toThrow(/Missing service token/);
    expect(() => guard.canActivate(context(token(SERVICE_SCOPES.QUEUE_DRAIN)))).toThrow(/required scope/);
  });

  it('allows platform operations to inspect queue stats', () => {
    expect(queueInspectGuard().canActivate(context(token(SERVICE_SCOPES.QUEUE_INSPECT)))).toBe(true);
  });
});

function queueInspectGuard() {
  return new InternalServiceAuthGuard({
    audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
    scopes: [SERVICE_SCOPES.QUEUE_INSPECT],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  });
}

function token(scope: string) {
  return signServiceToken({
    signingKey,
    subject: SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
    audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
    scopes: [scope],
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
