/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Legacy jest mock repositories and services are any-shaped by design; retyping this suite is tracked separately from feature work. */
import * as bcrypt from 'bcryptjs';
import { ForbiddenException } from '@nestjs/common';

import { TenantService } from './tenant.service';
import { AuthService } from '../auth/auth.service';

const now = new Date('2026-07-18T00:00:00.000Z');

function user(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    fullName: 'Team User',
    firstName: 'Team',
    lastName: 'User',
    email: 'team@example.com',
    normalizedEmail: 'team@example.com',
    passwordHash: 'hash',
    phone: null,
    role: 'agent',
    permissions: { inbox: true },
    status: 'active',
    isOnline: false,
    lastSeenAt: null,
    avatarUrl: null,
    department: null,
    employeeId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTenantService(overrides: Record<string, any> = {}) {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(async () => [
      [user({ internalOnly: 'secret' })],
      1,
    ]),
  };
  const repositories = {
    tenantUser: {
      createQueryBuilder: jest.fn(() => queryBuilder),
      findOne: jest.fn<any, any[]>(async () =>
        user({ internalOnly: 'secret' }),
      ),
      count: jest.fn(async () => 0),
      create: jest.fn((value) => user(value)),
      save: jest.fn(async (value) => user(value)),
      remove: jest.fn(),
    },
    tenantChannel: {},
    cannedResponse: {},
    product: {},
    productCategory: {},
    tenantAnalytics: {},
    conversation: {},
    tenant: {
      findOne: jest.fn(async () => ({
        id: 'tenant-1',
        customAgentLimit: 10,
        subscriptionPlanId: null,
      })),
    },
    subscriptionPlan: { findOne: jest.fn(async () => null) },
    tenantBillingRecord: {},
    tenantUsage: {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0', latest: null }),
      })),
    },
    subscriptionPeriod: {
      find: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
  const authService = overrides.authService || {
    issueTenantUserInvite: jest.fn(async () => ({
      message: 'Team invitation requested',
      invitationDelivery: 'requested',
      expiresAt: now,
      inviteUrl: 'https://zayos.com.mm/accept-invite?token=mock-token',
    })),
  };
  const service = new TenantService(
    repositories.tenantUser as any,
    repositories.tenantChannel as any,
    repositories.cannedResponse as any,
    repositories.product as any,
    repositories.productCategory as any,
    repositories.tenantAnalytics as any,
    repositories.conversation as any,
    repositories.tenant as any,
    repositories.subscriptionPlan as any,
    repositories.tenantBillingRecord as any,
    {} as any,
    repositories.tenantUsage as any,
    repositories.subscriptionPeriod as any,
    {} as any,
    { validateConfig: jest.fn() } as any,
    { logTenantUserAction: jest.fn() } as any,
    authService,
    { getTenantEntitlement: jest.fn().mockResolvedValue(null) } as any,
    undefined,
    overrides.emailService,
  );
  return { service, repositories, queryBuilder, authService };
}

