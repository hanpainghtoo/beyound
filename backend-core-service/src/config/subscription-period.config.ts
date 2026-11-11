/**
 * Period-scoped subscription enforcement is now permanent. This compatibility
 * helper remains for older imports but no longer reads an environment toggle.
 */
export function isSubscriptionPeriodEnforcementEnabled(
  _env: NodeJS.ProcessEnv = process.env,
): boolean {
  return true;
}
