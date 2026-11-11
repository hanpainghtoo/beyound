import {
  Injectable,
  Optional,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Raw } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';

import { PlatformAdmin } from './entities/platform-admin.entity';
import { TenantUser } from './entities/tenant-user.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
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
import type { RegisterFromPricingDto } from './dto/register-from-pricing.dto';
import type { RegisterFromPricingResponseDto } from './dto/register-from-pricing-response.dto';
import { OtpService } from './otp.service';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { BillingAccount } from '../platform-admin/entities/billing-account.entity';
import { MediaLibraryService } from '../media/media-library.service';
import { FeatureToggleService } from '../feature-toggle/feature-toggle.service';
import { createSubscriptionBillingRecord } from '../tenant/subscription-billing.util';
import {
  yangonCalendarDate,
  yangonMonthStart,
  yangonNextMonthStart,
} from '../subscription-period/yangon-month.util';
import { resolvePublicBaseUrl } from '../config/public-base-url';
import { assertStrongPassword } from './password-policy';
import {
  mapTenantUserIdentityConflict,
  normalizeIdentityEmail,
  PUBLIC_REGISTRATION_EMAIL_CONFLICT_MESSAGE,
  TENANT_USER_EMAIL_CONFLICT_MESSAGE,
} from './identity-email.util';
import {
  normalizeTenantRoleInput,
  tenantRoleLabel,
} from '../common/constants/tenant-roles';

const PASSWORD_RESET_REQUEST_MESSAGE =
  'If an eligible account exists, password reset instructions will be sent.';
/**
 * Surfaced deliberately: the reset form tells the visitor when the email is
 * not tied to an account, so a typo is fixable instead of silently "sent".
 * The endpoint stays email-rate-limited to keep enumeration abuse bounded.
 */
export const PASSWORD_RESET_EMAIL_NOT_FOUND_CODE =
  'PASSWORD_RESET_EMAIL_NOT_FOUND';
export const PASSWORD_RESET_EMAIL_NOT_FOUND_MESSAGE =
  "We couldn't find an account for this email address.";
const EMAIL_VERIFICATION_REQUEST_MESSAGE =
  'If verification is required, a verification code will be sent to your email.';
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

/**
 * Authenticated identity handed from validateUser/validateJwtPayload into
 * login/refreshToken. Was `any` before, which disabled type checking on
 * every JWT claim and session field built from it.
 */
