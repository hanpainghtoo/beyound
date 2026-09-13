import {
  isPeriodScopedEnforcementEnabled,
  isShadowDualWriteEnabled,
} from './subscription-entitlement-flag.util';

describe('subscription-entitlement-flag.util (permanent period policy)', () => {
  it('period-scoped enforcement is always enabled', () => {
    expect(isPeriodScopedEnforcementEnabled({})).toBe(true);
    expect(
      isPeriodScopedEnforcementEnabled({
        SUBSCRIPTION_PERIOD_ENFORCEMENT_ENABLED: 'false',
      }),
    ).toBe(true);
  });

  it('shadow dual-write is on by default and can be disabled', () => {
    expect(isShadowDualWriteEnabled({})).toBe(true);
    expect(
      isShadowDualWriteEnabled({
        SUBSCRIPTION_PERIOD_SHADOW_DUAL_WRITE: 'true',
      }),
    ).toBe(true);
    expect(
      isShadowDualWriteEnabled({
        SUBSCRIPTION_PERIOD_SHADOW_DUAL_WRITE: 'false',
      }),
    ).toBe(false);
  });
});
