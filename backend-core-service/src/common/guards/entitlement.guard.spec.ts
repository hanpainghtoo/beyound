import { EntitlementGuard } from './entitlement.guard';

describe('EntitlementGuard (legacy pass-through)', () => {
  const guard = new EntitlementGuard();

  it('allows tenant requests regardless of legacy entitlement state', async () => {
    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ method: 'GET', tenant: { id: 'tenant-1' } }),
        }),
        getHandler: () => () => undefined,
        getClass: () => class TestController {},
      } as any),
    ).resolves.toBe(true);
  });

  it('allows unsafe tenant requests without consulting the legacy entitlement row', async () => {
    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ method: 'POST', tenant: { id: 'tenant-1' } }),
        }),
        getHandler: () => () => undefined,
        getClass: () => class TestController {},
      } as any),
    ).resolves.toBe(true);
  });

  it('passes for tenants without any legacy entitlement row (new period flow)', async () => {
    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            user: { tenantId: 'tenant-1' },
          }),
        }),
        getHandler: () => () => undefined,
        getClass: () => class TestController {},
      } as any),
    ).resolves.toBe(true);
  });
});
