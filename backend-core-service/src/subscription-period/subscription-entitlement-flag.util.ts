/**
 * Plan 9 permanent period-scoped entitlement policy.
 *
 * Purchased calendar-month periods and their active top-up components are now
 * the sole source of operational quota/capacity enforcement. The old runtime
 * flag is intentionally ignored; keeping the helper preserves the existing
 * call sites while making the cutover permanent and consistent.
 */

export function isPeriodScopedEnforcementEnabled(
  _env: NodeJS.ProcessEnv = process.env,
): boolean {
  void _env;
  return true;
}

export function isShadowDualWriteEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.SUBSCRIPTION_PERIOD_SHADOW_DUAL_WRITE !== 'false';
}
