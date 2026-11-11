/**
 * Client IP resolution for audit logs.
 *
 * The dashboard reaches this API through the Next.js proxy route
 * (`app/api/proxy/[...path]/route.ts`), so the TCP peer is always the Next.js
 * server itself. Without Express `trust proxy`, `request.ip` therefore reports
 * loopback for every user and every action, and every audit row inherits it.
 *
 * We deliberately support a numeric hop count only. `trust proxy: true` makes
 * Express trust the entire `X-Forwarded-For` chain, which a client can forge by
 * reaching the backend directly — unacceptable for a compliance field.
 */

export const TRUST_PROXY_HOPS_ENV_VAR = 'TRUST_PROXY_HOPS';

/** Number of proxy hops to trust when nothing usable is configured. */
export const DEFAULT_TRUST_PROXY_HOPS = 1;

export function resolveTrustProxyHops(rawValue: string | undefined): number {
  if (typeof rawValue !== 'string') return DEFAULT_TRUST_PROXY_HOPS;

  const trimmed = rawValue.trim();
  if (trimmed === '') return DEFAULT_TRUST_PROXY_HOPS;

  // Reject the express "trust everything" sentinel rather than honouring it.
  if (trimmed.toLowerCase() === 'true') return DEFAULT_TRUST_PROXY_HOPS;

  if (!/^\d+$/.test(trimmed)) return DEFAULT_TRUST_PROXY_HOPS;

  const hops = Number(trimmed);
  if (!Number.isSafeInteger(hops) || hops < 0) {
    return DEFAULT_TRUST_PROXY_HOPS;
  }

  return hops;
}

/**
 * Minimal structural shape needed to configure trust proxy. `INestApplication`
 * satisfies this, and keeping it structural lets tests pass a partial mock.
 */
export type TrustProxyCapableApp = {
  getHttpAdapter?: () => { getInstance?: () => unknown } | undefined;
};

/**
 * Configures Express `trust proxy` so `request.ip` resolves to the real client
 * address instead of the proxy's loopback address.
 */
export function applyTrustProxy(
  app: TrustProxyCapableApp | undefined,
  rawValue: string | undefined,
): void {
  const hops = resolveTrustProxyHops(rawValue);

  const instance = app?.getHttpAdapter?.()?.getInstance?.() as
    | { set?: (key: string, value: unknown) => void }
    | undefined;

  if (!instance || typeof instance.set !== 'function') {
    console.warn(
      `[trust-proxy] HTTP adapter does not expose a configurable instance; audit logs will record the proxy address for ${TRUST_PROXY_HOPS_ENV_VAR}=${hops}.`,
    );
    return;
  }

  instance.set('trust proxy', hops);
}