describe('TenantService tenant-user response safety', () => {
  // Pin the public workspace URL so credentials-email tests can build a
  // deterministic sign-in link regardless of the ambient shell env.
  const originalWorkspaceUrl = process.env.WORKSPACE_PUBLIC_APP_URL;
  beforeEach(() => {
    process.env.WORKSPACE_PUBLIC_APP_URL = 'https://zayos.com.mm';
  });
  afterEach(() => {
    if (originalWorkspaceUrl === undefined) {
      delete process.env.WORKSPACE_PUBLIC_APP_URL;
    } else {
      process.env.WORKSPACE_PUBLIC_APP_URL = originalWorkspaceUrl;
    }
  });

  const assertSafe = (value: unknown) => {
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('hash');
    expect(serialized).not.toContain('internalOnly');
  };

  it('list response never contains passwordHash and matches the DTO contract', async () => {
    const { service } = createTenantService();
    const result = await service.getAllAgents('tenant-1', {
      page: 1,
      limit: 10,
    });

    assertSafe(result);
    expect(Object.keys(result.data[0]).sort()).toEqual(
      [
        'avatarUrl',
        'createdAt',
        'department',
        'email',
        'employeeId',
        'firstName',
        'fullName',
        'id',
        'isOnline',
        'lastName',
        'lastSeenAt',
        'permissions',
        'phone',
        'role',
        'status',
        'tenantId',
        'updatedAt',
      ].sort(),
    );
  });

  it('detail, create, update, and permissions responses never contain passwordHash', async () => {
    const detail = createTenantService();

    await expect(
      detail.service.getAgentById('tenant-1', 'user-1'),
    ).resolves.toEqual(expect.objectContaining({ id: 'user-1' }));
    assertSafe(await detail.service.getAgentById('tenant-1', 'user-1'));

    const create = createTenantService();
    create.repositories.tenantUser.findOne.mockResolvedValueOnce(null);
    assertSafe(
      await create.service.createAgent('tenant-1', {
        fullName: 'New User',
        email: 'new@example.com',
        password: 'StrongPassword!123',
        role: 'agent',
      }),
    );

    const update = createTenantService();
    assertSafe(
      await update.service.updateAgent(
        'tenant-1',
        'user-1',
        { fullName: 'Updated User' },
        'admin',
      ),
    );
    assertSafe(
      await update.service.updateAgentPermissions('tenant-1', 'user-1', {
        passwordHash: 'nested-hash',
      }),
    );
  });

  it('allows managers to edit non-owner accounts but not the owner', async () => {
    const manager = createTenantService();
    manager.repositories.tenantUser.findOne.mockResolvedValueOnce(
      user({ role: 'supervisor' }),
    );

    await expect(
      manager.service.updateAgent(
        'tenant-1',
        'user-1',
        { fullName: 'Updated Manager' },
        'supervisor',
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'user-1' }));

    const owner = createTenantService();
    owner.repositories.tenantUser.findOne.mockResolvedValueOnce(
      user({ role: 'owner' }),
    );
    await expect(
      owner.service.updateAgent(
        'tenant-1',
        'user-1',
        { fullName: 'Not Allowed' },
        'supervisor',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('protects the owner account from deletion for every caller', async () => {
    const owner = createTenantService();
    owner.repositories.tenantUser.findOne.mockResolvedValueOnce(
      user({ role: 'owner' }),
    );

    await expect(
      owner.service.deleteAgent('tenant-1', 'user-1', 'owner'),
    ).rejects.toThrow('The owner account cannot be deleted');
    expect(owner.repositories.tenantUser.remove).not.toHaveBeenCalled();

    const manager = createTenantService();
    manager.repositories.tenantUser.findOne.mockResolvedValueOnce(
      user({ role: 'agent' }),
    );
    await expect(
      manager.service.deleteAgent('tenant-1', 'user-1', 'supervisor'),
    ).resolves.toBeUndefined();
    expect(manager.repositories.tenantUser.remove).toHaveBeenCalled();
  });

  it('allows an agent to update only their own contact details', async () => {
    const self = createTenantService();

    await expect(
      self.service.updateAgent(
        'tenant-1',
        'user-1',
        { fullName: 'Updated Agent' },
        'agent',
        'user-1',
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'user-1' }));

    const other = createTenantService();
    await expect(
      other.service.updateAgent(
        'tenant-1',
        'user-1',
        { fullName: 'Not Allowed' },
        'agent',
        'another-agent',
      ),
    ).rejects.toThrow('Agents can only edit their own account');

    const escalation = createTenantService();
    await expect(
      escalation.service.updateAgent(
        'tenant-1',
        'user-1',
        { role: 'supervisor' },
        'agent',
        'user-1',
      ),
    ).rejects.toThrow('Agents cannot change team roles or account status');
  });

  it('invitation creation returns the copyable invite link without leaking raw token fields', async () => {
    const { service, authService, repositories } = createTenantService();
    repositories.tenantUser.findOne.mockResolvedValueOnce(null);

    const result = await service.inviteAgent(
      'tenant-1',
      {
        fullName: 'Invited User',
        email: 'invite@example.com',
        role: 'agent',
      },
      'actor-1',
      'admin',
    );

    expect(result).toMatchObject({
      user: expect.objectContaining({
        email: 'invite@example.com',
        status: 'inactive',
      }),
      invitation: {
        message: 'Team invitation requested',
        invitationDelivery: 'requested',
        expiresAt: now,
        // Managers may copy this one-time, short-lived link for manual share.
        inviteUrl: 'https://zayos.com.mm/accept-invite?token=mock-token',
      },
    });
    expect(authService.issueTenantUserInvite).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('inviteToken');
    expect(JSON.stringify(result)).not.toContain('reset-password?token=');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('direct creation emails the sign-in link with the creator-set password and reports delivery', async () => {
    const sendAccountCreated = jest.fn(async () => true);
    const { service, repositories } = createTenantService({
      emailService: { sendAccountCreated },
    });
    repositories.tenantUser.findOne.mockResolvedValueOnce(null);
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      companyName: 'Acme Commerce',
      customAgentLimit: 10,
      subscriptionPlanId: null,
    } as any);

    const result = await service.createAgent(
      'tenant-1',
      {
        fullName: 'New Member',
        email: 'new-member@example.com',
        password: 'CreatorSet123!',
        role: 'agent',
      },
      'owner',
      'owner-1',
    );

    expect(result).toMatchObject({
      email: 'new-member@example.com',
      status: 'active',
      credentialsEmailDelivery: 'delivered',
    });
    assertSafe(result);
    expect(sendAccountCreated).toHaveBeenCalledTimes(1);
    const [recipient, options] = sendAccountCreated.mock
      .calls[0] as unknown as [string, Record<string, any>];
    expect(recipient).toBe('new-member@example.com');
    expect(options).toMatchObject({
      signInUrl: expect.stringMatching(/\/login$/),
      // The plaintext exists only for this request — bcrypt at rest.
      password: 'CreatorSet123!',
      email: 'new-member@example.com',
      fullName: 'New Member',
      companyName: 'Acme Commerce',
    });
  });

  it('keeps the created member when the credentials email fails and reports the failure', async () => {
    const { service, repositories } = createTenantService({
      emailService: {
        sendAccountCreated: jest.fn(async () => {
          throw new Error('SMTP unavailable');
        }),
      },
    });
    repositories.tenantUser.findOne.mockResolvedValueOnce(null);

    const result = await service.createAgent(
      'tenant-1',
      {
        fullName: 'New Member',
        email: 'fail-member@example.com',
        password: 'CreatorSet123!',
        role: 'agent',
      },
      'owner',
      'owner-1',
    );

    expect(result).toMatchObject({
      email: 'fail-member@example.com',
      credentialsEmailDelivery: 'failed',
    });
    // Creation never rolls back — the owner knows the password.
    expect(repositories.tenantUser.save).toHaveBeenCalled();
  });

  it('removes the pending member when invite delivery fails', async () => {
    const deliveryError = new Error('SMTP unavailable');
    const inviteFailure = createTenantService({
      authService: {
        issueTenantUserInvite: jest.fn().mockRejectedValue(deliveryError),
      },
    });
    inviteFailure.repositories.tenantUser.findOne.mockResolvedValueOnce(null);

    await expect(
      inviteFailure.service.inviteAgent(
        'tenant-1',
        {
          fullName: 'Invited User',
          email: 'retry@example.com',
          role: 'agent',
        },
        'actor-1',
        'admin',
      ),
    ).rejects.toBe(deliveryError);
    expect(inviteFailure.repositories.tenantUser.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'retry@example.com',
        status: 'inactive',
      }),
    );
  });

  it('staff creation and invitation reject an email used in another tenant without revealing that tenant', async () => {
    const createConflict = createTenantService();
    createConflict.repositories.tenantUser.findOne.mockResolvedValueOnce(
      user({
        id: 'other-user',
        tenantId: 'other-tenant',
        normalizedEmail: 'team@example.com',
      }),
    );

    await expect(
      createConflict.service.createAgent('tenant-1', {
        fullName: 'Team User',
        email: ' TEAM@example.COM ',
        password: 'StrongPassword!123',
        role: 'agent',
      } as any),
    ).rejects.toMatchObject({
      response: expect.not.objectContaining({
        tenantId: 'other-tenant',
      }),
    });

    const inviteConflict = createTenantService();
    inviteConflict.repositories.tenantUser.findOne.mockResolvedValueOnce(
      user({
        id: 'other-user',
        tenantId: 'other-tenant',
        normalizedEmail: 'team@example.com',
      }),
    );
    await expect(
      inviteConflict.service.inviteAgent(
        'tenant-1',
        {
          fullName: 'Team User',
          email: 'team@example.com',
          role: 'agent',
        } as any,
        'actor-1',
        'admin',
      ),
    ).rejects.toThrow('This email is already associated with a ZayOS account.');
  });

  it('database race failures during staff creation map to a controlled conflict response', async () => {
    const { service, repositories } = createTenantService();
    repositories.tenantUser.findOne.mockResolvedValueOnce(null);
    repositories.tenantUser.save.mockRejectedValueOnce({
      code: '23505',
      constraint: 'uq_tenant_users_normalized_email',
    });

    await expect(
      service.createAgent('tenant-1', {
        fullName: 'New User',
        email: 'new@example.com',
        password: 'StrongPassword!123',
        role: 'agent',
      } as any),
    ).rejects.toThrow('This email is already associated with a ZayOS account.');
  });

  it('concurrent staff creation attempts result in one created account', async () => {
    const { service, repositories } = createTenantService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenantUser.save
      .mockResolvedValueOnce(
        user({
          id: 'created-1',
          email: 'race@example.com',
          normalizedEmail: 'race@example.com',
        }),
      )
      .mockRejectedValueOnce({
        code: '23505',
        constraint: 'uq_tenant_users_normalized_email',
      });

    const attempts = await Promise.allSettled([
      service.createAgent('tenant-1', {
        fullName: 'Race User',
        email: 'Race@Example.com',
        password: 'StrongPassword!123',
        role: 'agent',
      } as any),
      service.createAgent('tenant-1', {
        fullName: 'Race User',
        email: ' race@example.COM ',
        password: 'StrongPassword!123',
        role: 'agent',
      } as any),
    ]);

    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === 'rejected'),
    ).toHaveLength(1);
  });
});

