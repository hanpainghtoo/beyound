import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';

function createService(overrides: Record<string, any> = {}) {
  const tenantPasswordLookup = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const repositories = {
    platformAdmin: { findOne: jest.fn(), update: jest.fn() },
    tenantUser: {
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(() => tenantPasswordLookup),
    },
    tenant: { findOne: jest.fn() },
    passwordResetToken: { create: jest.fn(), save: jest.fn(), find: jest.fn() },
    emailVerificationToken: {
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    },
    tenantPolicyConsent: { create: jest.fn(), save: jest.fn() },
    ...overrides,
  };
  const jwtService = overrides.jwtService || { sign: jest.fn(() => 'token') };
  const configService = overrides.configService || { get: jest.fn() };

  const service = new AuthService(
    repositories.platformAdmin as any,
    repositories.tenantUser as any,
    repositories.tenant as any,
    repositories.passwordResetToken as any,
    repositories.emailVerificationToken as any,
    repositories.tenantPolicyConsent as any,
    jwtService,
    configService,
    {} as any,
    {
      sendPasswordReset: jest.fn(),
      sendEmailVerification: jest.fn(),
      sendTeamInvite: jest.fn(),
    } as any,
    {
      resolveActiveTrialPlan: jest.fn(),
      ensureTrialPeriodForTenant: jest.fn(),
    } as any,
  );

  return {
    service,
    repositories,
    jwtService,
    configService,
    tenantPasswordLookup,
  };
}

describe('AuthService tenant status enforcement', () => {
  it('rejects password login for users in suspended tenants', async () => {
    const { service, repositories, tenantPasswordLookup } = createService();
    repositories.platformAdmin.findOne.mockResolvedValue(null);
    tenantPasswordLookup.getOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'csr@example.com',
      normalizedEmail: 'csr@example.com',
      passwordHash: await bcrypt.hash('Password123!', 4),
      status: 'active',
    });
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      status: 'suspended',
    });

    await expect(
      service.validateUser('csr@example.com', 'Password123!'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects existing JWTs after tenant suspension', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'csr@example.com',
      normalizedEmail: 'csr@example.com',
      status: 'active',
    });
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      status: 'suspended',
    });

    await expect(
      service.validateJwtPayload({
        sub: 'user-1',
        email: 'csr@example.com',
        role: 'csr',
        type: 'tenant_user',
        tokenUse: 'access',
        tenantId: 'tenant-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('logs tenant users in by normalized email while selecting password hashes internally', async () => {
    const { service, repositories, tenantPasswordLookup } = createService();
    repositories.platformAdmin.findOne.mockResolvedValue(null);
    tenantPasswordLookup.getOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'csr@example.com',
      normalizedEmail: 'csr@example.com',
      passwordHash: await bcrypt.hash('Password123!', 4),
      status: 'active',
      role: 'csr',
    });
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      status: 'active',
    });

    await expect(
      service.validateUser(' CSR@Example.COM ', 'Password123!'),
    ).resolves.toMatchObject({
      id: 'user-1',
      type: 'tenant_user',
    });
    expect(tenantPasswordLookup.where).toHaveBeenCalledWith(
      'user.normalizedEmail = :normalizedEmail',
      {
        normalizedEmail: 'csr@example.com',
      },
    );
    const result = await service.validateUser(
      ' CSR@Example.COM ',
      'Password123!',
    );
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain('normalizedEmail');
  });
});