export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  type: 'platform_admin' | 'tenant_user';
  tenantId?: string;
  emailVerifiedAt?: Date | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private platformAdminRepository: Repository<PlatformAdmin>;
  private tenantUserRepository: Repository<TenantUser>;
  private tenantRepository: Repository<Tenant>;
  private passwordResetTokenRepository: Repository<PasswordResetToken>;
  private emailVerificationTokenRepository: Repository<EmailVerificationToken>;
  private tenantPolicyConsentRepository: Repository<TenantPolicyConsent>;
  private tenantBillingRecordRepository: Repository<TenantBillingRecord>;
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
    @InjectRepository(TenantBillingRecord)
    tenantBillingRecordRepository: Repository<TenantBillingRecord>,
    jwtService: JwtService,
    configService: ConfigService,
    @Optional() private readonly legalPolicyService: LegalPolicyService,
    private readonly emailService: EmailService,
    private readonly subscriptionPeriodService: SubscriptionPeriodService,
    private readonly otpService: OtpService,
    @Optional() private readonly mediaLibraryService?: MediaLibraryService,
    // Plan 55: seeds the per-tenant feature toggle rows (all enabled) for
    // every newly registered tenant.
    @Optional() private readonly featureToggleService?: FeatureToggleService,
  ) {
    this.platformAdminRepository = platformAdminRepository;
    this.tenantUserRepository = tenantUserRepository;
    this.tenantRepository = tenantRepository;
    this.passwordResetTokenRepository = passwordResetTokenRepository;
    this.emailVerificationTokenRepository = emailVerificationTokenRepository;
    this.tenantPolicyConsentRepository = tenantPolicyConsentRepository;
    this.tenantBillingRecordRepository = tenantBillingRecordRepository;
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
      const { passwordHash, ...result } = platformAdmin; // eslint-disable-line @typescript-eslint/no-unused-vars -- rest-omit
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
        passwordHash, // eslint-disable-line @typescript-eslint/no-unused-vars -- rest-omit
        normalizedEmail: _normalizedEmail, // eslint-disable-line @typescript-eslint/no-unused-vars -- rest-omit
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
        const { passwordHash, ...result } = admin; // eslint-disable-line @typescript-eslint/no-unused-vars -- rest-omit
        return { ...result, type: 'platform_admin' };
      }
    } else if (payload.type === 'tenant_user') {
      const user = await this.tenantUserRepository.findOne({
        where: { id: payload.sub, status: 'active' },
      });
      if (user) {
        await this.assertTenantCanUseSystem(user.tenantId);
        const {
          passwordHash, // eslint-disable-line @typescript-eslint/no-unused-vars -- rest-omit
          normalizedEmail: _normalizedEmail, // eslint-disable-line @typescript-eslint/no-unused-vars -- rest-omit
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
      throw new ForbiddenException({
        statusCode: 403,
        message:
          'This workspace is currently inactive. Contact your administrator.',
        code: 'ACCOUNT_INACTIVE',
      });
    }
  }

  async login(user: SessionUser): Promise<AuthResponseDto> {
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
      role: normalizeTenantRoleInput(registerDto.role) || 'agent',
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
    const normalizedCompanyName = registerDto.companyName.trim().toLowerCase();
    const existingTenant = await this.tenantRepository.findOne({
      where: {
        companyName: Raw((column) => `LOWER(TRIM(${column})) = :companyName`, {
          companyName: normalizedCompanyName,
        }),
      },
    });

    if (existingTenant) {
      throw new ConflictException(
        'A workspace with this company name already exists.',
      );
    }

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

        // Plan 55: every catalog feature starts enabled for a new tenant.
        await this.featureToggleService?.seedDefaultsForTenant(
          savedTenant.id,
          manager,
        );

        // Create exactly one auto-approved trial period (server-side trial
        // plan + exact duration). No legacy `tenant_entitlements` trial row is
        // ever created (task 2.5).
        const trialPeriodEnd = new Date(now);
        trialPeriodEnd.setUTCDate(
          trialPeriodEnd.getUTCDate() + trialPlan.durationDays,
        );
        const trialBillingRecord = await createSubscriptionBillingRecord(
          manager,
          {
            tenantId: savedTenant.id,
            plan: trialPlan,
            billingPeriodStart: now,
            billingPeriodEnd: trialPeriodEnd,
            amountDue: 0,
            amountPaid: 0,
            reviewStatus: 'confirm',
            paidAt: now,
            requestedBy: null,
            notes:
              'Zero-cost trial subscription invoice settled automatically.',
            metadata: {
              source: 'self_registration',
              purchaseRequestType: 'subscription_period',
              trial: true,
              zeroCost: true,
              selectedPlanId: trialPlan.id,
              selectedPlanName: trialPlan.name,
              idempotencyKey: `self-registration:${savedTenant.id}`,
            },
          },
        );
        const trialPeriod =
          await this.subscriptionPeriodService.ensureTrialPeriodForTenant(
            savedTenant.id,
            { type: 'tenant_user', id: normalizedEmail },
            { manager, now, billingRecordId: trialBillingRecord.id },
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
        return { savedUser };
      };

      const manager = this.tenantRepository.manager;
      const { savedUser } = manager?.transaction
        ? await manager.transaction(async (transactionManager) =>
            createRecords(transactionManager),
          )
        : await createRecords(manager);

      const otp = await this.otpService.generate(
        savedUser.normalizedEmail,
        'email_verification',
        {
          source: 'self_registration',
          tenantId: savedUser.tenantId,
          tenantUserId: savedUser.id,
        },
      );
      const session = await this.login({ ...savedUser, type: 'tenant_user' });
      return {
        ...session,
        emailVerificationRequired: true,
        emailVerificationDelivery: 'requested',
        emailVerificationExpiresAt: otp.expiresAt,
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

  refreshToken(user: SessionUser): { accessToken: string } {
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
      passwordHash, // eslint-disable-line @typescript-eslint/no-unused-vars -- rest-omit
      normalizedEmail: _normalizedEmail, // eslint-disable-line @typescript-eslint/no-unused-vars -- rest-omit
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
    if (!match?.user) {
      // No active account owns this email. Surfacing this (instead of the
      // generic "if an eligible account exists..." response) lets the visitor
      // fix a typo immediately; the endpoint's email-aware throttle keeps
      // enumeration abuse bounded.
      throw new BadRequestException({
        code: PASSWORD_RESET_EMAIL_NOT_FOUND_CODE,
        message: PASSWORD_RESET_EMAIL_NOT_FOUND_MESSAGE,
      });
    }
    if (!(await this.isPasswordResetEligible(match.type, match.user))) {
      // The account exists but cannot receive a reset right now (for example
      // a suspended tenant). Keep the generic response so the account's
      // status is never revealed.
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

    const otp = await this.otpService.generate(
      user.normalizedEmail,
      'email_verification',
      {
        source: 'email_verification_resend',
        tenantId: user.tenantId,
        tenantUserId: user.id,
      },
    );
    return {
      ...this.genericEmailVerificationRequestResponse(),
      expiresAt: otp.expiresAt,
      expiresInSeconds: otp.expiresInSeconds,
      resendAvailableAt: otp.resendAvailableAt,
    };
  }

  async checkEmailExists(email: string) {
    const normalizedEmail = normalizeIdentityEmail(email);
    const user = await this.tenantUserRepository.findOne({
      where: { normalizedEmail },
    });
    return {
      exists: !!user,
      message: user
        ? 'An account with this email already exists.'
        : 'No account found with this email.',
    };
  }

  async verifyEmailWithOtp(
    email: string,
    code: string,
  ): Promise<AuthResponseDto> {
    const normalizedEmail = normalizeIdentityEmail(email);
    await this.otpService.verify(normalizedEmail, code, 'email_verification');

    const user = await this.tenantUserRepository.findOne({
      where: { normalizedEmail, status: 'active' },
    });
    if (!user) {
      throw new NotFoundException(
        'No active workspace account found for this email.',
      );
    }

    const verifiedAt = user.emailVerifiedAt || new Date();
    if (!user.emailVerifiedAt) {
      await this.tenantUserRepository.update(user.id, {
        emailVerifiedAt: verifiedAt,
      });
      user.emailVerifiedAt = verifiedAt;
    }

    return this.login({ ...user, type: 'tenant_user' });
  }

  /** @deprecated The public endpoint now verifies email with OTP. */
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
    const inviteUrl = this.buildTenantInviteUrl(token);
    const inviteContext = await this.resolveTenantInviteContext(options);
    try {
      const delivered = await this.deliverTenantInvite(
        normalizedEmail,
        inviteUrl,
        expiresAt,
        options,
        inviteContext,
      );
      if (!delivered) {
        await this.invalidateActiveResetTokens('tenant_user', userId);
        throw new Error('Team invitation delivery is unavailable');
      }
    } catch (error) {
      // Never leave a usable invite behind when the email was not delivered.
      // This also makes a retry safe instead of leaving the pending user stuck
      // behind an active token or a misleading success response.
      await this.invalidateActiveResetTokens('tenant_user', userId);
      throw error;
    }

    // Returned so authorized managers can copy the link for manual sharing.
    // It is the same one-time, short-lived URL the invitee receives by email
    // (token is invalidated on use/reissue; TTL is PASSWORD_RESET_TTL_MINUTES).
    return {
      message: 'Team invitation requested',
      invitationDelivery: 'requested' as const,
      expiresAt,
      inviteUrl,
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

  private buildTenantInviteUrl(token: string) {
    const baseUrl = this.resolveAppBaseUrlForReset('tenant_user');
    if (!baseUrl) return undefined;
    return `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`;
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
    if (!this.emailService) {
      this.logger.warn(
        'Email service not available — skipping email verification delivery',
        'AuthService',
      );
      return false;
    }
    const verificationUrl = this.buildEmailVerificationUrl(token);
    if (!verificationUrl) return false;
    try {
      return await this.emailService.sendEmailVerification(email, {
        verificationUrl,
        expiresAt,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send email verification to ${email}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        'AuthService',
      );
      return false;
    }
  }

  private async deliverPasswordReset(
    userType: PasswordResetUserType,
    email: string,
    token: string,
    expiresAt: Date,
  ) {
    if (!this.emailService) {
      this.logger.warn(
        'Email service not available — skipping password reset email delivery',
        'AuthService',
      );
      return false;
    }
    const resetUrl = this.buildResetPasswordUrl(userType, token);
    if (!resetUrl) return false;
    try {
      return await this.emailService.sendPasswordReset(email, {
        resetUrl,
        userType,
        expiresAt,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${email}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        'AuthService',
      );
      return false;
    }
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
    inviteUrl: string | undefined,
    expiresAt: Date,
    options: { invitedBy?: string; tenantId?: string; role?: string },
    context: { companyName: string; inviterName: string },
  ) {
    if (!this.emailService) {
      this.logger.warn(
        'Email service not available — skipping team invitation email delivery',
        'AuthService',
      );
      return false;
    }
    if (!inviteUrl) return false;
    return this.emailService.sendTeamInvite(email, {
      inviteUrl,
      logoUrl: new URL('/zayos-mark-light.png', inviteUrl).toString(),
      role: tenantRoleLabel(options.role || 'owner'),
      companyName: context.companyName,
      inviterName: context.inviterName,
      expiresAt,
    });
  }

  private async resolveTenantInviteContext(options: {
    invitedBy?: string;
    tenantId?: string;
    role?: string;
  }) {
    const [tenant, inviter] = await Promise.all([
      options.tenantId
        ? this.tenantRepository.findOne({ where: { id: options.tenantId } })
        : Promise.resolve(null),
      options.invitedBy && options.invitedBy !== 'platform-admin'
        ? this.tenantUserRepository.findOne({
            where: { id: options.invitedBy },
          })
        : Promise.resolve(null),
    ]);

    return {
      companyName: tenant?.companyName || 'your ZayOS workspace',
      inviterName:
        inviter?.fullName?.trim() ||
        (options.invitedBy === 'platform-admin'
          ? 'the ZayOS team'
          : 'your workspace administrator'),
    };
  }

  async getTenantInviteContext(token: string) {
    const tokenHash = this.hashResetToken(token.trim());
    const invite = await this.passwordResetTokenRepository.findOne({
      where: { tokenHash },
    });
    if (
      !invite ||
      invite.userType !== 'tenant_user' ||
      invite.metadata?.purpose !== 'team_invite' ||
      invite.usedAt ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'This invitation link is invalid or has expired.',
      );
    }

    const user = await this.tenantUserRepository.findOne({
      where: { id: invite.userId },
    });
    const inviteMetadata = invite.metadata as {
      tenantId?: string;
      invitedBy?: string;
    } | null;
    const tenantId = inviteMetadata?.tenantId || user?.tenantId;
    const tenant = tenantId
      ? await this.tenantRepository.findOne({ where: { id: tenantId } })
      : null;
    if (
      !user ||
      user.status !== 'inactive' ||
      !tenant ||
      tenant.status !== 'active'
    ) {
      throw new BadRequestException(
        'This invitation link is invalid or has expired.',
      );
    }

    const inviterId = inviteMetadata?.invitedBy;
    const inviter =
      inviterId && inviterId !== 'platform-admin'
        ? await this.tenantUserRepository.findOne({ where: { id: inviterId } })
        : null;

    return {
      email: user.email,
      companyName: tenant.companyName || tenant.tenantCode,
      role: user.role,
      inviterName:
        inviter?.fullName?.trim() ||
        (inviterId === 'platform-admin'
          ? 'the ZayOS team'
          : 'your workspace administrator'),
      expiresAt: invite.expiresAt,
    };
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

  async registerFromPricing(
    registerDto: RegisterFromPricingDto,
    metadata: { ipAddress?: string; userAgent?: string } = {}, // eslint-disable-line @typescript-eslint/no-unused-vars -- accepted for future audit wiring, currently unconsumed
  ): Promise<RegisterFromPricingResponseDto> {
    const normalizedCompanyEmail = normalizeIdentityEmail(
      registerDto.companyEmail,
    );
    const normalizedPersonalEmail = normalizeIdentityEmail(
      registerDto.personalEmail,
    );

    const existingUser = await this.tenantUserRepository.findOne({
      // Plan 47 (R2.1): the login identity is the personal (user) email from
      // step 2 — the company email from step 1 identifies the tenant, not
      // the user. Company emails stay non-unique across tenants.
      where: { normalizedEmail: normalizedPersonalEmail },
    });
    if (existingUser) {
      throw new ConflictException(PUBLIC_REGISTRATION_EMAIL_CONFLICT_MESSAGE);
    }

    this.ensureStrongPassword(registerDto.password);
    const saltRounds =
      this.configService.get<number>('auth.bcryptRounds') || 12;
    const passwordHash = await bcrypt.hash(registerDto.password, saltRounds);
    const { firstName, lastName } = splitFullName(registerDto.fullName);
    const now = new Date();

    const paymentId = `pay_${Date.now()}_${randomBytes(8).toString('hex')}`;

    // Plan 47 (R2.7): registrations bill the current Yangon calendar month
    // exactly like the purchase flow — the admin confirm path rejects any
    // other window (assertYangonCalendarBillingWindow). Shared by the
    // billing record, the registration period, and the invoice email.
    const monthStart = yangonMonthStart(now);
    const monthEnd = yangonNextMonthStart(now);

    const createRecords = async (manager: EntityManager) => {
      const tenantRepository = manager.getRepository(Tenant);
      const tenantUserRepository = manager.getRepository(TenantUser);

      // Plan 47: the requested plan is resolved from the live subscription
      // plans table — 404 for unknown/inactive ids, 400 for trial plans
      // (trials register through the dedicated start-trial flow).
      const requestedPlan = await manager
        .getRepository(SubscriptionPlan)
        .findOne({ where: { id: registerDto.subscriptionPlanId } });
      if (!requestedPlan || requestedPlan.status !== 'active') {
        throw new NotFoundException(
          'The selected plan was not found or is not active. Please choose another plan.',
        );
      }
      if (requestedPlan.planType === 'trial') {
        throw new BadRequestException(
          'This plan is not available for pricing registration. Please use the free trial instead.',
        );
      }

      const tenant = tenantRepository.create({
        tenantCode: await this.generateTenantCode(registerDto.companyName),
        companyName: registerDto.companyName.trim(),
        businessType: registerDto.businessType?.trim() || undefined,
        contactPerson: registerDto.fullName.trim(),
        contactEmail: normalizedCompanyEmail,
        contactPhone: undefined,
        description: registerDto.note?.trim() || undefined,
        // Plan 47 (R2.4): pricing registrations activate immediately. Access
        // to paid quota stays gated by the unpaid period (see
        // createRegistrationPeriod) until admin payment confirmation.
        status: 'active',
        approvedAt: now,
        subscriptionPlanId: requestedPlan.id,
        featureFlags: {
          pricingRegistration: {
            plan: requestedPlan.name,
            subscriptionPlanId: requestedPlan.id,
            teamSize: registerDto.teamSize?.trim() || null,
            registeredAt: now.toISOString(),
          },
        },
      } as Partial<Tenant>);
      const savedTenant = await tenantRepository.save(tenant);

      // Plan 55: every catalog feature starts enabled for a new tenant. Seeded
      // with the enclosing transaction's manager so the rows join the same
      // transaction and can see the not-yet-committed tenant.
      await this.featureToggleService?.seedDefaultsForTenant(
        savedTenant.id,
        manager,
      );

      const tenantUser = tenantUserRepository.create({
        tenantId: savedTenant.id,
        fullName: registerDto.fullName.trim(),
        firstName,
        lastName,
        // Plan 47 (R2.1): the user row carries the personal email — OTP is
        // sent there and verification looks the user up by it.
        email: registerDto.personalEmail.trim(),
        normalizedEmail: normalizedPersonalEmail,
        passwordHash,
        role: 'owner',
        status: 'active',
        emailVerifiedAt: null,
        permissions: { all: true, selfRegistered: true },
        notificationPreferences: { email: true, inApp: true },
      } as Partial<TenantUser>);
      const savedUser = await tenantUserRepository.save(tenantUser);

      // Plan 47 (R2.3): step 3 submits a live billing-account id as
      // paymentMethodOptionId. Link it like the purchase flow (Plan 31) so
      // the invoice and the confirmation email name the real destination.
      const selectedBillingAccount = await this.findRegistrationBillingAccount(
        manager,
        registerDto.paymentMethodOptionId,
      );

      // Plan 47 (R2.2): attach a pre-uploaded registration proof, if any.
      const proofFileId = registerDto.paymentProofFileId?.trim() || null;
      if (proofFileId) {
        await this.assertRegistrationProofUnclaimed(proofFileId);
      }

      // Plan 47: mirror the workspace billing module's proof-submission
      // contract (tenant.service.ts `submitPaymentProof`) — the platform
      // "Review proof" action confirms with `proof.paidAmount`, so the
      // registration receipt must carry the full plan price and submitted
      // date or confirmation fails the amountPaid === amountDue guard
      // (Plan 24: full-payment-only, no partial payments).
      const paymentProofSubmission = proofFileId
        ? {
            id: `proof-${paymentId}-${now.toISOString()}`,
            status: 'pending_review',
            reviewStatus: 'pending_review',
            paymentMethod: selectedBillingAccount
              ? this.mapBillingAccountToPaymentMethod(selectedBillingAccount)
              : null,
            paidAmount: Number(requestedPlan.monthlyPrice || 0),
            paidDate: now.toISOString(),
            transactionReference: null,
            mediaFileId: proofFileId,
            fileName: null,
            mediaScanStatus: null,
            note: registerDto.note?.trim() || null,
            submittedBy: savedUser.id,
            submittedAt: now.toISOString(),
            source: 'pricing_registration',
          }
        : null;

      const savedBillingRecord = await createSubscriptionBillingRecord(
        manager,
        {
          tenantId: savedTenant.id,
          plan: requestedPlan,
          billingPeriodStart: yangonCalendarDate(monthStart),
          billingPeriodEnd: yangonCalendarDate(monthEnd),
          amountDue: Number(requestedPlan.monthlyPrice || 0),
          amountPaid: 0,
          reviewStatus: 'in_review',
          requestedBy: savedUser.id,
          billingAccountId: selectedBillingAccount?.id ?? null,
          issueDate: now,
          notes: registerDto.note?.trim() || null,
          metadata: {
            idempotencyKey: paymentId,
            paymentMethodOptionId: registerDto.paymentMethodOptionId,
            source: 'pricing_registration',
            companyEmail: normalizedCompanyEmail,
            personalEmail: normalizedPersonalEmail,
            // Plan 47 (R2.6): the workspace packages tab only treats an
            // invoice as a blocking pending request when it carries the
            // purchase-flow request type; startOption follows the same
            // convention so confirm takes the current-month path.
            purchaseRequestType: 'subscription_period',
            requestedStartOption: 'current_month',
            startOption: 'current_month',
            ...(selectedBillingAccount
              ? {
                  selectedPaymentAccountId: selectedBillingAccount.id,
                  selectedPaymentAccount: selectedBillingAccount.accountName,
                }
              : {}),
            ...(paymentProofSubmission
              ? {
                  paymentProof: paymentProofSubmission,
                  // Same submission-history shape as the workspace billing
                  // module so the platform review updates both entries.
                  paymentProofSubmissions: [paymentProofSubmission],
                }
              : {}),
          },
        },
      );
      if (proofFileId) {
        savedBillingRecord.paymentProofFileId = proofFileId;
        await manager
          .getRepository(TenantBillingRecord)
          .save(savedBillingRecord);
      }

      // Plan 47 (R2.4): unpaid-but-active period row so the owner can log in
      // and complete payment. Billable paths resolve PERIOD_PAYMENT_NOT_
      // CONFIRMED until the admin confirm flips this same row to paid.
      await this.subscriptionPeriodService.createRegistrationPeriod(manager, {
        tenantId: savedTenant.id,
        plan: requestedPlan,
        billingRecordId: savedBillingRecord.id,
        monthStartAt: monthStart,
        monthEndAt: monthEnd,
        startOption: 'current_month',
      });

      return {
        savedTenant,
        savedUser,
        savedBillingRecord,
        requestedPlan,
        paymentId,
      };
    };

    const manager = this.tenantRepository.manager;
    const {
      savedTenant,
      savedUser,
      savedBillingRecord,
      requestedPlan,
      paymentId: pid,
    } = manager?.transaction
      ? await manager.transaction(async (transactionManager) =>
          createRecords(transactionManager),
        )
      : await createRecords(manager);

    // Plan 47 (R2.3): invoice-issued notice to the COMPANY email, mirroring
    // the purchase flow. Fire-and-forget: delivery failure must never block
    // registration.
    if (this.emailService && savedTenant.contactEmail) {
      const baseUrl = resolvePublicBaseUrl(
        process.env,
        'WORKSPACE_PUBLIC_APP_URL',
        { allowMissingInDevelopment: true },
      );
      const billingAccountLabel =
        (savedBillingRecord.metadata?.selectedPaymentAccount as string) || null;
      void this.emailService
        .sendInvoiceIssued(savedTenant.contactEmail, {
          companyName:
            savedTenant.companyName || savedTenant.tenantCode || 'there',
          invoiceNo: savedBillingRecord.invoiceNo || 'your latest invoice',
          planName: requestedPlan.name,
          // Plan 47 (R2.7): same Yangon calendar-month bounds as the record.
          billingPeriodLabel: `${yangonCalendarDate(monthStart).toISOString().slice(0, 10)} – ${yangonCalendarDate(monthEnd).toISOString().slice(0, 10)}`,
          amountDue: `MMK ${Number(savedBillingRecord.amountDue || 0).toLocaleString()}`,
          invoiceUrl: baseUrl
            ? `${baseUrl}/workspace/billing/invoice/${savedBillingRecord.id}`
            : '',
          lineDescription: `${requestedPlan.name} subscription`,
          paymentMethodLabel: billingAccountLabel,
          paymentAccount: billingAccountLabel,
          requestNote: registerDto.note?.trim() || null,
        })
        .catch(() => undefined);
    }

    // Plan 47 (R2.1): OTP goes to the personal email with the shared
    // email_verification purpose so the existing verify-email page signs the
    // owner in without any dedicated flow.
    const otp = await this.otpService.generate(
      normalizedPersonalEmail,
      'email_verification',
      {
        paymentId: pid,
        tenantId: savedTenant.id,
        tenantUserId: savedUser.id,
        companyEmail: normalizedCompanyEmail,
      },
    );

    return {
      success: true,
      paymentId: pid,
      invoiceNo: savedBillingRecord.invoiceNo ?? '',
      email: normalizedPersonalEmail,
      emailVerificationExpiresAt: otp.expiresAt,
      resendAvailableAt: otp.resendAvailableAt,
      message:
        'Merchant account created. Please verify with the code sent to your personal email.',
    };
  }

  /**
   * Plan 47 (R2.2): unauthenticated signed upload slot for a pricing-
   * registration payment proof. Platform-scoped (the tenant does not exist
   * yet); the file id is claimed by `registerFromPricing`. Purpose is forced
   * server-side and the slot must stay image-only and small.
   */
  async createRegistrationPaymentProofUpload(input: {
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<{ fileId: string; uploadUrl: string; expiresAt?: string }> {
    if (!this.mediaLibraryService) {
      throw new ServiceUnavailableException(
        'Payment receipt upload is currently unavailable.',
      );
    }
    const allowedContentTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];
    if (!allowedContentTypes.includes(input.contentType)) {
      throw new BadRequestException(
        'Payment receipt must be a JPG, PNG, WebP, or GIF image.',
      );
    }
    if (
      !Number.isFinite(input.sizeBytes) ||
      input.sizeBytes < 1 ||
      input.sizeBytes > 5 * 1024 * 1024
    ) {
      throw new BadRequestException(
        'Payment receipt must be between 1 byte and 5 MB.',
      );
    }
    const fileName = input.fileName.trim().slice(0, 255);
    if (!fileName) {
      throw new BadRequestException('A file name is required.');
    }
    const signed = await this.mediaLibraryService.createPlatformUpload(
      'pricing-registration',
      {
        fileName,
        contentType: input.contentType,
        sizeBytes: Math.floor(input.sizeBytes),
        purpose: 'billing-payment-proof',
        metadata: { source: 'pricing_registration', claimed: false },
      },
    );
    return {
      fileId: signed.file.id,
      uploadUrl: signed.upload.url,
      expiresAt: signed.upload.expiresAt,
    };
  }

  /**
   * Plan 47 (R2.3): step 3 submits a live billing-account id as
   * `paymentMethodOptionId`. Resolve it so the invoice links the real
   * destination; unknown values stay metadata-only (never a 400 for a
   * client that predates the accounts module).
   */
  private async findRegistrationBillingAccount(
    manager: EntityManager,
    paymentMethodOptionId: string,
  ): Promise<BillingAccount | null> {
    const trimmed = paymentMethodOptionId?.trim() || '';
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trimmed,
      )
    ) {
      return null;
    }
    return manager.getRepository(BillingAccount).findOne({
      where: { id: trimmed },
    });
  }

  /**
   * Map a billing account to the corresponding payment method value
   * used in the payment proof. Mirrors the logic in
   * `dashboards/workspace/lib/billing-payment-accounts.ts`.
   */
  private mapBillingAccountToPaymentMethod(account: BillingAccount): string {
    if (account.type === 'bank_account') {
      return 'bank_transfer';
    }
    // Digital wallet: infer kbzpay vs wavepay from account name
    if (/wave/i.test(account.accountName)) {
      return 'wavepay';
    }
    return 'kbzpay';
  }

  /**
   * Plan 47 (R2.2): the claimed proof must be a ready platform-scoped
   * billing-proof upload (correct purpose, bytes actually uploaded).
   */
  private async assertRegistrationProofUnclaimed(
    fileId: string,
  ): Promise<void> {
    if (!this.mediaLibraryService) {
      throw new ServiceUnavailableException(
        'Payment receipt upload is currently unavailable.',
      );
    }
    await this.mediaLibraryService.getPlatformBillingProofFile(fileId);
  }

  async otpLogin(email: string, code: string): Promise<AuthResponseDto> {
    await this.otpService.verify(email, code, 'otp_login');

    const normalizedEmail = normalizeIdentityEmail(email);
    const tenantUser = await this.tenantUserRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.normalizedEmail = :normalizedEmail', { normalizedEmail })
      .andWhere('user.status = :status', { status: 'active' })
      .getOne();

    if (!tenantUser) {
      throw new NotFoundException('No active account found for this email.');
    }

    const {
      passwordHash, // eslint-disable-line @typescript-eslint/no-unused-vars -- rest-omit
      normalizedEmail: _normalizedEmail, // eslint-disable-line @typescript-eslint/no-unused-vars -- rest-omit
      ...result
    } = tenantUser;
    return this.login({ ...result, type: 'tenant_user' });
  }
}
