import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

/**
 * Legacy entitlement guard — now a pass-through.
 *
 * The purchased-period ledger (`tenant_subscription_periods`) is the single
 * authority for tenant operational access. Period enforcement happens in the
 * usage interceptor (billable paths resolve to `SUBSCRIPTION_PERIOD_NOT_ACTIVE`
 * / `SUBSCRIPTION_PERIOD_AWAITING_ACTIVATION`) and inside each feature service
 * (channels, storage, messages, top-ups).
 *
 * The legacy `tenant_entitlements` row is deprecated and must not gate access:
 * it no longer exists for tenants onboarded through the new period flow, so
 * asserting on it 404s new (and newly paid) tenants with the misleading
 * "Tenant entitlement is not configured". The guard stays wired so the
 * `@UseGuards(...)` route scaffolding remains stable until the legacy cleanup
 * pass removes it.
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  async canActivate(_context: ExecutionContext): Promise<boolean> {
    return true;
  }
}
