import { ForbiddenException } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';

describe('PlatformAdminGuard', () => {
  function context(user: Record<string, unknown>) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects an authenticated tenant user', async () => {
    const guard = new PlatformAdminGuard();
    const parentPrototype = Object.getPrototypeOf(PlatformAdminGuard.prototype);
    jest.spyOn(parentPrototype, 'canActivate').mockReturnValue(true);

    await expect(
      guard.canActivate(context({ type: 'tenant_user', id: 'user-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an authenticated platform administrator', async () => {
    const guard = new PlatformAdminGuard();
    const parentPrototype = Object.getPrototypeOf(PlatformAdminGuard.prototype);
    jest.spyOn(parentPrototype, 'canActivate').mockReturnValue(true);

    await expect(
      guard.canActivate(context({ type: 'platform_admin', id: 'admin-1' })),
    ).resolves.toBe(true);
  });

  it('does not bypass JWT authentication', async () => {
    const guard = new PlatformAdminGuard();
    const parentPrototype = Object.getPrototypeOf(PlatformAdminGuard.prototype);
    jest.spyOn(parentPrototype, 'canActivate').mockReturnValue(false);

    await expect(
      guard.canActivate(context({ type: 'platform_admin', id: 'admin-1' })),
    ).resolves.toBe(false);
  });
});
