import { BadRequestException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type {
  PasswordResetToken,
  PasswordResetUserType,
} from './entities/password-reset-token.entity';
import { PASSWORD_POLICY_MESSAGE } from './password-policy';

const GENERIC_RESET_RESPONSE = {
  message:
    'If an eligible account exists, password reset instructions will be sent.',
};

type ResetRecord = Partial<PasswordResetToken> & {
  id: string;
  userType: PasswordResetUserType;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  metadata?: Record<string, any>;
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function createPasswordResetTokenRepository(
  initialRecords: ResetRecord[] = [],
) {
  const records = [...initialRecords];
  const matches = (record: ResetRecord, criteria: Record<string, any>) => {
    if (
      criteria.userType !== undefined &&
      record.userType !== criteria.userType
    )
      return false;
    if (criteria.userId !== undefined && record.userId !== criteria.userId)
      return false;
    if (
      criteria.tokenHash !== undefined &&
      record.tokenHash !== criteria.tokenHash
    )
      return false;
    if (criteria.usedAt !== undefined && record.usedAt !== null) return false;
    return true;
  };

  const repository = {
    records,
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      const saved = {
        id: value.id || `reset-${records.length + 1}`,
        metadata: {},
        ...value,
      };
      const existingIndex = records.findIndex(
        (record) => record.id === saved.id,
      );
      if (existingIndex >= 0)
        records[existingIndex] = { ...records[existingIndex], ...saved };
      else records.push(saved);
      return saved;
    }),
    findOne: jest.fn(
      async ({ where }) =>
        records.find((record) => matches(record, where)) || null,
    ),
    update: jest.fn(async (criteria, value) => {
      for (const record of records) {
        if (matches(record, criteria)) Object.assign(record, value);
      }
      return {
        affected: records.filter((record) => matches(record, criteria)).length,
      };
    }),
  };

  return repository;
}

let lastEmailDelivery:
  | { method: string; to: string; options: Record<string, any> }
  | undefined;

function createService(overrides: Record<string, any> = {}) {
  const passwordResetToken =
    overrides.passwordResetToken || createPasswordResetTokenRepository();
  const emailService = overrides.emailService || {
    sendPasswordReset: jest.fn(async (to, options) => {
      lastEmailDelivery = { method: 'sendPasswordReset', to, options };
      return true;
    }),
    sendEmailVerification: jest.fn(async (to, options) => {
      lastEmailDelivery = { method: 'sendEmailVerification', to, options };
      return true;
    }),
    sendTeamInvite: jest.fn(async (to, options) => {
      lastEmailDelivery = { method: 'sendTeamInvite', to, options };
      return true;
    }),
  };
  const tenantPasswordLookup = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn<any, any[]>(async () => null),
  };
  const repositories = {
    platformAdmin: {
      findOne: jest.fn<any, any[]>(async () => null),
      update: jest.fn(),
    },
    tenantUser: {
      findOne: jest.fn<any, any[]>(async () => null),
      update: jest.fn(),
      createQueryBuilder: jest.fn(() => tenantPasswordLookup),
    },
    tenant: {
      findOne: jest.fn<any, any[]>(async () => ({
        id: 'tenant-1',
        status: 'active',
      })),
      update: jest.fn(),
    },
    passwordResetToken,
    emailVerificationToken: {
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    },
    tenantPolicyConsent: { create: jest.fn(), save: jest.fn() },
    ...overrides,
  };
  const service = new AuthService(
    repositories.platformAdmin as any,
    repositories.tenantUser as any,
    repositories.tenant as any,
    repositories.passwordResetToken,
    repositories.emailVerificationToken as any,
    repositories.tenantPolicyConsent as any,
    { sign: jest.fn(() => 'jwt') } as any,
    { get: jest.fn(() => 4) } as any,
    {} as any,
    emailService,
    {
      resolveActiveTrialPlan: jest.fn(),
      ensureTrialPeriodForTenant: jest.fn(),
    } as any,
  );

  return { service, repositories, tenantPasswordLookup, emailService };
}

function lastDeliveredPayload(): Record<string, any> {
  if (!lastEmailDelivery) {
    throw new Error('No email delivery was captured');
  }
  const url =
    lastEmailDelivery.options.resetUrl || lastEmailDelivery.options.inviteUrl;
  const token = new URL(url).searchParams.get('token');
  return { ...lastEmailDelivery.options, token: token ?? '' };
}

