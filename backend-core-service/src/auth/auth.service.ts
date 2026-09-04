import {
  Injectable,
  Optional,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';

import { PlatformAdmin } from './entities/platform-admin.entity';
import { TenantUser } from './entities/tenant-user.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPeriodService } from '../subscription-period/subscription-period.service';
import { LegalPolicyService } from '../legal-policy/legal-policy.service';
import { EmailService } from '../email/email.service';
import {
  PasswordResetToken,
  type PasswordResetUserType,
} from './entities/password-reset-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { TenantPolicyConsent } from './entities/tenant-policy-consent.entity';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type { RegisterTenantUserDto } from './dto/register-tenant-user.dto';
import type { AuthResponseDto } from './dto/auth-response.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { RegisterWorkspaceDto } from './dto/register-workspace.dto';
import { resolvePublicBaseUrl } from '../config/public-base-url';
import { assertStrongPassword } from './password-policy';
import {
  mapTenantUserIdentityConflict,
  normalizeIdentityEmail,
  PUBLIC_REGISTRATION_EMAIL_CONFLICT_MESSAGE,
  TENANT_USER_EMAIL_CONFLICT_MESSAGE,
} from './identity-email.util';

const PASSWORD_RESET_REQUEST_MESSAGE =
  'If an eligible account exists, password reset instructions will be sent.';
const EMAIL_VERIFICATION_REQUEST_MESSAGE =
  'If a verification is required, email verification instructions will be sent.';
function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || fullName,
    lastName: parts.slice(1).join(' ') || parts[0] || fullName,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private platformAdminRepository: Repository<PlatformAdmin>;
  private tenantUserRepository: Repository<TenantUser>;
  private tenantRepository: Repository<Tenant>;
  private passwordResetTokenRepository: Repository<PasswordResetToken>;
  private emailVerificationTokenRepository: Repository<EmailVerificationToken>;
  private tenantPolicyConsentRepository: Repository<TenantPolicyConsent>;
  private jwtService: JwtService;
  private configService: ConfigService;

  constructor(
    @InjectRepository(PlatformAdmin)
    platformAdminRepository: Repository<PlatformAdmin>,
    @InjectRepository(TenantUser)
    tenantUserRepository: Repository<TenantUser>,
    @InjectRepository(Tenant)
    tenantRepository: Repository<Tenant>,
    @InjectRepository(PasswordResetToken)
    passwordResetTokenRepository: Repository<PasswordResetToken>,
    @InjectRepository(EmailVerificationToken)
    emailVerificationTokenRepository: Repository<EmailVerificationToken>,
    @InjectRepository(TenantPolicyConsent)
    tenantPolicyConsentRepository: Repository<TenantPolicyConsent>,
    jwtService: JwtService,
    configService: ConfigService,
    @Optional() private readonly legalPolicyService: LegalPolicyService,
    private readonly emailService: EmailService,
    private readonly subscriptionPeriodService: SubscriptionPeriodService,
  ) {
    this.platformAdminRepository = platformAdminRepository;
    this.tenantUserRepository = tenantUserRepository;
    this.tenantRepository = tenantRepository;
    this.passwordResetTokenRepository = passwordResetTokenRepository;
    this.emailVerificationTokenRepository = emailVerificationTokenRepository;
    this.tenantPolicyConsentRepository = tenantPolicyConsentRepository;
    this.jwtService = jwtService;
    this.configService = configService;
  }

  async validateUser(email: string, password: string = ''): Promise<any> {
    const normalizedEmail = normalizeIdentityEmail(email);
    // First check platform admins
    const platformAdmin = await this.platformAdminRepository.findOne({
      where: { email: normalizedEmail, status: 'active' },
    });

    if (
      platformAdmin &&
      (await bcrypt.compare(password, platformAdmin.passwordHash))
    ) {
      const { passwordHash, ...result } = platformAdmin;
      return { ...result, type: 'platform_admin' };
    }

    // Then check tenant users
    const tenantUser = await this.tenantUserRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.normalizedEmail = :normalizedEmail', { normalizedEmail })
      .andWhere('user.status = :status', { status: 'active' })
      .getOne();

    if (
      tenantUser &&
      (await bcrypt.compare(password, tenantUser.passwordHash))
    ) {
      await this.assertTenantCanUseSystem(tenantUser.tenantId);
      const {
        passwordHash,
        normalizedEmail: _normalizedEmail,
        ...result
      } = tenantUser;
      return { ...result, type: 'tenant_user' };
    }

    return null;
  }

  async validateJwtPayload(payload: JwtPayload): Promise<any> {
    if (payload.type === 'platform_admin') {
      const admin = await this.platformAdminRepository.findOne({
        where: { id: payload.sub, status: 'active' },
      });
      if (admin) {
        const { passwordHash, ...result } = admin;
        return { ...result, type: 'platform_admin' };
      }
    } else if (payload.type === 'tenant_user') {
      const user = await this.tenantUserRepository.findOne({
        where: { id: payload.sub, status: 'active' },
      });
      if (user) {
        await this.assertTenantCanUseSystem(user.tenantId);
        const {
          passwordHash,
          normalizedEmail: _normalizedEmail,
          ...result
        } = user;
        return { ...result, type: 'tenant_user' };
      }
    }

    return null;
  }

  private async assertTenantCanUseSystem(tenantId: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant || tenant.status !== 'active') {
      throw new ForbiddenException('Tenant is not active');
    }
  }

  async login(user: any): Promise<AuthResponseDto> {
    const basePayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: user.type,
      tenantId: user.tenantId,
      emailVerifiedAt: user.emailVerifiedAt ?? null,
    };

    const accessToken = this.jwtService.sign({
      ...basePayload,
      tokenUse: 'access',
    } satisfies JwtPayload);
    const refreshToken = this.jwtService.sign(
      {
        ...basePayload,
        tokenUse: 'refresh',
      } satisfies JwtPayload,
      {
        secret: this.configService.get<string>('auth.jwtRefreshSecret'),
        expiresIn:
          this.configService.get<string>('auth.jwtRefreshExpiresIn') || '7d',
      },
    );

    // Update last login
    if (user.type === 'platform_admin') {
      await this.platformAdminRepository.update(user.id, {
        lastLoginAt: new Date(),
      });
    } else {
      await this.tenantUserRepository.update(user.id, {
        lastSeenAt: new Date(),
      });
    }

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        type: user.type,
        tenantId: user.tenantId,
        emailVerifiedAt: user.emailVerifiedAt ?? null,
      },
    };
  }

  async registerTenantUser(
    tenantId: string,
    registerDto: RegisterTenantUserDto,
  ): Promise<TenantUser> {
    const normalizedEmail = normalizeIdentityEmail(registerDto.email);
    const email = registerDto.email.trim();
    // Check if user already exists
    const existingUser = await this.tenantUserRepository.findOne({
      where: { normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException(TENANT_USER_EMAIL_CONFLICT_MESSAGE);
    }

    // Hash password
    const saltRounds =
      this.configService.get<number>('auth.bcryptRounds') || 12;
    const passwordHash = await bcrypt.hash(registerDto.password, saltRounds);

    const { firstName, lastName } = splitFullName(registerDto.fullName);

    // Create user
    const user = this.tenantUserRepository.create({
      ...registerDto,
      tenantId,
      email,
      normalizedEmail,
      firstName,
      lastName,
      passwordHash,
      role: registerDto.role || 'csr',
    });

    try {
      return await this.tenantUserRepository.save(user);
    } catch (error) {
      throw mapTenantUserIdentityConflict(error) || error;
    }
  }

  async registerWorkspace(
    registerDto: RegisterWorkspaceDto,
    metadata: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<AuthResponseDto> {
    const normalizedEmail = normalizeIdentityEmail(registerDto.workEmail);
    const email = registerDto.workEmail.trim();
    const existingUser = await this.tenantUserRepository.findOne({
      where: { normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException(PUBLIC_REGISTRATION_EMAIL_CONFLICT_MESSAGE);
    }

    if (registerDto.acceptTerms !== true) {
      throw new BadRequestException(
        'You must accept the Terms of Service and Privacy Policy.',
      );
    }
    const activeRegistrationPolicies =
      await this.getActiveRegistrationPolicies();
    const now = new Date();

    this.ensureStrongPassword(registerDto.password);
    const saltRounds =
      this.configService.get<number>('auth.bcryptRounds') || 12;
    const passwordHash = await bcrypt.hash(registerDto.password, saltRounds);
    const { firstName, lastName } = splitFullName(registerDto.fullName);

    try {
      const createRecords = async (manager: EntityManager) => {
        // Plan 14 Phase 2 (tasks 2.4/2.8): the server resolves the single
        // active trial plan. A client-supplied `subscriptionPlanId` is never
        // interpreted as a trial — business plan selection remains a paid
        // request through the purchase flow, never a registration input.
        const tenantRepository = manager.getRepository(Tenant);
        const tenantUserRepository = manager.getRepository(TenantUser);
        const policyConsentRepository =
          manager.getRepository(TenantPolicyConsent);
        const verificationTokenRepository = manager.getRepository(
          EmailVerificationToken,
        );

        const trialPlan =
          await this.subscriptionPeriodService.resolveActiveTrialPlan(manager);

        const tenant = tenantRepository.create({
          tenantCode: await this.generateTenantCode(registerDto.companyName),
          companyName: registerDto.companyName.trim(),
          businessType: registerDto.businessType?.trim() || undefined,
          contactPerson: registerDto.fullName.trim(),
          contactEmail: registerDto.companyEmail?.trim() || email,
          contactPhone: registerDto.phoneNumber?.trim() || undefined,
          description: registerDto.notes?.trim() || undefined,
          status: 'active',
          subscriptionPlanId: trialPlan.id,
          subscriptionStartDate: now,
          featureFlags: {
            onboardingSetupGuide: {
              source: 'self_registration',
              plan: trialPlan.name,
              subscriptionPlanId: trialPlan.id,
              teamSize: registerDto.teamSize?.trim() || null,
              registeredAt: now.toISOString(),
            },
          },
        } as Partial<Tenant>);
        const savedTenant = await tenantRepository.save(tenant);

        // Create exactly one auto-approved trial period (server-side trial
        // plan + exact duration). No legacy `tenant_entitlements` trial row is
        // ever created (task 2.5).
        const trialPeriod =
          await this.subscriptionPeriodService.ensureTrialPeriodForTenant(
            savedTenant.id,
            { type: 'tenant_user', id: normalizedEmail },
            { manager, now },
          );
        savedTenant.subscriptionEndDate = trialPeriod.periodEndAt
          ? new Date(trialPeriod.periodEndAt)
          : new Date(now.getTime() + trialPeriod.durationDays * 86_400_000);

        const tenantUser = tenantUserRepository.create({
          tenantId: savedTenant.id,
          fullName: registerDto.fullName.trim(),
          firstName,
          lastName,
          email,
          normalizedEmail,
          passwordHash,
          phone: registerDto.phoneNumber?.trim() || undefined,
          role: 'owner',
          status: 'active',
          emailVerifiedAt: null,
          permissions: { all: true, selfRegistered: true },
          notificationPreferences: { email: true, inApp: true },
        } as Partial<TenantUser>);
        const savedUser = await tenantUserRepository.save(tenantUser);
        await policyConsentRepository.save(
          activeRegistrationPolicies.map((policy) =>
            policyConsentRepository.create({
              tenantId: savedTenant.id,
              tenantUserId: savedUser.id,
              normalizedEmail,
              policyKey: policy.policyKey,
              policyVersion: policy.version,
              acceptedAt: now,
              metadata: {
                source: 'self_registration',
                ipAddress: metadata.ipAddress || null,
                userAgent: metadata.userAgent || null,
              },
            }),
          ),
        );
        const verification = await this.issueEmailVerificationToken(savedUser, {
          emailVerificationTokenRepository: verificationTokenRepository,
          metadata: {
            source: 'self_registration',
            tenantId: savedTenant.id,
          },
        });
        return { savedUser, verification };
      };

      const manager = this.tenantRepository.manager;
      const { savedUser, verification } = manager?.transaction
        ? await manager.transaction(async (transactionManager) =>
            createRecords(transactionManager),
          )
        : await createRecords(manager);

      const delivered = await this.deliverEmailVerification(
        savedUser.normalizedEmail,
        verification.token,
        verification.expiresAt,
      );
      const session = await this.login({ ...savedUser, type: 'tenant_user' });
      return {
        ...session,
        emailVerificationRequired: true,
        emailVerificationDelivery: delivered ? 'requested' : 'unavailable',
      };
    } catch (error) {
      throw (
        mapTenantUserIdentityConflict(
          error,
          PUBLIC_REGISTRATION_EMAIL_CONFLICT_MESSAGE,
        ) || error
      );
    }
  }

  private async generateTenantCode(companyName: string): Promise<string> {
    const base =
      companyName
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 18) || 'TENANT';

    let attempt = 0;
    while (attempt < 50) {
      const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
      const tenantCode = `${base}${suffix}`.slice(0, 24);
      const existingTenant = await this.tenantRepository.findOne({
        where: { tenantCode },
      });
      if (!existingTenant) return tenantCode;
      attempt += 1;
    }

    throw new ConflictException('Unable to generate a unique workspace code');
  }

  private async getActiveRegistrationPolicies() {
    if (!this.legalPolicyService) {
      throw new BadRequestException('Registration policies are not available');
    }
    try {
      return await Promise.all([
        this.legalPolicyService.getActivePublishedPolicy('terms_of_service'),
        this.legalPolicyService.getActivePublishedPolicy('privacy_policy'),
      ]);
    } catch {
      throw new BadRequestException('Registration policies are not available');
    }
  }

  async createPlatformAdmin(
    email: string,
    password: string,
    fullName: string,
    role = 'ops_admin',
  ): Promise<PlatformAdmin> {
    // Check if admin already exists
    const existingAdmin = await this.platformAdminRepository.findOne({
      where: { email },
    });
    if (existingAdmin) {
      throw new ConflictException('Platform admin already exists');
    }

    // Hash password
    const saltRounds =
      this.configService.get<number>('auth.bcryptRounds') || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create admin
    const admin = this.platformAdminRepository.create({
      email,
      passwordHash,
      fullName,
      role,
    });

    return this.platformAdminRepository.save(admin);
  }

  async refreshToken(user: any): Promise<{ accessToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: user.type,
      tokenUse: 'access',
      tenantId: user.tenantId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  async updateCurrentUser(
    userId: string,
    userType: string,
    updateDto: UpdateProfileDto,
  ) {
    if (userType !== 'tenant_user') {
      throw new ForbiddenException('Tenant user profile required');
    }

    const user = await this.tenantUserRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) throw new NotFoundException('User not found');

    if (
      updateDto.email &&
      normalizeIdentityEmail(updateDto.email) !== user.normalizedEmail
    ) {
      const normalizedEmail = normalizeIdentityEmail(updateDto.email);
      const existingUser = await this.tenantUserRepository.findOne({
        where: { normalizedEmail },
      });
      if (existingUser) {
        throw new ConflictException(TENANT_USER_EMAIL_CONFLICT_MESSAGE);
      }
    }

    if (updateDto.fullName) {
      const { firstName, lastName } = splitFullName(updateDto.fullName);
      user.fullName = updateDto.fullName;
      user.firstName = firstName;
      user.lastName = lastName;
    }
    if (updateDto.email !== undefined) {
      user.email = updateDto.email.trim();
      user.normalizedEmail = normalizeIdentityEmail(updateDto.email);
    }
    if (updateDto.phone !== undefined) user.phone = updateDto.phone;
    if (updateDto.department !== undefined)
      user.department = updateDto.department;
    if (updateDto.notificationPreferences !== undefined) {
      user.notificationPreferences = updateDto.notificationPreferences;
    }

    let savedUser: TenantUser;
    try {
      savedUser = await this.tenantUserRepository.save(user);
    } catch (error) {
      throw mapTenantUserIdentityConflict(error) || error;
    }
    const {
      passwordHash,
      normalizedEmail: _normalizedEmail,
      ...result
    } = savedUser;
    return { ...result, type: 'tenant_user' as const };
  }

  async changePassword(
    userId: string,
    userType: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (userType !== 'tenant_user') {
      throw new ForbiddenException('Tenant user profile required');
    }

    const user = await this.tenantUserRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new ForbiddenException('Current password is incorrect');
    }

    const saltRounds =
      this.configService.get<number>('auth.bcryptRounds') || 12;
    user.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    await this.tenantUserRepository.save(user);
    return { message: 'Password updated successfully' };
  }

  async requestPasswordReset(email: string, userType?: PasswordResetUserType) {
    const normalizedEmail = normalizeIdentityEmail(email);
    const candidates: Array<{
      type: PasswordResetUserType;
      user: PlatformAdmin | TenantUser | null;
    }> = [];

    if (!userType || userType === 'platform_admin') {
      candidates.push({
        type: 'platform_admin',
        user: await this.platformAdminRepository.findOne({
          where: { email: normalizedEmail, status: 'active' },
        }),
      });
    }
    if (!userType || userType === 'tenant_user') {
      candidates.push({
        type: 'tenant_user',
        user: await this.tenantUserRepository.findOne({
          where: { normalizedEmail, status: 'active' },
        }),
      });
    }

    const match = candidates.find((candidate) => candidate.user);
    if (
      !match?.user ||
      !(await this.isPasswordResetEligible(match.type, match.user))
    ) {
      return this.genericPasswordResetRequestResponse();
    }

    if (!this.canDeliverPasswordReset()) {
      this.logger.warn(
        'Password reset delivery unavailable; PASSWORD_RESET_WEBHOOK_URL is not configured',
      );
      return this.genericPasswordResetRequestResponse();
    }

    const { token, expiresAt } = await this.issueOneTimeTenantToken(
      match.type,
      match.user.id,
      {
        email: normalizedEmail,
      },
    );
    const delivered = await this.deliverPasswordReset(
      match.type,
      normalizedEmail,
      token,
      expiresAt,
    );
    if (!delivered) {
      await this.invalidateActiveResetTokens(match.type, match.user.id);
    }

    return this.genericPasswordResetRequestResponse();
  }

  async resetPassword(token: string, newPassword: string) {
    this.ensureStrongPassword(newPassword);
    const tokenHash = this.hashResetToken(token.trim());
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: { tokenHash },
    });
    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'Password reset link is invalid or expired',
      );
    }

    const saltRounds =
      this.configService.get<number>('auth.bcryptRounds') || 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    if (resetToken.userType === 'platform_admin') {
      await this.platformAdminRepository.update(resetToken.userId, {
        passwordHash,
      });
    } else {
      const updatePayload: Partial<TenantUser> = { passwordHash };
      if (resetToken.metadata?.purpose === 'team_invite') {
        updatePayload.status = 'active';
        updatePayload.emailVerifiedAt = new Date();
      }
      await this.tenantUserRepository.update(resetToken.userId, updatePayload);
    }
    resetToken.usedAt = new Date();
    await this.passwordResetTokenRepository.save(resetToken);
    await this.invalidateActiveResetTokens(
      resetToken.userType,
      resetToken.userId,
    );
    return { message: 'Password reset successfully' };
  }

  async requestEmailVerification(email: string) {
    const normalizedEmail = normalizeIdentityEmail(email);
    const user = await this.tenantUserRepository.findOne({
      where: { normalizedEmail, status: 'active' },
    });
    if (!user || user.emailVerifiedAt) {
      return this.genericEmailVerificationRequestResponse();
    }

    const activeToken = await this.emailVerificationTokenRepository.findOne({
      where: { tenantUserId: user.id, usedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (
      activeToken?.resendAvailableAt &&
      activeToken.resendAvailableAt.getTime() > Date.now()
    ) {
      return this.genericEmailVerificationRequestResponse();
    }

    const verification = await this.issueEmailVerificationToken(user);
    await this.deliverEmailVerification(
      user.normalizedEmail,
      verification.token,
      verification.expiresAt,
    );
    return this.genericEmailVerificationRequestResponse();
  }

  async confirmEmailVerification(token: string) {
    const tokenHash = this.hashResetToken(token.trim());
    const verify = async (
      emailVerificationTokenRepository: Repository<EmailVerificationToken>,
      tenantUserRepository: Repository<TenantUser>,
    ) => {
      const verificationToken = await emailVerificationTokenRepository.findOne({
        where: { tokenHash },
      });
      if (
        !verificationToken ||
        verificationToken.usedAt ||
        verificationToken.expiresAt.getTime() <= Date.now()
      ) {
        throw new BadRequestException(
          'Email verification link is invalid or expired',
        );
      }

      const now = new Date();
      verificationToken.usedAt = now;
      await tenantUserRepository.update(verificationToken.tenantUserId, {
        emailVerifiedAt: now,
      });
      await emailVerificationTokenRepository.save(verificationToken);
      await this.invalidateActiveEmailVerificationTokens(
        verificationToken.tenantUserId,
        now,
        emailVerificationTokenRepository,
      );
    };

    if (this.emailVerificationTokenRepository.manager?.transaction) {
      await this.emailVerificationTokenRepository.manager.transaction(
        async (manager) =>
          verify(
            manager.getRepository(EmailVerificationToken),
            manager.getRepository(TenantUser),
          ),
      );
    } else {
      await verify(
        this.emailVerificationTokenRepository,
        this.tenantUserRepository,
      );
    }

    return { message: 'Email verified successfully' };
  }

  async issueTenantUserInvite(
    userId: string,
    email: string,
    options: { invitedBy?: string; tenantId?: string; role?: string } = {},
  ) {
    const normalizedEmail = normalizeIdentityEmail(email);
    const { token, expiresAt } = await this.issueOneTimeTenantToken(
      'tenant_user',
      userId,
      {
        email: normalizedEmail,
        purpose: 'team_invite',
        invitedBy: options.invitedBy || null,
        tenantId: options.tenantId || null,
        role: options.role || null,
      },
    );
    const delivered = await this.deliverTenantInvite(
      normalizedEmail,
      token,
      expiresAt,
      options,
    );
    if (!delivered) {
      await this.invalidateActiveResetTokens('tenant_user', userId);
    }

    return {
      message: 'Team invitation requested',
      invitationDelivery: 'requested' as const,
      expiresAt,
    };
  }

  private resolveAppBaseUrlForReset(userType: PasswordResetUserType) {
    if (userType === 'platform_admin') {
      return resolvePublicBaseUrl(
        process.env,
        'PLATFORM_CONSOLE_PUBLIC_APP_URL',
        {
          allowMissingInDevelopment: true,
        },
      );
    }

    return resolvePublicBaseUrl(process.env, 'WORKSPACE_PUBLIC_APP_URL', {
      allowMissingInDevelopment: true,
    });
  }

  private buildResetPasswordUrl(
    userType: PasswordResetUserType,
    token: string,
  ) {
    const baseUrl = this.resolveAppBaseUrlForReset(userType);
    if (!baseUrl) return undefined;
    return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  }

  private generateResetToken() {
    return randomBytes(32).toString('base64url');
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueOneTimeTenantToken(
    userType: PasswordResetUserType,
    userId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.invalidateActiveResetTokens(userType, userId);
    await this.passwordResetTokenRepository.update(
      { userType, userId, usedAt: IsNull(), expiresAt: LessThan(new Date()) },
      { usedAt: new Date() },
    );
    const token = this.generateResetToken();
    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(
      Date.now() +
        Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30) * 60_000,
    );

    await this.passwordResetTokenRepository.save(
      this.passwordResetTokenRepository.create({
        userType,
        userId,
        tokenHash,
        expiresAt,
        usedAt: null,
        metadata,
      }),
    );

    return { token, expiresAt };
  }

  private async invalidateActiveResetTokens(
    userType: PasswordResetUserType,
    userId: string,
    usedAt = new Date(),
  ) {
    await this.passwordResetTokenRepository.update(
      { userType, userId, usedAt: IsNull() },
      { usedAt },
    );
  }

  private genericPasswordResetRequestResponse() {
    return { message: PASSWORD_RESET_REQUEST_MESSAGE };
  }

  private genericEmailVerificationRequestResponse() {
    return { message: EMAIL_VERIFICATION_REQUEST_MESSAGE };
  }

  private async isPasswordResetEligible(
    userType: PasswordResetUserType,
    user: PlatformAdmin | TenantUser,
  ) {
    if (user.status !== 'active') return false;
    if (userType === 'platform_admin') return true;
    const tenantUser = user as TenantUser;
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantUser.tenantId },
    });
    return tenant?.status === 'active';
  }

  private canDeliverPasswordReset() {
    return Boolean(process.env.SMTP_HOST);
  }

  private buildEmailVerificationUrl(token: string) {
    const baseUrl = resolvePublicBaseUrl(
      process.env,
      'WORKSPACE_PUBLIC_APP_URL',
      {
        allowMissingInDevelopment: true,
      },
    );
    if (!baseUrl) return undefined;
    return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  }

  private async issueEmailVerificationToken(
    user: TenantUser,
    options: {
      emailVerificationTokenRepository?: Repository<EmailVerificationToken>;
      metadata?: Record<string, unknown>;
    } = {},
  ) {
    const repository =
      options.emailVerificationTokenRepository ||
      this.emailVerificationTokenRepository;
    await this.invalidateActiveEmailVerificationTokens(
      user.id,
      new Date(),
      repository,
    );
    const token = this.generateResetToken();
    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(
      Date.now() +
        Number(process.env.EMAIL_VERIFICATION_TTL_MINUTES || 60 * 24) * 60_000,
    );
    const resendAvailableAt = new Date(
      Date.now() +
        Number(process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS || 120) *
          1_000,
    );

    await repository.save(
      repository.create({
        tenantUserId: user.id,
        normalizedEmail: user.normalizedEmail,
        tokenHash,
        expiresAt,
        resendAvailableAt,
        usedAt: null,
        metadata: options.metadata || {},
      }),
    );

    return { token, expiresAt };
  }

  private async invalidateActiveEmailVerificationTokens(
    tenantUserId: string,
    usedAt = new Date(),
    repository = this.emailVerificationTokenRepository,
  ) {
    await repository.update({ tenantUserId, usedAt: IsNull() }, { usedAt });
  }

  private async deliverEmailVerification(
    email: string,
    token: string,
    expiresAt: Date,
  ) {
    const verificationUrl = this.buildEmailVerificationUrl(token);
    if (!verificationUrl) return false;
    return this.emailService.sendEmailVerification(email, {
      verificationUrl,
      expiresAt,
    });
  }

  private async deliverPasswordReset(
    userType: PasswordResetUserType,
    email: string,
    token: string,
    expiresAt: Date,
  ) {
    const resetUrl = this.buildResetPasswordUrl(userType, token);
    if (!resetUrl) return false;
    return this.emailService.sendPasswordReset(email, {
      resetUrl,
      userType,
      expiresAt,
    });
  }

  private ensureStrongPassword(password: string) {
    try {
      assertStrongPassword(password);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Password does not meet the required policy.',
      );
    }
  }

  private async deliverTenantInvite(
    email: string,
    token: string,
    expiresAt: Date,
    options: { invitedBy?: string; tenantId?: string; role?: string },
  ) {
    const inviteUrl = this.buildResetPasswordUrl('tenant_user', token);
    if (!inviteUrl) return false;
    return this.emailService.sendTeamInvite(email, {
      inviteUrl,
      role: options.role || 'owner',
      invitedBy: options.invitedBy,
      expiresAt,
    });
  }

  async updateUserStatus(
    userId: string,
    userType: 'platform_admin' | 'tenant_user',
    isOnline: boolean,
  ): Promise<void> {
    if (userType === 'tenant_user') {
      await this.tenantUserRepository.update(userId, {
        isOnline,
        lastSeenAt: new Date(),
      });
    }
  }
}
