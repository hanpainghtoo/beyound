import { resolveTrustProxyHops, applyTrustProxy } from './trust-proxy';

describe('resolveTrustProxyHops', () => {
  it('defaults to a single trusted hop when the env var is absent', () => {
    expect(resolveTrustProxyHops(undefined)).toBe(1);
    expect(resolveTrustProxyHops('')).toBe(1);
  });

  it('parses an explicit non-negative integer hop count', () => {
    expect(resolveTrustProxyHops('0')).toBe(0);
    expect(resolveTrustProxyHops('1')).toBe(1);
    expect(resolveTrustProxyHops('2')).toBe(2);
    expect(resolveTrustProxyHops(' 3 ')).toBe(3);
  });

  it('rejects "true" so the whole X-Forwarded-For chain cannot be trusted', () => {
    // `trust proxy: true` makes Express trust every XFF entry, including ones a
    // client can forge by reaching the backend directly. For an audit field
    // that is worse than today's wrong-but-constant value.
    expect(resolveTrustProxyHops('true')).toBe(1);
    expect(resolveTrustProxyHops('TRUE')).toBe(1);
  });

  it('falls back to the default for non-numeric, negative, or fractional values', () => {
    expect(resolveTrustProxyHops('yes')).toBe(1);
    expect(resolveTrustProxyHops('-1')).toBe(1);
    expect(resolveTrustProxyHops('1.5')).toBe(1);
    expect(resolveTrustProxyHops('Infinity')).toBe(1);
    expect(resolveTrustProxyHops('NaN')).toBe(1);
  });
});

describe('applyTrustProxy', () => {
  function createApp() {
    const set = jest.fn();
    const app = {
      getHttpAdapter: () => ({ getInstance: () => ({ set }) }),
    };
    return { app, set };
  }

  it('applies the resolved hop count to the underlying express instance', () => {
    const { app, set } = createApp();
    applyTrustProxy(app, '2');
    expect(set).toHaveBeenCalledWith('trust proxy', 2);
  });

  it('applies the safe default when no value is configured', () => {
    const { app, set } = createApp();
    applyTrustProxy(app, undefined);
    expect(set).toHaveBeenCalledWith('trust proxy', 1);
  });

  it('does not throw when the http adapter is unavailable', () => {
    const app = { getHttpAdapter: () => undefined };
    expect(() => applyTrustProxy(app, '1')).not.toThrow();
  });
});
