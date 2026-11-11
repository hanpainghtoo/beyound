export class WebhookRateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly options = {
      windowMs: Number(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS || 60_000),
      limit: Number(process.env.WEBHOOK_RATE_LIMIT || 600),
    },
  ) {}

  assertAllowed(key: string) {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.options.windowMs });
      return {
        allowed: true,
        remaining: this.options.limit - 1,
        resetAt: now + this.options.windowMs,
      };
    }

    if (bucket.count >= this.options.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: bucket.resetAt,
      };
    }

    bucket.count += 1;
    return {
      allowed: true,
      remaining: this.options.limit - bucket.count,
      resetAt: bucket.resetAt,
    };
  }
}