describe('AuthService password reset', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    lastEmailDelivery = undefined;
    process.env = {
      ...originalEnv,
      WORKSPACE_PUBLIC_APP_URL: 'https://zayos.com.mm',
      PLATFORM_CONSOLE_PUBLIC_APP_URL: 'https://admin.zayos.com.mm',
      SMTP_HOST: 'smtp.test',
      PASSWORD_RESET_WEBHOOK_URL: 'https://notifications.example.com/reset',
    };
    global.fetch = jest.fn(async () => ({ ok: true, status: 202 })) as any;
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    warnSpy.mockRestore();
  });

  it('returns the same generic response for existing and unknown emails', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockImplementation(async ({ where }) =>
      where.normalizedEmail === 'owner@example.com'
        ? {
            id: 'user-1',
            tenantId: 'tenant-1',
            email: 'owner@example.com',
            normalizedEmail: 'owner@example.com',
            status: 'active',
          }
        : null,
    );

    await expect(
      service.requestPasswordReset('OWNER@example.com', 'tenant_user'),
    ).resolves.toEqual(GENERIC_RESET_RESPONSE);
    await expect(
      service.requestPasswordReset('missing@example.com', 'tenant_user'),
    ).resolves.toEqual(GENERIC_RESET_RESPONSE);
  });

  it('returns the same generic response for inactive or ineligible accounts', async () => {
    const inactive = createService();
    inactive.repositories.tenantUser.findOne.mockResolvedValue(null);
    await expect(
      inactive.service.requestPasswordReset(
        'inactive@example.com',
        'tenant_user',
      ),
    ).resolves.toEqual(GENERIC_RESET_RESPONSE);

    const suspendedTenant = createService();
    suspendedTenant.repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'owner@example.com',
      normalizedEmail: 'owner@example.com',
      status: 'active',
    });
    suspendedTenant.repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      status: 'suspended',
    });
    await expect(
      suspendedTenant.service.requestPasswordReset(
        'owner@example.com',
        'tenant_user',
      ),
    ).resolves.toEqual(GENERIC_RESET_RESPONSE);
    expect(
      suspendedTenant.repositories.passwordResetToken.save,
    ).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never exposes reset URL, token, account ID, or tenant ID in the public response', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'owner@example.com',
      normalizedEmail: 'owner@example.com',
      status: 'active',
    });

    const response = await service.requestPasswordReset(
      'owner@example.com',
      'tenant_user',
    );

    expect(response).toEqual(GENERIC_RESET_RESPONSE);
    expect(JSON.stringify(response)).not.toContain('resetUrl');
    expect(JSON.stringify(response)).not.toContain('token');
    expect(JSON.stringify(response)).not.toContain('user-1');
    expect(JSON.stringify(response)).not.toContain('tenant-1');
  });

  it('stores only the deterministic SHA-256 hash of the public token', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'owner@example.com',
      normalizedEmail: 'owner@example.com',
      status: 'active',
    });

    await service.requestPasswordReset('owner@example.com', 'tenant_user');
    const publicToken = lastDeliveredPayload().token;
    const storedToken = repositories.passwordResetToken.records[0];

    expect(storedToken.tokenHash).not.toBe(publicToken);
    expect(storedToken.tokenHash).toBe(sha256(publicToken));
    expect(storedToken.metadata).toEqual({ email: 'owner@example.com' });
    expect(JSON.stringify(storedToken.metadata)).not.toContain(publicToken);
    expect(JSON.stringify(storedToken.metadata)).not.toContain(
      'reset-password?token=',
    );
  });

  it('finds tenant reset accounts by normalized email casing and whitespace', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'owner@example.com',
      normalizedEmail: 'owner@example.com',
      status: 'active',
    });

    await expect(
      service.requestPasswordReset(' OWNER@Example.COM ', 'tenant_user'),
    ).resolves.toEqual(GENERIC_RESET_RESPONSE);
    expect(repositories.tenantUser.findOne).toHaveBeenCalledWith({
      where: { normalizedEmail: 'owner@example.com', status: 'active' },
    });
    const response = await service.requestPasswordReset(
      'missing@example.com',
      'tenant_user',
    );
    expect(JSON.stringify(response)).not.toContain('tenant-1');
  });

  it('generates different tokens and supersedes the previous token', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'owner@example.com',
      normalizedEmail: 'owner@example.com',
      status: 'active',
    });

    await service.requestPasswordReset('owner@example.com', 'tenant_user');
    const firstToken = lastDeliveredPayload().token;
    await service.requestPasswordReset('owner@example.com', 'tenant_user');
    const secondToken = lastDeliveredPayload().token;

    expect(secondToken).not.toBe(firstToken);
    expect(repositories.passwordResetToken.records[0].usedAt).toBeInstanceOf(
      Date,
    );
    await expect(
      service.resetPassword(firstToken, 'StrongPassword!123'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resetPassword(secondToken, 'StrongPassword!123'),
    ).resolves.toEqual({
      message: 'Password reset successfully',
    });
  });

  it('rejects expired, consumed, and invalid tokens without account detail', async () => {
    const records = createPasswordResetTokenRepository([
      {
        id: 'expired-1',
        userType: 'tenant_user',
        userId: 'user-1',
        tokenHash: sha256('expired-token'),
        expiresAt: new Date(Date.now() - 60_000),
        usedAt: null,
      },
      {
        id: 'used-1',
        userType: 'tenant_user',
        userId: 'user-1',
        tokenHash: sha256('used-token'),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
      },
    ]);
    const { service } = createService({ passwordResetToken: records });

    await expect(
      service.resetPassword('expired-token', 'StrongPassword!123'),
    ).rejects.toThrow('Password reset link is invalid or expired');
    await expect(
      service.resetPassword('used-token', 'StrongPassword!123'),
    ).rejects.toThrow('Password reset link is invalid or expired');
    await expect(
      service.resetPassword('invalid-token', 'StrongPassword!123'),
    ).rejects.toThrow('Password reset link is invalid or expired');
  });

  it('changes the password, prevents token reuse, and authenticates only the new password', async () => {
    const token = 'valid-token';
    const passwordResetToken = createPasswordResetTokenRepository([
      {
        id: 'reset-1',
        userType: 'tenant_user',
        userId: 'user-1',
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      },
    ]);
    const { service, repositories, tenantPasswordLookup } = createService({
      passwordResetToken,
    });
    let passwordHash = await bcrypt.hash('OldPassword!123', 4);
    repositories.tenantUser.update.mockImplementation(async (_id, value) => {
      passwordHash = value.passwordHash;
    });
    tenantPasswordLookup.getOne.mockImplementation(async () => {
      return {
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'owner@example.com',
        normalizedEmail: 'owner@example.com',
        fullName: 'Owner User',
        role: 'owner',
        status: 'active',
        passwordHash,
      };
    });

    await expect(
      service.resetPassword(token, 'NewPassword!123'),
    ).resolves.toEqual({
      message: 'Password reset successfully',
    });
    await expect(
      service.resetPassword(token, 'NewerPassword!123'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.validateUser('owner@example.com', 'OldPassword!123'),
    ).resolves.toBeNull();
    await expect(
      service.validateUser('owner@example.com', 'NewPassword!123'),
    ).resolves.toMatchObject({
      id: 'user-1',
      type: 'tenant_user',
    });
  });

  it('rejects weak reset passwords using the shared strong password policy', async () => {
    const { service } = createService({
      passwordResetToken: createPasswordResetTokenRepository([
        {
          id: 'reset-1',
          userType: 'tenant_user',
          userId: 'user-1',
          tokenHash: sha256('valid-token'),
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
        },
      ]),
    });

    await expect(
      service.resetPassword('valid-token', 'Password1'),
    ).rejects.toThrow(PASSWORD_POLICY_MESSAGE);
  });

  it('does not log raw tokens or reset URLs when delivery fails', async () => {
    const { service, repositories, emailService } = createService();
    emailService.sendPasswordReset.mockImplementationOnce(
      async (to: string, options: Record<string, any>) => {
        lastEmailDelivery = { method: 'sendPasswordReset', to, options };
        return false;
      },
    );
    repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'owner@example.com',
      normalizedEmail: 'owner@example.com',
      status: 'active',
    });

    await service.requestPasswordReset('owner@example.com', 'tenant_user');
    const publicToken = lastDeliveredPayload().token;
    const logOutput = warnSpy.mock.calls.flat().join(' ');

    expect(logOutput).not.toContain(publicToken);
    expect(logOutput).not.toContain('reset-password?token=');
    expect(repositories.passwordResetToken.records[0].usedAt).toBeInstanceOf(
      Date,
    );
  });

  it('returns the same generic response when no reset delivery route is configured', async () => {
    delete process.env.SMTP_HOST;
    const { service, repositories } = createService();
    repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'owner@example.com',
      normalizedEmail: 'owner@example.com',
      status: 'active',
    });

    await expect(
      service.requestPasswordReset('owner@example.com', 'tenant_user'),
    ).resolves.toEqual(GENERIC_RESET_RESPONSE);
    expect(repositories.passwordResetToken.save).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('activates invited tenant users when they set their first password', async () => {
    const token = 'invite-token';
    const { service, repositories } = createService({
      passwordResetToken: createPasswordResetTokenRepository([
        {
          id: 'invite-1',
          userType: 'tenant_user',
          userId: 'user-1',
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
          metadata: { purpose: 'team_invite' },
        },
      ]),
    });

    await expect(
      service.resetPassword(token, 'NewPassword!123'),
    ).resolves.toEqual({
      message: 'Password reset successfully',
    });
    expect(repositories.tenantUser.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        passwordHash: expect.any(String),
        status: 'active',
      }),
    );
  });

  it('keeps tenant invite tokens internal to delivery', async () => {
    const { service } = createService();

    const result = await service.issueTenantUserInvite(
      'user-1',
      'invite@example.com',
    );
    const delivered = lastDeliveredPayload();

    expect(result).toMatchObject({
      message: 'Team invitation requested',
      invitationDelivery: 'requested',
      expiresAt: expect.any(Date),
    });
    expect(JSON.stringify(result)).not.toContain('inviteToken');
    expect(JSON.stringify(result)).not.toContain('inviteUrl');
    expect(delivered.token).toEqual(expect.any(String));
    expect(delivered.inviteUrl).toMatch(
      /^https:\/\/zayos\.com\.mm\/reset-password\?token=/,
    );
  });

  it('keeps endpoint-specific auth throttles with email-aware trackers', () => {
    const registerLimit = Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      AuthController.prototype.registerWorkspace,
    );
    const registerTtl = Reflect.getMetadata(
      'THROTTLER:TTLdefault',
      AuthController.prototype.registerWorkspace,
    );
    const registerTracker = Reflect.getMetadata(
      'THROTTLER:TRACKERdefault',
      AuthController.prototype.registerWorkspace,
    );
    const limit = Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      AuthController.prototype.requestPasswordReset,
    );
    const ttl = Reflect.getMetadata(
      'THROTTLER:TTLdefault',
      AuthController.prototype.requestPasswordReset,
    );
    const getTracker = Reflect.getMetadata(
      'THROTTLER:TRACKERdefault',
      AuthController.prototype.requestPasswordReset,
    );
    const resendLimit = Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      AuthController.prototype.requestEmailVerification,
    );
    const resendTtl = Reflect.getMetadata(
      'THROTTLER:TTLdefault',
      AuthController.prototype.requestEmailVerification,
    );
    const resendTracker = Reflect.getMetadata(
      'THROTTLER:TRACKERdefault',
      AuthController.prototype.requestEmailVerification,
    );
    const confirmLimit = Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      AuthController.prototype.confirmEmailVerification,
    );
    const confirmTtl = Reflect.getMetadata(
      'THROTTLER:TTLdefault',
      AuthController.prototype.confirmEmailVerification,
    );

    expect(registerLimit).toBe(
      Number(process.env.AUTH_REGISTER_RATE_LIMIT || 5),
    );
    expect(registerTtl).toBe(60_000);
    expect(
      registerTracker({
        ip: '203.0.113.10',
        body: { workEmail: ' OWNER@example.COM ' },
      }),
    ).toBe('203.0.113.10:owner@example.com');
    expect(limit).toBe(Number(process.env.AUTH_PASSWORD_RESET_RATE_LIMIT || 5));
    expect(ttl).toBe(60_000);
    expect(
      getTracker({
        ip: '203.0.113.10',
        body: { email: ' OWNER@example.COM ' },
      }),
    ).toBe('203.0.113.10:owner@example.com');
    expect(resendLimit).toBe(
      Number(process.env.AUTH_EMAIL_VERIFICATION_RESEND_RATE_LIMIT || 5),
    );
    expect(resendTtl).toBe(60_000);
    expect(
      resendTracker({
        ip: '203.0.113.10',
        body: { email: ' OWNER@example.COM ' },
      }),
    ).toBe('203.0.113.10:owner@example.com');
    expect(confirmLimit).toBe(
      Number(process.env.AUTH_EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT || 10),
    );
    expect(confirmTtl).toBe(60_000);
  });
});
