/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';

import { AuthService } from './auth.service';
import { TENANT_USER_NORMALIZED_EMAIL_UNIQUE_INDEX } from './identity-email.util';

const trialPlan = {
  id: 'plan-trial',
  name: 'Guided Pilot (Trial)',
  planType: 'trial',
  durationDays: 30,
  requestable: false,
  renewable: false,
  topUpAllowed: false,
  autoApprove: true,
  status: 'active',
};

const trialPeriod = {
  id: 'trial-period-1',
  tenantId: 'tenant-1',
  planId: 'plan-trial',
  periodType: 'trial',
  periodStatus: 'active',
  paymentStatus: 'not_required',
  adminActivationStatus: 'approved',
  billingRecordId: null,
  periodStartAt: new Date('2026-08-17T00:00:00.000Z'),
  periodEndAt: new Date('2026-09-16T00:00:00.000Z'),
};

function createService(overrides: Record<string, any> = {}) {
  const emailVerificationTransaction = jest.fn(async (callback) =>
    callback({
      getRepository: (entity: any) => {
        if (entity.name === 'TenantUser') return repositories.tenantUser;
        if (entity.name === 'EmailVerificationToken')
          return repositories.emailVerificationToken;
        return {};
      },
    }),
  );
  const transaction = jest.fn(async (callback) =>
    callback({
      getRepository: (entity: any) => {
        if (entity.name === 'Tenant') return repositories.tenant;
        if (entity.name === 'TenantUser') return repositories.tenantUser;
        if (entity.name === 'SubscriptionPlan')
          return repositories.subscriptionPlan;
        if (entity.name === 'EmailVerificationToken')
          return repositories.emailVerificationToken;
        if (entity.name === 'TenantPolicyConsent')
          return repositories.tenantPolicyConsent;
        return {};
      },
    }),
  );
  const repositories = {
    platformAdmin: { findOne: jest.fn(), update: jest.fn() },
    tenantUser: {
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: value.id || 'user-1', ...value })),
    },
    tenant: {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      manager: { transaction },
      save: jest.fn(async (value) => ({
        id: value.id || 'tenant-1',
        ...value,
      })),
    },
    subscriptionPlan: {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
      })),
    },
    passwordResetToken: { create: jest.fn(), save: jest.fn(), find: jest.fn() },
    emailVerificationToken: {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: value.id || 'email-token-1',
        ...value,
      })),
      findOne: jest.fn(),
      update: jest.fn(),
      manager: { transaction: emailVerificationTransaction },
    },
    tenantPolicyConsent: {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    },
    ...overrides,
  };
  const jwtService = { sign: jest.fn(() => 'token') };
  const configService = { get: jest.fn(() => 4) };
  const legalPolicyService = overrides.legalPolicyService || {
    getActivePublishedPolicy: jest.fn(async (policyKey) => ({
      policyKey,
      version:
        policyKey === 'terms_of_service'
          ? 'terms-2026-07-18'
          : 'privacy-2026-07-18',
    })),
  };
  const subscriptionPeriodService = overrides.subscriptionPeriodService || {
    resolveActiveTrialPlan: jest.fn(async () => trialPlan),
    ensureTrialPeriodForTenant: jest.fn(async (tenantId: string) => ({
      ...trialPeriod,
      tenantId,
    })),
  };

  const service = new AuthService(
    repositories.platformAdmin as any,
    repositories.tenantUser as any,
    repositories.tenant as any,
    repositories.passwordResetToken as any,
    repositories.emailVerificationToken as any,
    repositories.tenantPolicyConsent as any,
    jwtService as any,
    configService as any,
    legalPolicyService,
    {
      sendPasswordReset: jest.fn(),
      sendEmailVerification: jest.fn(),
      sendTeamInvite: jest.fn(),
    } as any,
    subscriptionPeriodService,
  );

  return {
    service,
    repositories,
    transaction,
    emailVerificationTransaction,
    subscriptionPeriodService,
    legalPolicyService,
  };
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

