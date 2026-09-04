import { WebhookRateLimiter } from './webhook-rate-limiter';

describe('WebhookRateLimiter', () => {
  it('should block requests after the configured limit', () => {
    const limiter = new WebhookRateLimiter({ windowMs: 60_000, limit: 2 });

    expect(limiter.assertAllowed('telegram:channel-1')).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.assertAllowed('telegram:channel-1')).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.assertAllowed('telegram:channel-1')).toMatchObject({ allowed: false, remaining: 0 });
  });
});