describe('AuthService tenant password selection', () => {
  it('authentication still explicitly selects and verifies password hashes internally', async () => {
    const passwordHash = await bcrypt.hash('StrongPassword!123', 4);
    const tenantLookup = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => user({ passwordHash })),
    };
    const service = new AuthService(
      { findOne: jest.fn(async () => null), update: jest.fn() } as any,
      {
        createQueryBuilder: jest.fn(() => tenantLookup),
        findOne: jest.fn(),
        update: jest.fn(),
      } as any,
      {
        findOne: jest.fn(async () => ({ id: 'tenant-1', status: 'active' })),
      } as any,
      {
        findOne: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as any,
      {
        findOne: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as any,
      { create: jest.fn(), save: jest.fn() } as any,
      {} as any,
      { sign: jest.fn(() => 'jwt') } as any,
      { get: jest.fn(() => 4) } as any,
      {} as any,
      {
        sendPasswordReset: jest.fn(),
        sendEmailVerification: jest.fn(),
        sendTeamInvite: jest.fn(),
        sendOtpEmail: jest.fn(),
      } as any,
      {
        resolveActiveTrialPlan: jest.fn(),
        ensureTrialPeriodForTenant: jest.fn(),
      } as any,
      { generate: jest.fn() } as any,
    );

    await expect(
      service.validateUser('team@example.com', 'StrongPassword!123'),
    ).resolves.toMatchObject({
      id: 'user-1',
      type: 'tenant_user',
    });
    expect(tenantLookup.addSelect).toHaveBeenCalledWith('user.passwordHash');
    await expect(
      service.validateUser('team@example.com', 'WrongPassword!123'),
    ).resolves.toBeNull();
  });
});
