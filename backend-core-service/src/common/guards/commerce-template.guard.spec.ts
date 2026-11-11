import { ForbiddenException } from '@nestjs/common';

import { CommerceTemplateGuard } from './commerce-template.guard';

describe('CommerceTemplateGuard', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  const contextFor = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as never;

  const createGuard = (row: unknown) => {
    const repository = { findOne: jest.fn().mockResolvedValue(row) };
    const guard = new CommerceTemplateGuard(repository as never);
    return { guard, repository };
  };

  it('allows the request while commerce is on', async () => {
    const { guard } = createGuard({
      tenantId,
      telegramBotTemplate: 'commerce',
    });
    await expect(
      guard.canActivate(contextFor({ tenant: { id: tenantId } })),
    ).resolves.toBe(true);
  });

  it('blocks with 403 when commerce is off', async () => {
    const { guard } = createGuard({ tenantId, telegramBotTemplate: null });
    await expect(
      guard.canActivate(contextFor({ tenant: { id: tenantId } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks when the settings row is missing entirely', async () => {
    const { guard } = createGuard(null);
    await expect(
      guard.canActivate(contextFor({ tenant: { id: tenantId } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets platform admins through regardless', async () => {
    const { guard, repository } = createGuard(null);
    await expect(
      guard.canActivate(
        contextFor({ user: { type: 'platform_admin' } }),
      ),
    ).resolves.toBe(true);
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('defers to the auth guards when there is no tenant context', async () => {
    const { guard, repository } = createGuard(null);
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(repository.findOne).not.toHaveBeenCalled();
  });
});