describe('AuthService workspace registration', () => {
  it('creates an active tenant admin workspace session and one auto-approved trial period', async () => {
    const { service, repositories, subscriptionPeriodService } =
      createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue(null);

    const session = await service.registerWorkspace({
      fullName: 'Thiri Zan',
      companyName: 'Zan Boutique',
      workEmail: 'owner@zan.example',
      password: 'ZayStrong123!',
      phoneNumber: '09 123 456 789',
      businessType: 'local-brand',
      teamSize: '1-3',
      subscriptionPlanId: 'plan-1',
      acceptTerms: true,
      notes: 'Need inbox first',
    });

    // The server resolves the trial plan; a client-supplied business plan id
    // is ignored and never interpreted as a trial (task 2.8).
    expect(subscriptionPeriodService.resolveActiveTrialPlan).toHaveBeenCalled();
    expect(
      subscriptionPeriodService.ensureTrialPeriodForTenant,
    ).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ type: 'tenant_user' }),
      expect.objectContaining({ now: expect.any(Date) }),
    );
    expect(repositories.tenant.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: 'Zan Boutique',
        contactEmail: 'owner@zan.example',
        status: 'active',
        subscriptionPlanId: 'plan-trial',
      }),
    );
    expect(repositories.tenantUser.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        email: 'owner@zan.example',
        normalizedEmail: 'owner@zan.example',
        role: 'owner',
        status: 'active',
        emailVerifiedAt: null,
      }),
    );
    expect(repositories.emailVerificationToken.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantUserId: 'user-1',
        normalizedEmail: 'owner@zan.example',
        tokenHash: expect.any(String),
        usedAt: null,
      }),
    );
    const storedToken =
      repositories.emailVerificationToken.save.mock.calls[0][0];
    expect(storedToken.tokenHash).not.toContain('owner@zan.example');
    expect(storedToken.tokenHash).toHaveLength(64);
    expect(repositories.tenantPolicyConsent.save).toHaveBeenCalledWith([
      expect.objectContaining({
        tenantId: 'tenant-1',
        tenantUserId: 'user-1',
        normalizedEmail: 'owner@zan.example',
        policyKey: 'terms_of_service',
        policyVersion: 'terms-2026-07-18',
      }),
      expect.objectContaining({
        tenantId: 'tenant-1',
        tenantUserId: 'user-1',
        normalizedEmail: 'owner@zan.example',
        policyKey: 'privacy_policy',
        policyVersion: 'privacy-2026-07-18',
      }),
    ]);
    expect(session).toMatchObject({
      accessToken: 'token',
      refreshToken: 'token',
      emailVerificationRequired: true,
      emailVerificationDelivery: 'unavailable',
      user: {
        email: 'owner@zan.example',
        role: 'owner',
        type: 'tenant_user',
        tenantId: 'tenant-1',
        emailVerifiedAt: null,
      },
    });
  });

  it('rejects duplicate self-registration emails', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'owner@zan.example',
      normalizedEmail: 'owner@zan.example',
    });

    await expect(
      service.registerWorkspace({
        fullName: 'Thiri Zan',
        companyName: 'Zan Boutique',
        workEmail: 'owner@zan.example',
        password: 'ZayStrong123!',
        subscriptionPlanId: 'plan-1',
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects registration when no active trial plan is configured', async () => {
    const { service, repositories } = createService({
      subscriptionPeriodService: {
        resolveActiveTrialPlan: jest.fn(async () => {
          throw new BadRequestException(
            'No active trial plan is configured; trial onboarding is unavailable.',
          );
        }),
        ensureTrialPeriodForTenant: jest.fn(),
      },
    });
    repositories.tenantUser.findOne.mockResolvedValue(null);

    await expect(
      service.registerWorkspace({
        fullName: 'Thiri Zan',
        companyName: 'Zan Boutique',
        workEmail: 'owner@zan.example',
        password: 'ZayStrong123!',
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repositories.tenant.save).not.toHaveBeenCalled();
  });

  it('never interprets a client-supplied business subscriptionPlanId as a trial (task 2.8)', async () => {
    const { service, repositories, subscriptionPeriodService } =
      createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue(null);

    await service.registerWorkspace({
      fullName: 'Thiri Zan',
      companyName: 'Zan Boutique',
      workEmail: 'owner@zan.example',
      password: 'ZayStrong123!',
      subscriptionPlanId: 'business-plan-9',
      acceptTerms: true,
    });

    // The trial plan resolved server-side is authoritative; the client's
    // business plan id never reaches the tenant or the trial period.
    expect(subscriptionPeriodService.resolveActiveTrialPlan).toHaveBeenCalled();
    expect(repositories.tenant.save).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionPlanId: 'plan-trial' }),
    );
  });

  it('rejects registration without policy consent before creating records', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);

    await expect(
      service.registerWorkspace({
        fullName: 'Thiri Zan',
        companyName: 'Zan Boutique',
        workEmail: 'owner@zan.example',
        password: 'ZayStrong123!',
        subscriptionPlanId: 'plan-1',
        acceptTerms: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repositories.tenant.save).not.toHaveBeenCalled();
  });

  it('blocks registration when active legal policies are unavailable', async () => {
    const legalPolicyService = {
      getActivePublishedPolicy: jest.fn(async () => {
        throw new Error('missing active policy');
      }),
    };
    const { service, repositories } = createService({ legalPolicyService });
    repositories.tenantUser.findOne.mockResolvedValue(null);

    await expect(
      service.registerWorkspace({
        fullName: 'Thiri Zan',
        companyName: 'Zan Boutique',
        workEmail: 'owner@zan.example',
        password: 'ZayStrong123!',
        subscriptionPlanId: 'plan-1',
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repositories.tenant.save).not.toHaveBeenCalled();
  });

  it('rejects weak self-registration passwords before creating records', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);

    await expect(
      service.registerWorkspace({
        fullName: 'Thiri Zan',
        companyName: 'Zan Boutique',
        workEmail: 'owner@zan.example',
        password: 'weakpass',
        subscriptionPlanId: 'plan-1',
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repositories.tenant.save).not.toHaveBeenCalled();
  });

  it('rejects common self-registration passwords before creating records', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);

    await expect(
      service.registerWorkspace({
        fullName: 'Thiri Zan',
        companyName: 'Zan Boutique',
        workEmail: 'owner@zan.example',
        password: 'Password123!',
        subscriptionPlanId: 'plan-1',
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repositories.tenant.save).not.toHaveBeenCalled();
  });

  it('provisions the trial period inside the registration transaction and never creates a legacy trial entitlement (task 2.5)', async () => {
    const { service, repositories, transaction, subscriptionPeriodService } =
      createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue(null);

    await service.registerWorkspace({
      fullName: 'Thiri Zan',
      companyName: 'Zan Boutique',
      workEmail: 'owner@zan.example',
      password: 'ZayStrong123!',
      acceptTerms: true,
    });

    expect(transaction).toHaveBeenCalled();
    expect(
      subscriptionPeriodService.ensureTrialPeriodForTenant,
    ).toHaveBeenCalled();
    // No legacy tenant_entitlements trial row is created — the period ledger
    // is the only trial authority.
    expect(repositories.tenant.save).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionPlanId: 'plan-trial' }),
    );
  });

  it('normalizes workspace registration identity while preserving display email', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue(null);

    await service.registerWorkspace({
      fullName: 'Thiri Zan',
      companyName: 'Zan Boutique',
      workEmail: 'OWNER@ZAN.EXAMPLE ',
      password: 'ZayStrong123!',
      subscriptionPlanId: 'plan-1',
      acceptTerms: true,
    });

    expect(repositories.tenant.save).toHaveBeenCalledWith(
      expect.objectContaining({ contactEmail: 'OWNER@ZAN.EXAMPLE' }),
    );
    expect(repositories.tenantUser.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'OWNER@ZAN.EXAMPLE',
        normalizedEmail: 'owner@zan.example',
      }),
    );
  });

  it('rejects case and whitespace variants of existing registration emails', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockImplementation(async ({ where }) =>
      where.normalizedEmail === 'owner@zan.example'
        ? { id: 'user-1', normalizedEmail: 'owner@zan.example' }
        : null,
    );

    await expect(
      service.registerWorkspace({
        fullName: 'Thiri Zan',
        companyName: 'Zan Boutique',
        workEmail: ' OWNER@ZAN.EXAMPLE ',
        password: 'ZayStrong123!',
        subscriptionPlanId: 'plan-1',
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repositories.tenant.save).not.toHaveBeenCalled();
  });

  it('maps normalized-email race failures without leaving an orphan tenant when transaction manager is available', async () => {
    const { service, repositories, transaction } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue(null);
    repositories.tenantUser.save.mockRejectedValue({
      code: '23505',
      constraint: TENANT_USER_NORMALIZED_EMAIL_UNIQUE_INDEX,
    });

    await expect(
      service.registerWorkspace({
        fullName: 'Thiri Zan',
        companyName: 'Zan Boutique',
        workEmail: 'owner@zan.example',
        password: 'ZayStrong123!',
        subscriptionPlanId: 'plan-1',
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction).toHaveBeenCalled();
    expect(repositories.tenant.save).toHaveBeenCalledTimes(1);
  });

  it('concurrent registration attempts result in only one created identity', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue(null);
    repositories.tenantUser.save
      .mockResolvedValueOnce({
        id: 'user-1',
        tenantId: 'tenant-1',
        fullName: 'Thiri Zan',
        email: 'owner@zan.example',
        normalizedEmail: 'owner@zan.example',
        role: 'owner',
        status: 'active',
      })
      .mockRejectedValueOnce({
        code: '23505',
        constraint: TENANT_USER_NORMALIZED_EMAIL_UNIQUE_INDEX,
      });

    const attempts = await Promise.allSettled([
      service.registerWorkspace({
        fullName: 'Thiri Zan',
        companyName: 'Zan Boutique',
        workEmail: 'Owner@Zan.example',
        password: 'ZayStrong123!',
        subscriptionPlanId: 'plan-1',
        acceptTerms: true,
      }),
      service.registerWorkspace({
        fullName: 'Thiri Zan',
        companyName: 'Zan Boutique',
        workEmail: ' owner@zan.example ',
        password: 'ZayStrong123!',
        subscriptionPlanId: 'plan-1',
        acceptTerms: true,
      }),
    ]);

    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === 'rejected'),
    ).toHaveLength(1);
  });

  it('retries company-code collisions safely during registration', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne
      .mockResolvedValueOnce({
        id: 'tenant-existing',
        tenantCode: 'ZAN-BOUTIQUE',
      })
      .mockResolvedValueOnce(null);

    await service.registerWorkspace({
      fullName: 'Thiri Zan',
      companyName: 'Zan Boutique',
      workEmail: 'owner@zan.example',
      password: 'ZayStrong123!',
      subscriptionPlanId: 'plan-1',
      acceptTerms: true,
    });

    expect(repositories.tenant.findOne).toHaveBeenNthCalledWith(1, {
      where: { tenantCode: 'ZAN-BOUTIQUE' },
    });
    expect(repositories.tenant.findOne).toHaveBeenNthCalledWith(2, {
      where: { tenantCode: 'ZAN-BOUTIQUE-2' },
    });
    expect(repositories.tenant.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantCode: 'ZAN-BOUTIQUE-2',
      }),
    );
  });

  it('fails registration inside the transaction before verification delivery when a required record cannot be saved', async () => {
    const { service, repositories, transaction } = createService();
    repositories.tenantUser.findOne.mockResolvedValue(null);
    repositories.tenant.findOne.mockResolvedValue(null);
    repositories.tenantPolicyConsent.save.mockRejectedValue(
      new Error('consent persistence failed'),
    );

    await expect(
      service.registerWorkspace({
        fullName: 'Thiri Zan',
        companyName: 'Zan Boutique',
        workEmail: 'owner@zan.example',
        password: 'ZayStrong123!',
        subscriptionPlanId: 'plan-1',
        acceptTerms: true,
      }),
    ).rejects.toThrow('consent persistence failed');

    expect(transaction).toHaveBeenCalled();
    expect(repositories.emailVerificationToken.save).not.toHaveBeenCalled();
    expect(repositories.tenantUser.update).not.toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
    );
  });

  it('respects email verification resend cooldown without leaking account state', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'owner@zan.example',
      normalizedEmail: 'owner@zan.example',
      status: 'active',
      emailVerifiedAt: null,
    });
    repositories.emailVerificationToken.findOne.mockResolvedValue({
      tenantUserId: 'user-1',
      usedAt: null,
      resendAvailableAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });

    await expect(
      service.requestEmailVerification(' OWNER@ZAN.EXAMPLE '),
    ).resolves.toEqual({
      message:
        'If a verification is required, email verification instructions will be sent.',
    });

    expect(repositories.emailVerificationToken.save).not.toHaveBeenCalled();
  });

  it('generates a new hashed email verification token when resend cooldown has elapsed', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'owner@zan.example',
      normalizedEmail: 'owner@zan.example',
      status: 'active',
      emailVerifiedAt: null,
    });
    repositories.emailVerificationToken.findOne.mockResolvedValue({
      tenantUserId: 'user-1',
      usedAt: null,
      resendAvailableAt: new Date(Date.now() - 1_000),
      createdAt: new Date(Date.now() - 10_000),
    });

    await service.requestEmailVerification('owner@zan.example');

    expect(repositories.emailVerificationToken.update).toHaveBeenCalledWith(
      { tenantUserId: 'user-1', usedAt: expect.any(Object) },
      { usedAt: expect.any(Date) },
    );
    expect(repositories.emailVerificationToken.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantUserId: 'user-1',
        normalizedEmail: 'owner@zan.example',
        tokenHash: expect.any(String),
        usedAt: null,
      }),
    );
  });

  it('verifies email tokens atomically and makes them one-time use', async () => {
    const { service, repositories, emailVerificationTransaction } =
      createService();
    repositories.emailVerificationToken.findOne.mockResolvedValue({
      id: 'token-1',
      tenantUserId: 'user-1',
      tokenHash: hashToken('verification-token'),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });

    await expect(
      service.confirmEmailVerification('verification-token'),
    ).resolves.toEqual({
      message: 'Email verified successfully',
    });

    expect(emailVerificationTransaction).toHaveBeenCalled();
    expect(repositories.tenantUser.update).toHaveBeenCalledWith('user-1', {
      emailVerifiedAt: expect.any(Date),
    });
    expect(repositories.emailVerificationToken.save).toHaveBeenCalledWith(
      expect.objectContaining({ usedAt: expect.any(Date) }),
    );
  });

  it('rejects expired and already-used email verification tokens', async () => {
    const { service, repositories } = createService();
    repositories.emailVerificationToken.findOne
      .mockResolvedValueOnce({
        tenantUserId: 'user-1',
        tokenHash: hashToken('expired-token'),
        expiresAt: new Date(Date.now() - 1_000),
        usedAt: null,
      })
      .mockResolvedValueOnce({
        tenantUserId: 'user-1',
        tokenHash: hashToken('used-token'),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
      });

    await expect(
      service.confirmEmailVerification('expired-token'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.confirmEmailVerification('used-token'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repositories.tenantUser.update).not.toHaveBeenCalled();
  });
});
