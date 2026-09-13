import { ForbiddenException } from '@nestjs/common';

import { TenantGuard } from './tenant.guard';

function executionContext(
  user: Record<string, unknown>,
  params: Record<string, unknown> = {},
) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        params,
        body: {},
      }),
    }),
  } as any;
}

describe('TenantGuard', () => {
  it('blocks unverified tenant users from workspace tenant routes', () => {
    const guard = new TenantGuard({} as any);

    expect(() =>
      guard.canActivate(
        executionContext({
          type: 'tenant_user',
          tenantId: 'tenant-1',
          emailVerifiedAt: null,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows verified tenant users for their own tenant', () => {
    const guard = new TenantGuard({} as any);
    const context = executionContext(
      {
        type: 'tenant_user',
        tenantId: 'tenant-1',
        emailVerifiedAt: new Date(),
      },
      { tenantId: 'tenant-1' },
    );

    expect(guard.canActivate(context)).toBe(true);
  });
});
