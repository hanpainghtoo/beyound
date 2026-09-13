import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, type EntityManager, type Repository } from 'typeorm';

import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { PlatformAdmin } from '../auth/entities/platform-admin.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { TenantAnalytics } from '../analytics/entities/tenant-analytics.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Order } from '../order/entities/order.entity';
import { Product } from '../product/entities/product.entity';
import { TenantRateLimit } from '../tenant/entities/tenant-rate-limit.entity';
import { PlatformSetting } from './entities/platform-setting.entity';
import { TenantBillingRecord } from './entities/tenant-billing-record.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { Customer } from '../customer/entities/customer.entity';
import { Lead } from '../lead/entities/lead.entity';
import { EntitlementService } from '../entitlement/entitlement.service';
import {
  SubscriptionPeriodService,
  isTrialOperational,
} from '../subscription-period/subscription-period.service';
import { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';
import { TenantSubscriptionPeriodUpgradeRevision } from '../subscription-period/entities/tenant-subscription-period-upgrade-revision.entity';
import { SubscriptionPeriodEvent } from '../subscription-period/entities/subscription-period-event.entity';
import type { SubscriptionPeriodEventType } from '../subscription-period/entities/subscription-period-event.entity';
import { MediaLibraryService } from '../media/media-library.service';
import { SubscriptionAddOnPurchaseService } from '../subscription-add-on/subscription-add-on-purchase.service';
import {
  yangonCalendarDate,
  yangonMonthEnd,
  yangonMonthStart,
  yangonWallClockToUtc,
} from '../subscription-period/yangon-month.util';

import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';
import type { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import type { TenantApprovalDto } from './dto/tenant-approval.dto';
import type { PlatformAdminStatsDto } from './dto/platform-admin-stats.dto';
import type {
  ChangeTenantSubscriptionPlanDto,
  CreateTenantBillingRecordDto,
  ReviewPaymentProofDto,
  SendTenantBillingReminderDto,
  UpdateTenantBillingRecordDto,
} from './dto/tenant-billing-record.dto';
import type { PaginationDto } from '../common/dto/pagination.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { NotificationService } from '../notification/notification.service';
import { AuthService } from '../auth/auth.service';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';

const billingInvoiceStatuses = ['draft', 'issued', 'void'] as const;
const billingPaymentStatuses = [
  'unpaid',
  'partially_paid',
  'paid',
  'overdue',
  'waived',
] as const;
const billingCollectionPolicy = {
  overdueAllowedAfterDueDate: true,
  suspensionGraceDaysAfterDueDate: 7,
  dataRetentionOnSuspension: 'preserve_tenant_data',
} as const;
const allowedPaymentStatusTransitions: Record<string, string[]> = {
  unpaid: ['unpaid', 'partially_paid', 'paid', 'overdue', 'waived'],
  partially_paid: ['partially_paid', 'paid', 'overdue', 'waived'],
  overdue: ['overdue', 'partially_paid', 'paid', 'waived'],
  paid: ['paid'],
  waived: ['waived'],
};

const tenantSortColumns: Record<string, string> = {
  createdAt: 'tenant.createdAt',
  updatedAt: 'tenant.updatedAt',
  companyName: 'tenant.companyName',
  tenantCode: 'tenant.tenantCode',
  contactEmail: 'tenant.contactEmail',
  status: 'tenant.status',
};

const defaultTenantRateLimit = {
  messagesPerMinute: 60,
  apiRequestsPerMinute: 100,
  webhookEventsPerMinute: 50,
  throttlingMode: 'soft_warning',
  graceLimitPercentage: 20,
} as const;

type UsageType = 'api_request' | 'provider_message';
type UsageMetricKey = 'csrs' | 'channels' | 'apiRequests' | 'providerMessages';

type UsageWarning = {
  metric: UsageMetricKey;
  severity: 'warning' | 'limit_reached';
  used: number;
  limit: number;
  percentUsed: number;
};

type PlatformOrderFilters = {
  tenantId?: string;
  status?: string;
  paymentStatus?: string;
  channelType?: string;
  dateFrom?: string;
  dateTo?: string;
};

type PlatformProductFilters = {
  tenantId?: string;
  status?: string;
};

type PlatformConversationFilters = {
  tenantId?: string;
  status?: string;
  channelType?: string;
  dateFrom?: string;
  dateTo?: string;
};

@Injectable()
export class PlatformAdminService {
  private tenantRepository: Repository<Tenant>;
  private subscriptionPlanRepository: Repository<SubscriptionPlan>;
  private platformAdminRepository: Repository<PlatformAdmin>;
  private tenantUserRepository: Repository<TenantUser>;
  private tenantAnalyticsRepository: Repository<TenantAnalytics>;
  private tenantChannelRepository: Repository<TenantChannel>;
  private conversationRepository: Repository<Conversation>;
  private orderRepository: Repository<Order>;
  private productRepository: Repository<Product>;
  private tenantRateLimitRepository: Repository<TenantRateLimit>;
  private platformSettingRepository: Repository<PlatformSetting>;
  private tenantUsageRepository: Repository<TenantUsageEvent>;
  private tenantBillingRecordRepository: Repository<TenantBillingRecord>;
  private subscriptionPeriodRepository: Repository<TenantSubscriptionPeriod>;
  private tenantEntitlementRepository: Repository<TenantEntitlement>;
  private leadRepository: Repository<Lead>;

  constructor(
    @InjectRepository(Tenant)
    tenantRepository: Repository<Tenant>,
    @InjectRepository(SubscriptionPlan)
    subscriptionPlanRepository: Repository<SubscriptionPlan>,
    @InjectRepository(PlatformAdmin)
    platformAdminRepository: Repository<PlatformAdmin>,
    @InjectRepository(TenantUser)
    tenantUserRepository: Repository<TenantUser>,
    @InjectRepository(TenantAnalytics)
    tenantAnalyticsRepository: Repository<TenantAnalytics>,
    @InjectRepository(TenantChannel)
    tenantChannelRepository: Repository<TenantChannel>,
    @InjectRepository(Conversation)
    conversationRepository: Repository<Conversation>,
    @InjectRepository(Order)
    orderRepository: Repository<Order>,
    @InjectRepository(Product)
    productRepository: Repository<Product>,
    @InjectRepository(TenantRateLimit)
    tenantRateLimitRepository: Repository<TenantRateLimit>,
    @InjectRepository(PlatformSetting)
    platformSettingRepository: Repository<PlatformSetting>,
    @InjectRepository(TenantUsageEvent)
    tenantUsageRepository: Repository<TenantUsageEvent>,
    @InjectRepository(TenantBillingRecord)
    tenantBillingRecordRepository: Repository<TenantBillingRecord>,
    @InjectRepository(TenantSubscriptionPeriod)
    subscriptionPeriodRepository: Repository<TenantSubscriptionPeriod>,
    @InjectRepository(TenantEntitlement)
    tenantEntitlementRepository: Repository<TenantEntitlement>,
    @InjectRepository(Lead)
    leadRepository: Repository<Lead>,
    private notificationService: NotificationService,
    private entitlementService: EntitlementService,
    private authService: AuthService,
    private readonly subscriptionPeriodService: SubscriptionPeriodService,
    private readonly mediaLibraryService: MediaLibraryService,
    @Optional()
    private readonly subscriptionAddOnPurchaseService?: SubscriptionAddOnPurchaseService,
  ) {
    this.tenantRepository = tenantRepository;
    this.subscriptionPlanRepository = subscriptionPlanRepository;
    this.platformAdminRepository = platformAdminRepository;
    this.tenantUserRepository = tenantUserRepository;
    this.tenantAnalyticsRepository = tenantAnalyticsRepository;
    this.tenantChannelRepository = tenantChannelRepository;
    this.conversationRepository = conversationRepository;
    this.orderRepository = orderRepository;
    this.productRepository = productRepository;
    this.tenantRateLimitRepository = tenantRateLimitRepository;
    this.platformSettingRepository = platformSettingRepository;
    this.tenantUsageRepository = tenantUsageRepository;
    this.tenantBillingRecordRepository = tenantBillingRecordRepository;
    this.subscriptionPeriodRepository = subscriptionPeriodRepository;
    this.tenantEntitlementRepository = tenantEntitlementRepository;
    this.leadRepository = leadRepository;
  }

  async getDashboardStats(): Promise<PlatformAdminStatsDto> {
    const [
      totalTenants,
      activeTenants,
      pendingTenants,
      suspendedTenants,
      totalUsers,
      activeUsers,
      connectedChannels,
    ] = await Promise.all([
      this.tenantRepository.count(),
      this.tenantRepository.count({ where: { status: 'active' } }),
      this.tenantRepository.count({ where: { status: 'pending' } }),
      this.tenantRepository.count({ where: { status: 'suspended' } }),
      this.tenantUserRepository.count(),
      this.tenantUserRepository.count({ where: { status: 'active' } }),
      this.tenantChannelRepository.count({ where: { status: 'active' } }),
    ]);

    // Calculate monthly message volume from analytics
    const currentMonth = new Date();
    currentMonth.setDate(1);
    const monthlyAnalytics = await this.tenantAnalyticsRepository
      .createQueryBuilder('analytics')
      .select('SUM(analytics.total_messages)', 'totalMessages')
      .where('analytics.date >= :startDate', { startDate: currentMonth })
      .getRawOne();

    const monthlyMessageVolume = Number.parseInt(
      monthlyAnalytics?.totalMessages || '0',
      10,
    );
    const totalRevenueResult = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.total_amount)', 'total')
      .where('order.payment_status = :status', { status: 'paid' })
      .getRawOne();
    const monthlyRevenueResult = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.total_amount)', 'total')
      .where('order.payment_status = :status', { status: 'paid' })
      .andWhere('order.created_at >= :startDate', { startDate: currentMonth })
      .getRawOne();

    return {
      totalTenants,
      activeTenants,
      pendingTenants,
      suspendedTenants,
      totalUsers,
      activeUsers,
      monthlyMessageVolume,
      connectedChannels,
      totalRevenue: Number.parseFloat(totalRevenueResult?.total || '0'),
      monthlyRevenue: Number.parseFloat(monthlyRevenueResult?.total || '0'),
    };
  }

  async getAllTenants(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<Tenant>> {
    const { page = 1, limit = 10, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.tenantRepository.createQueryBuilder('tenant');

    if (search) {
      queryBuilder.where(
        'tenant.company_name ILIKE :search OR tenant.contact_email ILIKE :search OR tenant.tenant_code ILIKE :search',
        { search: `%${search}%` },
      );
    }

    queryBuilder.orderBy(
      tenantSortColumns[sortBy || 'createdAt'] || 'tenant.createdAt',
      sortOrder || 'DESC',
    );

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getTenantById(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      where: { id },
      relations: ['approver'],
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async createTenant(createTenantDto: CreateTenantDto): Promise<{
    tenant: Tenant;
    temporaryPassword?: string;
    inviteSent: boolean;
  }> {
    const existingTenant = await this.tenantRepository.findOne({
      where: { tenantCode: createTenantDto.tenantCode },
    });

    if (existingTenant) {
      throw new ConflictException('Tenant code already exists');
    }

    const ownerEmail =
      createTenantDto.ownerEmail || createTenantDto.contactEmail;
    const ownerFullName =
      createTenantDto.ownerFullName || createTenantDto.contactPerson || 'Owner';

    const temporaryPassword = randomBytes(12)
      .toString('base64url')
      .slice(0, 16);
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(temporaryPassword, saltRounds);

    const result = await this.tenantRepository.manager.transaction(
      async (manager) => {
        const tenant = manager.create(Tenant, createTenantDto);
        const savedTenant = await manager.save(Tenant, tenant);

        const user = manager.create(TenantUser, {
          tenantId: savedTenant.id,
          fullName: ownerFullName,
          firstName: ownerFullName.split(' ')[0] || ownerFullName,
          lastName:
            ownerFullName.split(' ').slice(1).join(' ') || ownerFullName,
          email: ownerEmail,
          normalizedEmail: ownerEmail.toLowerCase().trim(),
          passwordHash,
          role: 'owner',
          status: 'active',
          emailVerifiedAt: new Date(),
        });
        const savedUser = await manager.save(TenantUser, user);

        // Plan 14 Phase 2 (task 2.6): an explicit `startWithTrial` policy
        // provisions exactly one auto-approved trial period from the
        // configured trial plan inside the same transaction. When disabled,
        // no trial state is created — the merchant stays blocked until it
        // requests a paid plan. A client-supplied business plan id is never
        // interpreted as a trial (task 2.8).
        if (createTenantDto.startWithTrial) {
          const trialPlan =
            await this.subscriptionPeriodService.resolveActiveTrialPlan(
              manager,
            );
          const trialPeriod =
            await this.subscriptionPeriodService.ensureTrialPeriodForTenant(
              savedTenant.id,
              { type: 'platform_admin', id: 'platform-admin-onboarding' },
              { manager, now: new Date() },
            );
          savedTenant.subscriptionPlanId = trialPlan.id;
          savedTenant.subscriptionEndDate = trialPeriod.periodEndAt
            ? new Date(trialPeriod.periodEndAt)
            : new Date(Date.now() + trialPeriod.durationDays * 86_400_000);
          await manager.save(Tenant, savedTenant);
        }

        return { tenant: savedTenant, user: savedUser };
      },
    );

    let inviteSent = false;
    try {
      const invite = await this.authService.issueTenantUserInvite(
        result.user.id,
        ownerEmail,
        {
          role: 'owner',
          invitedBy: 'platform-admin',
          tenantId: result.tenant.id,
        },
      );
      inviteSent = invite.invitationDelivery === 'requested';
    } catch {
      inviteSent = false;
    }

    return { tenant: result.tenant, temporaryPassword, inviteSent };
  }

  async updateTenant(
    id: string,
    updateTenantDto: UpdateTenantDto,
  ): Promise<Tenant> {
    const tenant = await this.getTenantById(id);

    Object.assign(tenant, updateTenantDto);
    return this.tenantRepository.save(tenant);
  }

  async approveTenant(
    id: string,
    approvalDto: TenantApprovalDto,
    adminId: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenantById(id);

    if (tenant.status !== 'pending') {
      throw new ConflictException(
        'Only pending tenants can be approved or rejected',
      );
    }

    tenant.status = approvalDto.action === 'approved' ? 'active' : 'rejected';
    tenant.approvedBy = adminId;
    tenant.approvedAt = new Date();

    if (approvalDto.subscriptionPlanId) {
      tenant.subscriptionPlanId = approvalDto.subscriptionPlanId;
      tenant.subscriptionStartDate = new Date();
      // Set end date to 1 month from now
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      tenant.subscriptionEndDate = endDate;
    }

    const savedTenant = await this.tenantRepository.save(tenant);

    // Plan 13: merchant approval must NOT auto-create a legacy trial
    // entitlement. The purchased-period ledger is the single authority for
    // access and limits — a new merchant is blocked until it requests a plan,
    // pays, and a Platform Admin activates the period. Approval must never
    // invent payment evidence or bypass the period scheduler.

    return savedTenant;
  }

  async suspendTenant(id: string, reason: string): Promise<Tenant> {
    const tenant = await this.getTenantById(id);
    tenant.status = 'suspended';
    const savedTenant = await this.tenantRepository.save(tenant);
    await this.entitlementService.transition({
      tenantId: id,
      toState: 'suspended',
      actor: { type: 'platform_admin', id: 'tenant-status' },
      source: 'platform_admin',
      reason: reason || 'Tenant suspended by platform admin',
      idempotencyKey: `tenant-suspension:${id}:${savedTenant.updatedAt?.toISOString?.() || Date.now()}`,
      patch: {
        suspendedAt: new Date(),
        suspensionReason: reason || 'Tenant suspended by platform admin',
      },
    });
    return Object.assign(savedTenant, { statusReason: reason });
  }

  async reactivateTenant(id: string, reason: string): Promise<Tenant> {
    const tenant = await this.getTenantById(id);
    tenant.status = 'active';
    const savedTenant = await this.tenantRepository.save(tenant);
    return Object.assign(savedTenant, { statusReason: reason });
  }

  async deleteTenant(id: string): Promise<void> {
    const tenant = await this.getTenantById(id);
    await this.tenantRepository.remove(tenant);
  }

  // Subscription Plan Management
  async getAllSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return this.subscriptionPlanRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getSubscriptionPlanById(id: string): Promise<SubscriptionPlan> {
    const plan = await this.subscriptionPlanRepository.findOne({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    return plan;
  }

  async createSubscriptionPlan(
    createPlanDto: CreateSubscriptionPlanDto,
  ): Promise<SubscriptionPlan> {
    this.assertPlanMonthlyLimits({
      inboundMessageLimit: createPlanDto.inboundMessageLimit,
      outboundMessageLimit: createPlanDto.outboundMessageLimit,
      apiLimit: createPlanDto.apiLimit,
      maxChannels: createPlanDto.maxChannels,
      storageLimitGb: createPlanDto.storageLimitGb,
      maxCsrs: createPlanDto.maxCsrs,
    });
    this.assertPlanTypeConfiguration(createPlanDto);
    // Legacy compatibility columns: the entity/DB still require these values
    // during the transition, but neither may drive new runtime behavior.
    // `durationDays` passes through when a legacy client sends it, and
    // `messageQuotaMode` is frozen to 'combined' so a legacy request can never
    // switch the new policy back to aggregate/combined enforcement.
    const plan = this.subscriptionPlanRepository.create({
      ...createPlanDto,
      durationDays: createPlanDto.durationDays ?? 30,
      messageQuotaMode: 'combined',
    });
    return this.subscriptionPlanRepository.save(plan);
  }

  async updateSubscriptionPlan(
    id: string,
    updatePlanDto: Partial<CreateSubscriptionPlanDto>,
  ): Promise<SubscriptionPlan> {
    const plan = await this.getSubscriptionPlanById(id);
    this.assertPlanMonthlyLimits(
      {
        inboundMessageLimit: updatePlanDto.inboundMessageLimit,
        outboundMessageLimit: updatePlanDto.outboundMessageLimit,
        apiLimit: updatePlanDto.apiLimit,
        maxChannels: updatePlanDto.maxChannels,
        storageLimitGb: updatePlanDto.storageLimitGb,
        maxCsrs: updatePlanDto.maxCsrs,
      },
      plan,
    );
    this.assertPlanTypeConfiguration(updatePlanDto, plan);
    Object.assign(plan, updatePlanDto);
    // New plan policy is always monthly directional limits; the legacy quota
    // mode column is frozen to 'combined' so it cannot silently switch policy.
    plan.messageQuotaMode = 'combined';
    return this.subscriptionPlanRepository.save(plan);
  }

  /**
   * Plan 13 Phase 1 (task 0.6/1.x): plan-type configuration constraints.
   *
   * A trial plan must be one-time, auto-approved, non-renewable,
   * non-requestable in the business catalog, top-up-ineligible, and have a
   * positive day duration. Business plans use calendar months and must not
   * rely on `durationDays` for their active period. Invalid combinations are
   * rejected at the server boundary, not only in the Platform Console.
   */
  private assertPlanTypeConfiguration(
    input: Partial<CreateSubscriptionPlanDto>,
    existing?: SubscriptionPlan,
  ) {
    const planType = input.planType ?? existing?.planType ?? 'business';
    const durationDays = input.durationDays ?? existing?.durationDays ?? 30;
    const requestable = input.requestable ?? existing?.requestable ?? true;
    const renewable = input.renewable ?? existing?.renewable ?? true;
    const topUpAllowed = input.topUpAllowed ?? existing?.topUpAllowed ?? true;
    const autoApprove = input.autoApprove ?? existing?.autoApprove ?? false;

    if (planType === 'trial') {
      const violations: string[] = [];
      if (!Number.isInteger(durationDays) || durationDays <= 0) {
        violations.push(
          'durationDays must be a positive integer for trial plans',
        );
      }
      if (requestable)
        violations.push('requestable must be false for trial plans');
      if (renewable) violations.push('renewable must be false for trial plans');
      if (topUpAllowed)
        violations.push('topUpAllowed must be false for trial plans');
      if (!autoApprove)
        violations.push('autoApprove must be true for trial plans');
      if (violations.length > 0) {
        throw new BadRequestException(
          `Invalid trial plan configuration: ${violations.join('; ')}`,
        );
      }
    }
  }

  /**
   * Validates the monthly plan limits for the revised direction.
   *
   * Message limits are independent inbound and outbound limits. There is no
   * aggregate message cap and no quota-mode selector in the new policy.
   * `null` means unlimited and `0` means blocked; negative values are invalid.
   * Channel, storage, and CSR capacities are non-negative; 0 means blocked.
   *
   * During updates, absent fields fall back to the existing plan so partial
   * edits are validated against the merged state.
   */
  private assertPlanMonthlyLimits(
    input: {
      inboundMessageLimit?: number | null;
      outboundMessageLimit?: number | null;
      apiLimit?: number | null;
      maxChannels?: number;
      storageLimitGb?: number;
      maxCsrs?: number;
    },
    existing?: SubscriptionPlan,
  ) {
    const validNullable = (value: number | null | undefined) =>
      value === null ||
      value === undefined ||
      (Number.isFinite(value) && value >= 0);
    const validNonNegative = (value: number | undefined) =>
      value === undefined || (Number.isFinite(value) && value >= 0);

    const inboundLimit =
      input.inboundMessageLimit !== undefined
        ? input.inboundMessageLimit
        : (existing?.inboundMessageLimit ?? undefined);
    const outboundLimit =
      input.outboundMessageLimit !== undefined
        ? input.outboundMessageLimit
        : (existing?.outboundMessageLimit ?? undefined);
    const apiLimit =
      input.apiLimit !== undefined
        ? input.apiLimit
        : (existing?.apiLimit ?? undefined);
    const maxChannels =
      input.maxChannels !== undefined
        ? input.maxChannels
        : (existing?.maxChannels ?? undefined);
    const storageLimitGb =
      input.storageLimitGb !== undefined
        ? input.storageLimitGb
        : (existing?.storageLimitGb ?? undefined);
    const maxCsrs =
      input.maxCsrs !== undefined ? input.maxCsrs : existing?.maxCsrs;

    if (
      !validNullable(inboundLimit) ||
      !validNullable(outboundLimit) ||
      !validNullable(apiLimit)
    ) {
      throw new BadRequestException(
        'Message and API limits must be null (unlimited), zero (blocked), or greater.',
      );
    }
    if (
      !validNonNegative(maxChannels) ||
      !validNonNegative(storageLimitGb) ||
      !validNonNegative(maxCsrs)
    ) {
      throw new BadRequestException(
        'Channel, storage, and CSR capacities must be zero or greater.',
      );
    }
  }

  async deleteSubscriptionPlan(id: string): Promise<void> {
    const plan = await this.getSubscriptionPlanById(id);

    // Check if any tenants are using this plan
    const tenantsUsingPlan = await this.tenantRepository.count({
      where: { subscriptionPlanId: id },
    });

    if (tenantsUsingPlan > 0) {
      throw new ConflictException(
        'Cannot delete plan that is currently in use by tenants',
      );
    }

    await this.subscriptionPlanRepository.remove(plan);
  }

  async getTenantBillingRecords(
    tenantId: string,
  ): Promise<TenantBillingRecord[]> {
    await this.getTenantById(tenantId);

    return this.tenantBillingRecordRepository.find({
      where: { tenantId },
      relations: ['subscriptionPlan'],
      order: { createdAt: 'DESC' },
    });
  }

  async getAllTenantBillingRecords() {
    const records = await this.tenantBillingRecordRepository.find({
      relations: ['tenant', 'subscriptionPlan'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const billingRecordIds = records
      .map((record) => record.id)
      .filter((id): id is string => Boolean(id));
    const periods = billingRecordIds.length
      ? await this.subscriptionPeriodRepository.find({
          where: { billingRecordId: In(billingRecordIds) },
        })
      : [];
    const periodByBillingRecordId = new Map(
      periods
        .filter((period) => period.billingRecordId)
        .map((period) => [period.billingRecordId as string, period]),
    );
    // Plan 14: surface the upgrade revision for a record so the billing queue
    // can approve a business→business upgrade inline (upgrades create no
    // period, so there is no period-activation row to attach the action to).
    const revisions = billingRecordIds.length
      ? await this.subscriptionPeriodRepository.manager
          .getRepository(TenantSubscriptionPeriodUpgradeRevision)
          .find({ where: { billingRecordId: In(billingRecordIds) } })
      : [];
    const revisionByBillingRecordId = new Map(
      revisions
        .filter((revision) => revision.billingRecordId)
        .map((revision) => [revision.billingRecordId as string, revision]),
    );
    return records.map((record) => {
      const period = periodByBillingRecordId.get(record.id);
      const revision = revisionByBillingRecordId.get(record.id);
      return {
        ...record,
        subscriptionPeriod: period
          ? {
              id: period.id,
              tenantId: period.tenantId,
              planId: period.planId,
              billingRecordId: period.billingRecordId,
              periodType: period.periodType,
              periodStatus: period.periodStatus,
              paymentStatus: period.paymentStatus,
              adminActivationStatus: period.adminActivationStatus,
              adminActivatedAt: period.adminActivatedAt,
              monthStartAt: period.monthStartAt,
              monthEndAt: period.monthEndAt,
              periodStartAt: period.periodStartAt,
              periodEndAt: period.periodEndAt,
              scheduledStartAt: period.scheduledStartAt,
              activatedAt: period.activatedAt,
              expiredAt: period.expiredAt,
              startOption: period.startOption,
              sequenceNumber: period.sequenceNumber,
            }
          : null,
        pendingUpgradeRevision: revision
          ? {
              id: revision.id,
              subscriptionPeriodId: revision.subscriptionPeriodId,
              upgradeStatus: revision.upgradeStatus,
              previousPlanId: revision.previousPlanId,
              upgradedPlanId: revision.upgradedPlanId,
            }
          : null,
      };
    });
  }

  async getTenantBillingReconciliation(tenantId: string) {
    const tenant = await this.getTenantById(tenantId);
    const { periodStart, periodEnd } = this.currentMonthlyPeriod();
    const [billingRecords, entitlement, apiRequestsUsed, providerMessagesUsed] =
      await Promise.all([
        this.tenantBillingRecordRepository.find({
          where: { tenantId },
          order: { billingPeriodStart: 'DESC' },
        }),
        this.tenantEntitlementRepository.findOne({ where: { tenantId } }),
        this.sumTenantUsage(tenantId, 'api_request', periodStart, periodEnd),
        this.sumTenantUsage(
          tenantId,
          'provider_message',
          periodStart,
          periodEnd,
        ),
      ]);

    const issues: Array<{
      code: string;
      severity: 'info' | 'warning' | 'critical';
      detail: string;
    }> = [];
    const paidRecords = billingRecords.filter(
      (record) => record.paymentStatus === 'paid',
    );
    const activePaidRecord = entitlement
      ? paidRecords.find(
          (record) =>
            record.subscriptionPlanId === entitlement.planId &&
            this.sameDate(
              record.billingPeriodStart,
              entitlement.paidPeriodStartsAt,
            ) &&
            this.sameDate(
              record.billingPeriodEnd,
              entitlement.paidPeriodEndsAt,
            ),
        )
      : null;

    for (const record of paidRecords) {
      if (!entitlement) {
        issues.push({
          code: 'PAID_INVOICE_WITHOUT_ENTITLEMENT',
          severity: 'critical',
          detail: `Paid billing record ${record.id} has no tenant entitlement.`,
        });
      } else if (
        record.subscriptionPlanId &&
        record.subscriptionPlanId !== entitlement.planId
      ) {
        issues.push({
          code: 'PAID_INVOICE_PLAN_MISMATCH',
          severity: 'critical',
          detail: `Paid billing record ${record.id} plan does not match active entitlement plan.`,
        });
      }
    }

    if (entitlement?.state === 'paid_active' && !activePaidRecord) {
      issues.push({
        code: 'ACTIVE_ENTITLEMENT_WITHOUT_MATCHING_PAID_INVOICE',
        severity: 'critical',
        detail:
          'Paid entitlement period/plan does not match any paid billing record.',
      });
    }

    const unpaidActivePeriod = billingRecords.find(
      (record) =>
        ['unpaid', 'overdue', 'partially_paid'].includes(
          record.paymentStatus,
        ) &&
        entitlement?.state === 'paid_active' &&
        this.periodsOverlap(
          record.billingPeriodStart,
          record.billingPeriodEnd,
          entitlement.paidPeriodStartsAt,
          entitlement.paidPeriodEndsAt,
        ),
    );
    if (unpaidActivePeriod) {
      issues.push({
        code: 'UNPAID_INVOICE_OVERLAPS_ACTIVE_ENTITLEMENT',
        severity: 'warning',
        detail: `Unpaid billing record ${unpaidActivePeriod.id} overlaps the active paid entitlement period.`,
      });
    }

    return {
      reportType: 'tenant_billing_reconciliation',
      format: 'safe_json',
      generatedAt: new Date().toISOString(),
      tenant: {
        id: tenant.id,
        tenantCode: tenant.tenantCode,
        status: tenant.status,
      },
      invoices: billingRecords.map((record) => ({
        id: record.id,
        invoiceNumber: record.invoiceNumber,
        subscriptionPlanId: record.subscriptionPlanId,
        billingPeriodStart: this.dateOnly(record.billingPeriodStart),
        billingPeriodEnd: this.dateOnly(record.billingPeriodEnd),
        invoiceStatus: record.invoiceStatus,
        paymentStatus: record.paymentStatus,
        amountDue: Number(record.amountDue || 0),
        amountPaid: Number(record.amountPaid || 0),
        currency: record.currency,
        paidAt: record.paidAt ? new Date(record.paidAt).toISOString() : null,
      })),
      entitlement: entitlement
        ? {
            id: entitlement.id,
            planId: entitlement.planId,
            state: entitlement.state,
            paidPeriodStartsAt: entitlement.paidPeriodStartsAt
              ? entitlement.paidPeriodStartsAt.toISOString()
              : null,
            paidPeriodEndsAt: entitlement.paidPeriodEndsAt
              ? entitlement.paidPeriodEndsAt.toISOString()
              : null,
            graceEndsAt: entitlement.graceEndsAt
              ? entitlement.graceEndsAt.toISOString()
              : null,
          }
        : null,
      usage: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        apiRequestsUsed,
        providerMessagesUsed,
      },
      issues,
      summary: {
        invoiceCount: billingRecords.length,
        paidInvoiceCount: paidRecords.length,
        issueCount: issues.length,
        consistent: issues.length === 0,
      },
      manualCorrectionWorkflow: [
        'Open the affected invoice, entitlement event, and usage rows before changing state.',
        'Correct by issuing a new adjustment, payment review, entitlement transition, or support note.',
        'Do not delete, rewrite, or overwrite financial evidence; retain correction evidence in metadata/audit logs.',
        'Rerun this reconciliation report and attach the generated issue codes to the operator ticket.',
      ],
    };
  }

  async createTenantBillingRecord(
    tenantId: string,
    createBillingDto: CreateTenantBillingRecordDto,
  ): Promise<TenantBillingRecord> {
    const tenant = await this.getTenantById(tenantId);
    const subscriptionPlanId =
      createBillingDto.subscriptionPlanId || tenant.subscriptionPlanId || null;
    const plan = subscriptionPlanId
      ? await this.getSubscriptionPlanById(subscriptionPlanId)
      : null;
    const defaultPeriodStart =
      tenant.subscriptionStartDate ||
      yangonCalendarDate(yangonMonthStart(new Date()));
    const parsedPeriodStart = this.parseDate(
      createBillingDto.billingPeriodStart,
      'billingPeriodStart',
      defaultPeriodStart,
    ) as Date;
    const periodStart = new Date(
      Date.UTC(
        parsedPeriodStart.getUTCFullYear(),
        parsedPeriodStart.getUTCMonth(),
        parsedPeriodStart.getUTCDate(),
      ),
    );
    const parsedPeriodEnd = this.parseDate(
      createBillingDto.billingPeriodEnd,
      'billingPeriodEnd',
      tenant.subscriptionEndDate || this.addMonths(periodStart, 1),
    ) as Date;
    const periodEnd = new Date(
      Date.UTC(
        parsedPeriodEnd.getUTCFullYear(),
        parsedPeriodEnd.getUTCMonth(),
        parsedPeriodEnd.getUTCDate(),
      ),
    );

    this.assertBillingPeriod(periodStart, periodEnd);
    this.assertYangonCalendarBillingWindow(periodStart, periodEnd);
    const invoiceNumber = createBillingDto.invoiceNumber?.trim() || null;
    await this.assertUniqueInvoiceNumber(invoiceNumber);
    await this.assertNoOverlappingBillingRecord(
      tenantId,
      periodStart,
      periodEnd,
    );
    const amountDue = this.normalizeAmount(
      createBillingDto.amountDue,
      plan?.monthlyPrice || 0,
      'amountDue',
    );
    const amountPaid = this.normalizeAmount(
      createBillingDto.amountPaid,
      0,
      'amountPaid',
    );
    const invoiceStatus = createBillingDto.invoiceStatus || 'draft';
    const paymentStatus = createBillingDto.paymentStatus || 'unpaid';
    this.assertBillingStatuses(invoiceStatus, paymentStatus);
    this.assertPaymentAmounts(amountDue, amountPaid, paymentStatus);

    const billingRecord = this.tenantBillingRecordRepository.create({
      tenantId,
      subscriptionPlanId,
      invoiceNumber,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      invoiceStatus,
      paymentStatus,
      amountDue,
      amountPaid,
      currency: this.normalizeCurrency(createBillingDto.currency),
      dueDate: this.parseDate(createBillingDto.dueDate, 'dueDate'),
      paidAt: this.parseDate(createBillingDto.paidAt, 'paidAt'),
      notes: createBillingDto.notes || null,
      metadata: createBillingDto.metadata || {},
    });

    if (paymentStatus === 'paid') {
      return this.tenantBillingRecordRepository.manager.transaction(
        async (manager) => {
          const savedBillingRecord = await manager.save(
            TenantBillingRecord,
            billingRecord,
          );
          await this.activateEntitlementForPaidBillingRecord(
            savedBillingRecord,
            manager,
          );
          await this.activateTopUpForPaidBillingRecord(
            savedBillingRecord,
            manager,
          );
          return savedBillingRecord;
        },
      );
    }

    return this.tenantBillingRecordRepository.save(billingRecord);
  }

  async updateTenantBillingRecord(
    tenantId: string,
    billingRecordId: string,
    updateBillingDto: UpdateTenantBillingRecordDto,
  ): Promise<TenantBillingRecord> {
    await this.getTenantById(tenantId);
    const billingRecord = await this.tenantBillingRecordRepository.findOne({
      where: { id: billingRecordId, tenantId },
    });

    if (!billingRecord) {
      throw new NotFoundException('Tenant billing record not found');
    }
    this.assertConfirmedBillingFieldsImmutable(billingRecord, updateBillingDto);

    if (updateBillingDto.subscriptionPlanId !== undefined) {
      if (updateBillingDto.subscriptionPlanId) {
        await this.getSubscriptionPlanById(updateBillingDto.subscriptionPlanId);
      }
      billingRecord.subscriptionPlanId =
        updateBillingDto.subscriptionPlanId || null;
    }
    if (updateBillingDto.invoiceNumber !== undefined)
      billingRecord.invoiceNumber = updateBillingDto.invoiceNumber || null;
    if (updateBillingDto.billingPeriodStart !== undefined) {
      billingRecord.billingPeriodStart = this.parseDate(
        updateBillingDto.billingPeriodStart,
        'billingPeriodStart',
      ) as Date;
    }
    if (updateBillingDto.billingPeriodEnd !== undefined) {
      billingRecord.billingPeriodEnd = this.parseDate(
        updateBillingDto.billingPeriodEnd,
        'billingPeriodEnd',
      ) as Date;
    }
    this.assertBillingPeriod(
      billingRecord.billingPeriodStart,
      billingRecord.billingPeriodEnd,
    );
    if (updateBillingDto.invoiceNumber !== undefined) {
      await this.assertUniqueInvoiceNumber(
        billingRecord.invoiceNumber,
        billingRecord.id,
      );
    }
    if (
      updateBillingDto.billingPeriodStart !== undefined ||
      updateBillingDto.billingPeriodEnd !== undefined
    ) {
      await this.assertNoOverlappingBillingRecord(
        tenantId,
        billingRecord.billingPeriodStart,
        billingRecord.billingPeriodEnd,
        billingRecord.id,
      );
    }
    if (updateBillingDto.invoiceStatus !== undefined)
      billingRecord.invoiceStatus = updateBillingDto.invoiceStatus;
    const previousPaymentStatus = billingRecord.paymentStatus;
    if (updateBillingDto.paymentStatus !== undefined)
      billingRecord.paymentStatus = updateBillingDto.paymentStatus;
    if (updateBillingDto.amountDue !== undefined) {
      billingRecord.amountDue = this.normalizeAmount(
        updateBillingDto.amountDue,
        0,
        'amountDue',
      );
    }
    if (updateBillingDto.amountPaid !== undefined) {
      billingRecord.amountPaid = this.normalizeAmount(
        updateBillingDto.amountPaid,
        0,
        'amountPaid',
      );
    }
    if (updateBillingDto.currency !== undefined)
      billingRecord.currency = this.normalizeCurrency(
        updateBillingDto.currency,
      );
    if (updateBillingDto.dueDate !== undefined)
      billingRecord.dueDate = this.parseDate(
        updateBillingDto.dueDate,
        'dueDate',
      );
    if (updateBillingDto.paidAt !== undefined)
      billingRecord.paidAt = this.parseDate(updateBillingDto.paidAt, 'paidAt');
    if (updateBillingDto.notes !== undefined)
      billingRecord.notes = updateBillingDto.notes || null;
    if (updateBillingDto.metadata !== undefined)
      billingRecord.metadata = updateBillingDto.metadata || {};
    this.assertBillingStatuses(
      billingRecord.invoiceStatus,
      billingRecord.paymentStatus,
    );
    this.assertPaymentTransition(
      previousPaymentStatus,
      billingRecord.paymentStatus,
    );
    this.assertPaymentAmounts(
      billingRecord.amountDue,
      billingRecord.amountPaid,
      billingRecord.paymentStatus,
    );

    if (billingRecord.paymentStatus === 'paid') {
      return this.tenantBillingRecordRepository.manager.transaction(
        async (manager) => {
          const savedBillingRecord = await manager.save(
            TenantBillingRecord,
            billingRecord,
          );
          await this.activateEntitlementForPaidBillingRecord(
            savedBillingRecord,
            manager,
          );
          await this.activateTopUpForPaidBillingRecord(
            savedBillingRecord,
            manager,
          );
          return savedBillingRecord;
        },
      );
    }

    return this.tenantBillingRecordRepository.save(billingRecord);
  }

  async getTenantPaymentProofDownloadUrl(
    tenantId: string,
    billingRecordId: string,
  ) {
    await this.getTenantById(tenantId);
    const billingRecord = await this.tenantBillingRecordRepository.findOne({
      where: { id: billingRecordId, tenantId },
    });
    if (!billingRecord) {
      throw new NotFoundException('Tenant billing record not found');
    }
    const mediaFileId = billingRecord.metadata?.paymentProof?.mediaFileId;
    if (!mediaFileId) {
      throw new NotFoundException('No payment proof receipt is attached');
    }
    return this.mediaLibraryService.getBillingProofDownloadUrl(
      tenantId,
      mediaFileId,
    );
  }

  async reviewTenantPaymentProof(
    tenantId: string,
    billingRecordId: string,
    reviewedBy: string | undefined,
    reviewDto: ReviewPaymentProofDto,
  ): Promise<TenantBillingRecord> {
    await this.getTenantById(tenantId);
    const billingRecord = await this.tenantBillingRecordRepository.findOne({
      where: { id: billingRecordId, tenantId },
    });
    if (!billingRecord) {
      throw new NotFoundException('Tenant billing record not found');
    }

    const metadata = billingRecord.metadata || {};
    const paymentProof = metadata.paymentProof;
    if (
      paymentProof?.status === 'approved' &&
      reviewDto.outcome === 'approved' &&
      billingRecord.paymentStatus === 'paid'
    ) {
      await this.tenantBillingRecordRepository.manager.transaction(
        async (manager) => {
          await this.activateTopUpForPaidBillingRecord(
            billingRecord,
            manager,
            reviewedBy,
          );
        },
      );
      return billingRecord;
    }
    if (!paymentProof || paymentProof.status !== 'pending_review') {
      throw new ConflictException('No pending payment proof to review');
    }

    const reviewedAt = new Date().toISOString();
    const review = {
      outcome: reviewDto.outcome,
      safeReason: reviewDto.safeReason?.trim() || null,
      reviewedBy: reviewedBy || null,
      reviewedAt,
      paymentProofId: paymentProof.id || null,
    };
    const reviewHistory = Array.isArray(metadata.paymentProofReviews)
      ? metadata.paymentProofReviews
      : [];
    const proofSubmissions = Array.isArray(metadata.paymentProofSubmissions)
      ? metadata.paymentProofSubmissions
      : [];

    billingRecord.metadata = {
      ...metadata,
      paymentProof: {
        ...paymentProof,
        status: reviewDto.outcome === 'approved' ? 'approved' : 'rejected',
        reviewStatus: reviewDto.outcome,
        reviewedBy: reviewedBy || null,
        reviewedAt,
        rejectionReason:
          reviewDto.outcome === 'rejected' ? review.safeReason : null,
      },
      paymentProofSubmissions: proofSubmissions.map(
        (submission: Record<string, any>) =>
          submission.id === paymentProof.id
            ? {
                ...submission,
                status:
                  reviewDto.outcome === 'approved' ? 'approved' : 'rejected',
                reviewStatus: reviewDto.outcome,
                reviewedBy: reviewedBy || null,
                reviewedAt,
                rejectionReason:
                  reviewDto.outcome === 'rejected' ? review.safeReason : null,
              }
            : submission,
      ),
      paymentProofReviews: [...reviewHistory, review],
    };

    if (reviewDto.outcome === 'rejected') {
      if (!review.safeReason) {
        throw new BadRequestException(
          'safeReason is required when rejecting payment proof',
        );
      }
      const rejectedBillingRecord =
        await this.tenantBillingRecordRepository.save(billingRecord);
      return rejectedBillingRecord;
    }

    const previousPaymentStatus = billingRecord.paymentStatus;
    billingRecord.paymentStatus = 'paid';
    billingRecord.amountPaid = this.normalizeAmount(
      reviewDto.amountPaid ?? paymentProof.paidAmount,
      billingRecord.amountDue,
      'amountPaid',
    );
    billingRecord.paidAt = this.parseDate(
      reviewDto.paidAt || paymentProof.paidDate || reviewedAt,
      'paidAt',
    );
    this.assertBillingStatuses(
      billingRecord.invoiceStatus,
      billingRecord.paymentStatus,
    );
    this.assertPaymentTransition(
      previousPaymentStatus,
      billingRecord.paymentStatus,
    );
    this.assertPaymentAmounts(
      billingRecord.amountDue,
      billingRecord.amountPaid,
      billingRecord.paymentStatus,
    );

    const approvedBillingRecord =
      await this.tenantBillingRecordRepository.manager.transaction(
        async (manager) => {
          const savedBillingRecord = await manager.save(
            TenantBillingRecord,
            billingRecord,
          );
          await this.activateEntitlementForPaidBillingRecord(
            savedBillingRecord,
            manager,
          );
          await this.activateTopUpForPaidBillingRecord(
            savedBillingRecord,
            manager,
          );
          return savedBillingRecord;
        },
      );

    return approvedBillingRecord;
  }

  async reverseTenantBillingPayment(
    tenantId: string,
    billingRecordId: string,
    reversedBy: string | undefined,
    reason: string | undefined,
  ): Promise<TenantBillingRecord> {
    await this.getTenantById(tenantId);
    const safeReason = reason?.trim();
    if (!safeReason) {
      throw new BadRequestException(
        'reason is required to reverse a confirmed payment',
      );
    }

    const billingRecord = await this.tenantBillingRecordRepository.findOne({
      where: { id: billingRecordId, tenantId },
    });
    if (!billingRecord) {
      throw new NotFoundException('Tenant billing record not found');
    }
    if (billingRecord.paymentStatus !== 'paid') {
      throw new BadRequestException(
        'Only paid billing records can be reversed',
      );
    }

    const reversedAt = new Date().toISOString();
    const metadata = billingRecord.metadata || {};
    const reversalHistory = Array.isArray(metadata.paymentReversals)
      ? metadata.paymentReversals
      : [];
    const reversal = {
      reversedAt,
      reversedBy: reversedBy || null,
      reason: safeReason,
      previousPaymentStatus: billingRecord.paymentStatus,
      previousAmountPaid: Number(billingRecord.amountPaid || 0),
      previousPaidAt: billingRecord.paidAt
        ? new Date(billingRecord.paidAt).toISOString()
        : null,
    };

    billingRecord.paymentStatus =
      billingRecord.dueDate && new Date(billingRecord.dueDate) < new Date()
        ? 'overdue'
        : 'unpaid';
    billingRecord.amountPaid = 0;
    billingRecord.paidAt = null;
    billingRecord.metadata = {
      ...metadata,
      paymentReversal: reversal,
      paymentReversals: [...reversalHistory, reversal],
    };

    return this.tenantBillingRecordRepository.save(billingRecord);
  }

  async sendTenantBillingReminder(
    tenantId: string,
    billingRecordId: string,
    reminderDto: SendTenantBillingReminderDto = {},
  ) {
    const billingRecord = await this.tenantBillingRecordRepository.findOne({
      where: { id: billingRecordId, tenantId },
    });
    if (!billingRecord) {
      throw new NotFoundException('Tenant billing record not found');
    }

    const tenant = await this.getTenantById(tenantId);
    if (['paid', 'waived'].includes(billingRecord.paymentStatus)) {
      throw new BadRequestException(
        'Billing reminders are only available for unpaid invoices',
      );
    }

    const note = reminderDto.note?.trim() || null;
    const markOverdue = Boolean(reminderDto.markOverdue);
    const suspendTenant = Boolean(reminderDto.suspendTenant);
    const nowDate = new Date();
    this.assertBillingCollectionTimeline(
      billingRecord,
      markOverdue,
      suspendTenant,
      nowDate,
    );
    const now = nowDate.toISOString();
    const merchantLabel =
      tenant.companyName || tenant.tenantCode || 'your workspace';
    const invoiceLabel = billingRecord.invoiceNumber || 'your latest invoice';
    const outstandingAmount = Math.max(
      Number(billingRecord.amountDue || 0) -
        Number(billingRecord.amountPaid || 0),
      0,
    );
    const dueLabel = billingRecord.dueDate
      ? new Date(billingRecord.dueDate).toLocaleDateString('en-GB')
      : 'the recorded due date';
    const reminderLevel =
      markOverdue || billingRecord.paymentStatus === 'overdue'
        ? 'overdue'
        : 'due';

    const recipients = await this.tenantUserRepository.find({
      where: { tenantId, status: 'active' },
      select: ['id', 'role'],
    });
    const reminderRecipients = recipients.filter((user) =>
      ['owner', 'admin', 'finance'].includes(user.role),
    );

    if (markOverdue) {
      billingRecord.paymentStatus = 'overdue';
    }

    const reminderEntry = {
      sentAt: now,
      level: reminderLevel,
      note,
      outstandingAmount,
      dueDate: billingRecord.dueDate
        ? new Date(billingRecord.dueDate).toISOString()
        : null,
      suspendedTenant: suspendTenant,
      recipientCount: reminderRecipients.length,
      policy: billingCollectionPolicy,
    };

    const metadata = billingRecord.metadata || {};
    const history = Array.isArray(metadata.reminderHistory)
      ? metadata.reminderHistory
      : [];
    billingRecord.metadata = {
      ...metadata,
      reminderHistory: [...history, reminderEntry],
      lastReminder: reminderEntry,
      ...(markOverdue
        ? { overdueMarkedAt: metadata.overdueMarkedAt || now }
        : {}),
    };
    if (note) {
      billingRecord.notes = note;
    }

    const savedBillingRecord =
      await this.tenantBillingRecordRepository.save(billingRecord);

    await this.notificationService.createMany(
      reminderRecipients.map((user) => ({
        tenantId,
        userId: user.id,
        type: reminderLevel === 'overdue' ? 'warning' : 'info',
        title:
          reminderLevel === 'overdue'
            ? 'Billing invoice overdue'
            : 'Billing payment reminder',
        message:
          reminderLevel === 'overdue'
            ? `${invoiceLabel} for ${merchantLabel} is overdue. Outstanding amount: ${savedBillingRecord.currency} ${outstandingAmount.toLocaleString()}. Due date: ${dueLabel}.`
            : `${invoiceLabel} for ${merchantLabel} is due soon. Outstanding amount: ${savedBillingRecord.currency} ${outstandingAmount.toLocaleString()}. Due date: ${dueLabel}.`,
        actionUrl: '/workspace/billing#billing-history',
      })),
    );

    let tenantStatus = tenant.status;
    if (suspendTenant && tenant.status !== 'suspended') {
      await this.suspendTenant(
        tenantId,
        note || `Billing ${reminderLevel} reminder triggered suspension`,
      );
      tenantStatus = 'suspended';
    }

    return {
      billingRecord: savedBillingRecord,
      reminder: reminderEntry,
      notificationsCreated: reminderRecipients.length,
      tenantStatus,
    };
  }

  async changeTenantSubscriptionPlan(
    tenantId: string,
    changePlanDto: ChangeTenantSubscriptionPlanDto,
  ) {
    const tenant = await this.getTenantById(tenantId);
    const plan = await this.getSubscriptionPlanById(
      changePlanDto.subscriptionPlanId,
    );
    const previousPlanId = tenant.subscriptionPlanId || null;
    const defaultStartDate = yangonCalendarDate(yangonMonthStart(new Date()));
    const parsedSubscriptionStartDate = this.parseDate(
      changePlanDto.subscriptionStartDate,
      'subscriptionStartDate',
      defaultStartDate,
    ) as Date;
    const subscriptionStartDate = new Date(
      Date.UTC(
        parsedSubscriptionStartDate.getUTCFullYear(),
        parsedSubscriptionStartDate.getUTCMonth(),
        parsedSubscriptionStartDate.getUTCDate(),
      ),
    );
    const parsedSubscriptionEndDate = this.parseDate(
      changePlanDto.subscriptionEndDate,
      'subscriptionEndDate',
      this.addMonths(subscriptionStartDate, 1),
    ) as Date;
    const subscriptionEndDate = new Date(
      Date.UTC(
        parsedSubscriptionEndDate.getUTCFullYear(),
        parsedSubscriptionEndDate.getUTCMonth(),
        parsedSubscriptionEndDate.getUTCDate(),
      ),
    );

    if (subscriptionEndDate <= subscriptionStartDate) {
      throw new BadRequestException(
        'subscriptionEndDate must be after subscriptionStartDate',
      );
    }
    this.assertYangonCalendarBillingWindow(
      subscriptionStartDate,
      subscriptionEndDate,
    );

    tenant.subscriptionPlanId = plan.id;
    tenant.subscriptionStartDate = subscriptionStartDate;
    tenant.subscriptionEndDate = subscriptionEndDate;
    this.assignIfPresent(
      tenant,
      'customCsrLimit',
      changePlanDto.customCsrLimit,
    );
    this.assignIfPresent(
      tenant,
      'customChannelLimit',
      changePlanDto.customChannelLimit,
    );
    this.assignIfPresent(
      tenant,
      'customMessageLimit',
      changePlanDto.customMessageLimit,
    );
    this.assignIfPresent(
      tenant,
      'customApiLimit',
      changePlanDto.customApiLimit,
    );

    const savedTenant = await this.tenantRepository.save(tenant);
    const openPlanChangeRequest = await this.leadRepository
      .createQueryBuilder('lead')
      .where('lead.source = :source', { source: 'workspace-plan-change' })
      .andWhere('lead.status IN (:...statuses)', {
        statuses: ['new', 'contacted', 'qualified'],
      })
      .andWhere("lead.metadata ->> 'requestType' = :requestType", {
        requestType: 'plan_change',
      })
      .andWhere("lead.metadata ->> 'tenantId' = :tenantId", { tenantId })
      .getOne();

    const billingRecord =
      changePlanDto.createBillingRecord === false
        ? null
        : await this.createTenantBillingRecord(savedTenant.id, {
            subscriptionPlanId: plan.id,
            billingPeriodStart: subscriptionStartDate.toISOString(),
            billingPeriodEnd: subscriptionEndDate.toISOString(),
            invoiceStatus: changePlanDto.invoiceStatus || 'issued',
            paymentStatus: changePlanDto.paymentStatus || 'unpaid',
            amountDue:
              changePlanDto.amountDue ?? Number(plan.monthlyPrice || 0),
            currency: changePlanDto.currency || 'MMK',
            dueDate: (changePlanDto.dueDate
              ? this.parseDate(changePlanDto.dueDate, 'dueDate')
              : this.addDays(subscriptionStartDate, 14)
            )?.toISOString(),
            notes: changePlanDto.notes,
            metadata: {
              source: 'subscription_plan_change',
              previousPlanId,
              newPlanId: plan.id,
            },
          });

    if (openPlanChangeRequest) {
      openPlanChangeRequest.status = 'converted';
      openPlanChangeRequest.metadata = {
        ...(openPlanChangeRequest.metadata || {}),
        outcome: 'approved',
        appliedPlanId: plan.id,
        appliedPlanName: plan.name,
        resolvedAt: new Date().toISOString(),
      };
      await this.leadRepository.save(openPlanChangeRequest);
    }

    return {
      tenant: savedTenant,
      previousPlanId,
      subscriptionPlan: plan,
      billingRecord,
    };
  }

  async getTenantUsageAndLimits(tenantId: string) {
    const tenant = await this.getTenantById(tenantId);
    return this.buildTenantUsageAndLimits(tenant);
  }

  async getTenantUsageWarnings() {
    const tenants = await this.tenantRepository.find({
      order: { companyName: 'ASC' },
    });
    const { periodStart, periodEnd } = this.currentMonthlyPeriod();
    const planIds = Array.from(
      new Set(
        tenants.map((tenant) => tenant.subscriptionPlanId).filter(Boolean),
      ),
    );
    const plans = planIds.length
      ? await this.subscriptionPlanRepository.find({
          where: planIds.map((id) => ({ id })) as Array<{ id: string }>,
        })
      : [];
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const [
      apiRequestsUsed,
      providerMessagesUsed,
      activeUsers,
      activeChannels,
      providerBreakdown,
      latestUsageEvents,
    ] = await Promise.all([
      this.sumUsageByTenant('api_request', periodStart, periodEnd),
      this.sumUsageByTenant('provider_message', periodStart, periodEnd),
      this.countActiveUsersByTenant(),
      this.countActiveChannelsByTenant(),
      this.getProviderUsageBreakdownByTenant(periodStart, periodEnd),
      this.getLatestUsageEventsByTenant(periodStart, periodEnd),
    ]);
    const refreshedAt = new Date().toISOString();
    const summaries = tenants.map((tenant) =>
      this.buildTenantUsageSummary({
        tenant,
        plan: tenant.subscriptionPlanId
          ? planById.get(tenant.subscriptionPlanId) || null
          : null,
        periodStart,
        periodEnd,
        refreshedAt,
        latestUsageEventAt: latestUsageEvents.get(tenant.id) || null,
        apiRequestsUsed: apiRequestsUsed.get(tenant.id) || 0,
        providerMessagesUsed: providerMessagesUsed.get(tenant.id) || 0,
        csrsUsed: activeUsers.get(tenant.id) || 0,
        channelsUsed: activeChannels.get(tenant.id) || 0,
        providerBreakdown: providerBreakdown.get(tenant.id) || [],
      }),
    );

    return summaries.sort((first, second) => {
      const firstSeverity = first.warnings.some(
        (warning) => warning.severity === 'limit_reached',
      )
        ? 2
        : first.warnings.length
          ? 1
          : 0;
      const secondSeverity = second.warnings.some(
        (warning) => warning.severity === 'limit_reached',
      )
        ? 2
        : second.warnings.length
          ? 1
          : 0;
      return (
        secondSeverity - firstSeverity ||
        second.warnings.length - first.warnings.length
      );
    });
  }

  async getPlatformOrders(
    paginationDto: PaginationDto,
    filters: PlatformOrderFilters = {},
  ): Promise<PaginatedResult<Record<string, any>>> {
    const { page = 1, limit = 20, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;
    const orderSortColumns: Record<string, string> = {
      createdAt: 'order.created_at',
      orderNumber: 'order.order_number',
      status: 'order.status',
      paymentStatus: 'order.payment_status',
      totalAmount: 'order.total_amount',
      companyName: 'tenant.company_name',
      customerName: 'customer.full_name',
    };

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin(Tenant, 'tenant', 'tenant.id = order.tenant_id')
      .leftJoin(Customer, 'customer', 'customer.id = order.customer_id')
      .leftJoin(
        Conversation,
        'conversation',
        'conversation.id = order.conversation_id',
      )
      .leftJoin(
        TenantChannel,
        'channel',
        'channel.id = conversation.channel_id',
      );

    if (filters.tenantId) {
      queryBuilder.andWhere('order.tenant_id = :tenantId', {
        tenantId: filters.tenantId,
      });
    }

    if (filters.status) {
      queryBuilder.andWhere('order.status = :status', {
        status: filters.status,
      });
    }

    if (filters.paymentStatus) {
      queryBuilder.andWhere('order.payment_status = :paymentStatus', {
        paymentStatus: filters.paymentStatus,
      });
    }

    if (filters.channelType) {
      queryBuilder.andWhere('channel.channel_type = :channelType', {
        channelType: filters.channelType,
      });
    }

    if (filters.dateFrom) {
      queryBuilder.andWhere('order.created_at >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    }

    if (filters.dateTo) {
      queryBuilder.andWhere('order.created_at <= :dateTo', {
        dateTo: filters.dateTo,
      });
    }

    if (search) {
      queryBuilder.andWhere(
        `(order.order_number ILIKE :search
          OR tenant.company_name ILIKE :search
          OR tenant.tenant_code ILIKE :search
          OR customer.full_name ILIKE :search
          OR customer.phone ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    const total = await queryBuilder.clone().getCount();
    const rows = await queryBuilder
      .select([
        'order.id AS id',
        'order.tenant_id AS tenant_id',
        'order.order_number AS order_number',
        'order.status AS status',
        'order.payment_status AS payment_status',
        'order.payment_method AS payment_method',
        'order.total_amount AS total_amount',
        'order.paid_amount AS paid_amount',
        'order.balance_due AS balance_due',
        'order.cod_amount AS cod_amount',
        'order.delivery_assignee_name AS delivery_assignee_name',
        'order.delivery_zone AS delivery_zone',
        'order.tracking_number AS tracking_number',
        'order.created_at AS created_at',
        'tenant.tenant_code AS tenant_code',
        'tenant.company_name AS company_name',
        'channel.id AS channel_id',
        'channel.channel_type AS channel_type',
        'channel.channel_name AS channel_name',
        'channel.display_name AS channel_display_name',
        'customer.id AS customer_id',
        'customer.full_name AS customer_name',
        'customer.phone AS customer_phone',
      ])
      .orderBy(
        orderSortColumns[sortBy || 'createdAt'] || 'order.created_at',
        sortOrder || 'DESC',
      )
      .offset(skip)
      .limit(limit)
      .getRawMany();

    const data = rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      orderNumber: row.order_number,
      status: row.status,
      paymentStatus: row.payment_status,
      paymentMethod: row.payment_method,
      totalAmount: Number(row.total_amount || 0),
      paidAmount: Number(row.paid_amount || 0),
      balanceDue: Number(row.balance_due || 0),
      codAmount: Number(row.cod_amount || 0),
      deliveryAssigneeName: row.delivery_assignee_name,
      deliveryZone: row.delivery_zone,
      trackingNumber: row.tracking_number,
      createdAt: row.created_at,
      tenant: {
        id: row.tenant_id,
        tenantCode: row.tenant_code,
        companyName: row.company_name,
      },
      channel: row.channel_id
        ? {
            id: row.channel_id,
            channelType: row.channel_type,
            channelName: row.channel_name,
            displayName: row.channel_display_name,
          }
        : null,
      customer: row.customer_id
        ? {
            id: row.customer_id,
            fullName: row.customer_name,
            phone: row.customer_phone,
          }
        : null,
    }));

    const totalPages = Math.ceil(total / limit);
    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getPlatformOrderPaymentSummary(tenantId?: string) {
    const queryBuilder = this.orderRepository.createQueryBuilder('order');
    if (tenantId) {
      queryBuilder.where('order.tenant_id = :tenantId', { tenantId });
    }

    const rows = await queryBuilder
      .select('order.payment_status', 'paymentStatus')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('COALESCE(SUM(order.total_amount), 0)', 'totalAmount')
      .addSelect('COALESCE(SUM(order.paid_amount), 0)', 'paidAmount')
      .addSelect('COALESCE(SUM(order.balance_due), 0)', 'balanceDue')
      .addSelect('COALESCE(SUM(order.cod_amount), 0)', 'codAmount')
      .groupBy('order.payment_status')
      .getRawMany();

    const byStatus = rows.reduce(
      (acc, row) => {
        acc[row.paymentStatus] = {
          orderCount: Number(row.orderCount || 0),
          totalAmount: Number(row.totalAmount || 0),
          paidAmount: Number(row.paidAmount || 0),
          balanceDue: Number(row.balanceDue || 0),
          codAmount: Number(row.codAmount || 0),
        };
        return acc;
      },
      {} as Record<
        string,
        {
          orderCount: number;
          totalAmount: number;
          paidAmount: number;
          balanceDue: number;
          codAmount: number;
        }
      >,
    );

    const totals = rows.reduce(
      (acc, row) => ({
        orderCount: acc.orderCount + Number(row.orderCount || 0),
        totalAmount: acc.totalAmount + Number(row.totalAmount || 0),
        paidAmount: acc.paidAmount + Number(row.paidAmount || 0),
        balanceDue: acc.balanceDue + Number(row.balanceDue || 0),
        codAmount: acc.codAmount + Number(row.codAmount || 0),
      }),
      {
        orderCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        balanceDue: 0,
        codAmount: 0,
      },
    );

    return {
      totals,
      statuses: {
        pending: byStatus.pending || {
          orderCount: 0,
          totalAmount: 0,
          paidAmount: 0,
          balanceDue: 0,
          codAmount: 0,
        },
        partially_paid: byStatus.partially_paid || {
          orderCount: 0,
          totalAmount: 0,
          paidAmount: 0,
          balanceDue: 0,
          codAmount: 0,
        },
        paid: byStatus.paid || {
          orderCount: 0,
          totalAmount: 0,
          paidAmount: 0,
          balanceDue: 0,
          codAmount: 0,
        },
        failed: byStatus.failed || {
          orderCount: 0,
          totalAmount: 0,
          paidAmount: 0,
          balanceDue: 0,
          codAmount: 0,
        },
        refunded: byStatus.refunded || {
          orderCount: 0,
          totalAmount: 0,
          paidAmount: 0,
          balanceDue: 0,
          codAmount: 0,
        },
        cod_pending: byStatus.cod_pending || {
          orderCount: 0,
          totalAmount: 0,
          paidAmount: 0,
          balanceDue: 0,
          codAmount: 0,
        },
        cod_collected: byStatus.cod_collected || {
          orderCount: 0,
          totalAmount: 0,
          paidAmount: 0,
          balanceDue: 0,
          codAmount: 0,
        },
      },
    };
  }

  async getTenantChannels(tenantId: string) {
    await this.getTenantById(tenantId);

    const channels = await this.tenantChannelRepository.find({
      where: { tenantId, channelType: Not('line') },
      order: { updatedAt: 'DESC' },
    });

    return channels.map((channel) => ({
      id: channel.id,
      tenantId: channel.tenantId,
      channelType: channel.channelType,
      channelName: channel.channelName,
      displayName: channel.displayName,
      status: channel.status,
      entitlementOrigin: channel.entitlementOrigin,
      entitlementExpiresAt: channel.entitlementExpiresAt,
      retentionSelected: channel.retentionSelected,
      disabledAt: channel.disabledAt,
      disabledReason: channel.disabledReason,
      credentialStatus: channel.credentialStatus,
      connectionStatus: channel.connectionStatus,
      connectedAt: channel.connectedAt,
      lastSyncAt: channel.lastSyncAt,
      errorMessage: channel.errorMessage,
      updatedAt: channel.updatedAt,
    }));
  }

  async getPlatformChannels() {
    const channels = await this.tenantChannelRepository.find({
      where: { channelType: Not('line') },
      relations: ['tenant'],
      order: { updatedAt: 'DESC' },
    });

    return channels.map((channel) => ({
      id: channel.id,
      tenantId: channel.tenantId,
      channelType: channel.channelType,
      channelName: channel.channelName,
      displayName: channel.displayName,
      status: channel.status,
      entitlementOrigin: channel.entitlementOrigin,
      entitlementExpiresAt: channel.entitlementExpiresAt,
      retentionSelected: channel.retentionSelected,
      disabledAt: channel.disabledAt,
      disabledReason: channel.disabledReason,
      credentialStatus: channel.credentialStatus,
      connectionStatus: channel.connectionStatus,
      connectedAt: channel.connectedAt,
      lastSyncAt: channel.lastSyncAt,
      errorMessage: channel.errorMessage,
      updatedAt: channel.updatedAt,
      tenant: {
        id: channel.tenant?.id || channel.tenantId,
        tenantCode: channel.tenant?.tenantCode || '',
        companyName: channel.tenant?.companyName || '',
        status: channel.tenant?.status || 'unknown',
      },
    }));
  }

  async getPlatformConversations(
    paginationDto: PaginationDto,
    filters: PlatformConversationFilters = {},
  ): Promise<PaginatedResult<Record<string, any>>> {
    const { page = 1, limit = 20, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;
    const conversationSortColumns: Record<string, string> = {
      createdAt: 'conversation.created_at',
      updatedAt: 'conversation.updated_at',
      lastMessageAt: 'conversation.last_message_at',
      status: 'conversation.status',
      priority: 'conversation.priority',
      companyName: 'tenant.company_name',
      customerName: 'customer.full_name',
      channelType: 'channel.channel_type',
    };

    const queryBuilder = this.conversationRepository
      .createQueryBuilder('conversation')
      .leftJoin(Tenant, 'tenant', 'tenant.id = conversation.tenant_id')
      .leftJoin(Customer, 'customer', 'customer.id = conversation.customer_id')
      .leftJoin(
        TenantChannel,
        'channel',
        'channel.id = conversation.channel_id',
      )
      .leftJoin(TenantUser, 'csr', 'csr.id = conversation.assigned_csr_id')
      .where('1 = 1');

    if (filters.tenantId) {
      queryBuilder.andWhere('conversation.tenant_id = :tenantId', {
        tenantId: filters.tenantId,
      });
    }

    if (filters.status) {
      queryBuilder.andWhere('conversation.status = :status', {
        status: filters.status,
      });
    }

    if (filters.channelType) {
      queryBuilder.andWhere('channel.channel_type = :channelType', {
        channelType: filters.channelType,
      });
    }

    if (filters.dateFrom) {
      queryBuilder.andWhere('conversation.created_at >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    }

    if (filters.dateTo) {
      queryBuilder.andWhere('conversation.created_at <= :dateTo', {
        dateTo: filters.dateTo,
      });
    }

    if (search) {
      queryBuilder.andWhere(
        `(tenant.company_name ILIKE :search
          OR tenant.tenant_code ILIKE :search
          OR customer.full_name ILIKE :search
          OR customer.phone ILIKE :search
          OR conversation.subject ILIKE :search
          OR conversation.tags::text ILIKE :search
          OR EXISTS (
            SELECT 1
            FROM messages message_search
            WHERE message_search.conversation_id = conversation.id
              AND message_search.tenant_id = conversation.tenant_id
              AND message_search.content ILIKE :search
          ))`,
        { search: `%${search}%` },
      );
    }

    const total = await queryBuilder.clone().getCount();
    const rows = await queryBuilder
      .select([
        'conversation.id AS id',
        'conversation.tenant_id AS tenant_id',
        'conversation.status AS status',
        'conversation.priority AS priority',
        'conversation.subject AS subject',
        'conversation.last_message_at AS last_message_at',
        'conversation.last_customer_message_at AS last_customer_message_at',
        'conversation.last_csr_response_at AS last_csr_response_at',
        'conversation.assigned_at AS assigned_at',
        'conversation.created_at AS created_at',
        'tenant.tenant_code AS tenant_code',
        'tenant.company_name AS company_name',
        'customer.id AS customer_id',
        'customer.full_name AS customer_name',
        'customer.phone AS customer_phone',
        'customer.notes AS customer_notes',
        'channel.id AS channel_id',
        'channel.channel_type AS channel_type',
        'channel.channel_name AS channel_name',
        'channel.display_name AS channel_display_name',
        'csr.id AS csr_id',
        'csr.full_name AS csr_name',
      ])
      .addSelect(
        `(SELECT message_preview.content
          FROM messages message_preview
          WHERE message_preview.conversation_id = conversation.id
            AND message_preview.tenant_id = conversation.tenant_id
          ORDER BY message_preview.created_at DESC
          LIMIT 1)`,
        'last_message_preview',
      )
      .addSelect(
        `(SELECT COUNT(*)
          FROM messages message_count
          WHERE message_count.conversation_id = conversation.id
            AND message_count.tenant_id = conversation.tenant_id)`,
        'message_count',
      )
      .orderBy(
        conversationSortColumns[sortBy || 'lastMessageAt'] ||
          'conversation.last_message_at',
        sortOrder || 'DESC',
      )
      .offset(skip)
      .limit(limit)
      .getRawMany();

    const data = rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      status: row.status,
      priority: row.priority,
      subject: row.subject,
      lastMessageAt: row.last_message_at,
      lastCustomerMessageAt: row.last_customer_message_at,
      lastCsrResponseAt: row.last_csr_response_at,
      assignedAt: row.assigned_at,
      createdAt: row.created_at,
      messageCount: Number(row.message_count || 0),
      lastMessagePreview: row.last_message_preview,
      tenant: {
        id: row.tenant_id,
        tenantCode: row.tenant_code,
        companyName: row.company_name,
      },
      customer: row.customer_id
        ? {
            id: row.customer_id,
            fullName: row.customer_name,
            phone: row.customer_phone,
            notes: row.customer_notes,
          }
        : null,
      channel: row.channel_id
        ? {
            id: row.channel_id,
            channelType: row.channel_type,
            channelName: row.channel_name,
            displayName: row.channel_display_name,
          }
        : null,
      assignedCsr: row.csr_id
        ? {
            id: row.csr_id,
            fullName: row.csr_name,
          }
        : null,
    }));

    const totalPages = Math.ceil(total / limit);
    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getPlatformDeliveries(
    paginationDto: PaginationDto,
    filters: PlatformOrderFilters = {},
  ): Promise<PaginatedResult<Record<string, any>>> {
    const { page = 1, limit = 20, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;
    const deliverySortColumns: Record<string, string> = {
      createdAt: 'order.created_at',
      deliveryDate: 'order.delivery_date',
      trackingNumber: 'order.tracking_number',
      status: 'order.status',
      paymentStatus: 'order.payment_status',
      companyName: 'tenant.company_name',
      customerName: 'customer.full_name',
    };

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin(Tenant, 'tenant', 'tenant.id = order.tenant_id')
      .leftJoin(Customer, 'customer', 'customer.id = order.customer_id')
      .where(
        `(order.delivery_date IS NOT NULL
          OR order.tracking_number IS NOT NULL
          OR order.delivery_assignee_name IS NOT NULL
          OR order.delivery_zone IS NOT NULL
          OR order.status IN (:...deliveryStatuses))`,
        {
          deliveryStatuses: [
            'preparing',
            'packed',
            'out_for_delivery',
            'delivered',
            'failed_delivery',
            'returned',
            'cancelled',
          ],
        },
      );

    if (filters.tenantId) {
      queryBuilder.andWhere('order.tenant_id = :tenantId', {
        tenantId: filters.tenantId,
      });
    }

    if (filters.status) {
      queryBuilder.andWhere('order.status = :status', {
        status: filters.status,
      });
    }

    if (filters.paymentStatus) {
      queryBuilder.andWhere('order.payment_status = :paymentStatus', {
        paymentStatus: filters.paymentStatus,
      });
    }

    if (filters.dateFrom) {
      queryBuilder.andWhere('order.created_at >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    }

    if (filters.dateTo) {
      queryBuilder.andWhere('order.created_at <= :dateTo', {
        dateTo: filters.dateTo,
      });
    }

    if (search) {
      queryBuilder.andWhere(
        `(order.order_number ILIKE :search
          OR order.tracking_number ILIKE :search
          OR tenant.company_name ILIKE :search
          OR tenant.tenant_code ILIKE :search
          OR customer.full_name ILIKE :search
          OR customer.phone ILIKE :search
          OR order.delivery_assignee_name ILIKE :search
          OR order.delivery_zone ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    const total = await queryBuilder.clone().getCount();
    const rows = await queryBuilder
      .select([
        'order.id AS id',
        'order.tenant_id AS tenant_id',
        'order.order_number AS order_number',
        'order.status AS status',
        'order.payment_status AS payment_status',
        'order.delivery_date AS delivery_date',
        'order.delivery_assignee_name AS delivery_assignee_name',
        'order.delivery_assignee_phone AS delivery_assignee_phone',
        'order.delivery_zone AS delivery_zone',
        'order.tracking_number AS tracking_number',
        'order.cod_amount AS cod_amount',
        'order.balance_due AS balance_due',
        'order.created_at AS created_at',
        'tenant.tenant_code AS tenant_code',
        'tenant.company_name AS company_name',
        'customer.id AS customer_id',
        'customer.full_name AS customer_name',
        'customer.phone AS customer_phone',
      ])
      .orderBy(
        deliverySortColumns[sortBy || 'deliveryDate'] || 'order.delivery_date',
        sortOrder || 'DESC',
      )
      .offset(skip)
      .limit(limit)
      .getRawMany();

    const data = rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      orderNumber: row.order_number,
      status: row.status,
      paymentStatus: row.payment_status,
      deliveryDate: row.delivery_date,
      deliveryAssigneeName: row.delivery_assignee_name,
      deliveryAssigneePhone: row.delivery_assignee_phone,
      deliveryZone: row.delivery_zone,
      trackingNumber: row.tracking_number,
      codAmount: Number(row.cod_amount || 0),
      balanceDue: Number(row.balance_due || 0),
      createdAt: row.created_at,
      tenant: {
        id: row.tenant_id,
        tenantCode: row.tenant_code,
        companyName: row.company_name,
      },
      customer: row.customer_id
        ? {
            id: row.customer_id,
            fullName: row.customer_name,
            phone: row.customer_phone,
          }
        : null,
    }));

    const totalPages = Math.ceil(total / limit);
    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getPlatformProducts(
    paginationDto: PaginationDto,
    filters: PlatformProductFilters = {},
  ): Promise<PaginatedResult<Record<string, any>>> {
    const { page = 1, limit = 20, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;
    const productSortColumns: Record<string, string> = {
      updatedAt: 'product.updated_at',
      createdAt: 'product.created_at',
      name: 'product.name',
      sku: 'product.sku',
      status: 'product.status',
      stockQuantity: 'product.stock_quantity',
      companyName: 'tenant.company_name',
    };

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoin(Tenant, 'tenant', 'tenant.id = product.tenant_id');

    if (filters.tenantId) {
      queryBuilder.andWhere('product.tenant_id = :tenantId', {
        tenantId: filters.tenantId,
      });
    }

    if (filters.status) {
      queryBuilder.andWhere('product.status = :status', {
        status: filters.status,
      });
    }

    if (search) {
      queryBuilder.andWhere(
        `(product.name ILIKE :search
          OR product.sku ILIKE :search
          OR tenant.company_name ILIKE :search
          OR tenant.tenant_code ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    const total = await queryBuilder.clone().getCount();
    const rows = await queryBuilder
      .select([
        'product.id AS id',
        'product.tenant_id AS tenant_id',
        'product.name AS name',
        'product.sku AS sku',
        'product.status AS status',
        'product.price AS price',
        'product.stock_quantity AS stock_quantity',
        'product.low_stock_threshold AS low_stock_threshold',
        'product.track_inventory AS track_inventory',
        'product.updated_at AS updated_at',
        'tenant.tenant_code AS tenant_code',
        'tenant.company_name AS company_name',
      ])
      .orderBy(
        productSortColumns[sortBy || 'updatedAt'] || 'product.updated_at',
        sortOrder || 'DESC',
      )
      .offset(skip)
      .limit(limit)
      .getRawMany();

    const data = rows.map((row) => {
      const stockQuantity = Number(row.stock_quantity || 0);
      const lowStockThreshold = Number(row.low_stock_threshold || 0);
      const trackInventory = Boolean(row.track_inventory);
      return {
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        sku: row.sku,
        status: row.status,
        price: Number(row.price || 0),
        stockQuantity,
        lowStockThreshold,
        trackInventory,
        isLowStock: trackInventory && stockQuantity <= lowStockThreshold,
        updatedAt: row.updated_at,
        tenant: {
          id: row.tenant_id,
          tenantCode: row.tenant_code,
          companyName: row.company_name,
        },
      };
    });

    const totalPages = Math.ceil(total / limit);
    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getPlatformProductCatalogSummary(search?: string) {
    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoin(Tenant, 'tenant', 'tenant.id = product.tenant_id');

    if (search) {
      queryBuilder.where(
        '(tenant.company_name ILIKE :search OR tenant.tenant_code ILIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    const rows = await queryBuilder
      .select('product.tenant_id', 'tenantId')
      .addSelect('tenant.tenant_code', 'tenantCode')
      .addSelect('tenant.company_name', 'companyName')
      .addSelect('COUNT(*)', 'productCount')
      .addSelect(
        "SUM(CASE WHEN product.status = 'active' THEN 1 ELSE 0 END)",
        'activeProducts',
      )
      .addSelect(
        "SUM(CASE WHEN product.status = 'inactive' THEN 1 ELSE 0 END)",
        'inactiveProducts',
      )
      .addSelect(
        "SUM(CASE WHEN product.status = 'out_of_stock' THEN 1 ELSE 0 END)",
        'outOfStockProducts',
      )
      .addSelect(
        'SUM(CASE WHEN product.track_inventory = true AND product.stock_quantity <= product.low_stock_threshold THEN 1 ELSE 0 END)',
        'lowStockProducts',
      )
      .addSelect('MAX(product.updated_at)', 'lastUpdatedAt')
      .groupBy('product.tenant_id')
      .addGroupBy('tenant.tenant_code')
      .addGroupBy('tenant.company_name')
      .orderBy('MAX(product.updated_at)', 'DESC')
      .getRawMany();

    return rows.map((row) => ({
      tenantId: row.tenantId,
      tenantCode: row.tenantCode,
      companyName: row.companyName,
      productCount: Number(row.productCount || 0),
      activeProducts: Number(row.activeProducts || 0),
      inactiveProducts: Number(row.inactiveProducts || 0),
      outOfStockProducts: Number(row.outOfStockProducts || 0),
      lowStockProducts: Number(row.lowStockProducts || 0),
      lastUpdatedAt: row.lastUpdatedAt,
    }));
  }

  async getTenantSupportNote(tenantId: string) {
    const tenant = await this.getTenantById(tenantId);
    const supportNote = tenant.featureFlags?.platformSupportNote || {};

    return {
      note: typeof supportNote.note === 'string' ? supportNote.note : '',
      updatedAt: supportNote.updatedAt || null,
    };
  }

  async updateTenantSupportNote(tenantId: string, note: string) {
    const tenant = await this.getTenantById(tenantId);
    tenant.featureFlags = {
      ...(tenant.featureFlags || {}),
      platformSupportNote: {
        note,
        updatedAt: new Date().toISOString(),
      },
    };

    await this.tenantRepository.save(tenant);
    return this.getTenantSupportNote(tenantId);
  }

  // Platform Admin Management
  async getAllPlatformAdmins(): Promise<PlatformAdmin[]> {
    return this.platformAdminRepository.find({
      select: [
        'id',
        'fullName',
        'email',
        'role',
        'status',
        'lastLoginAt',
        'createdAt',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async getPlatformAdminById(id: string): Promise<PlatformAdmin> {
    const admin = await this.platformAdminRepository.findOne({
      where: { id },
      select: [
        'id',
        'fullName',
        'email',
        'role',
        'status',
        'lastLoginAt',
        'createdAt',
      ],
    });

    if (!admin) {
      throw new NotFoundException('Platform admin not found');
    }

    return admin;
  }

  async updatePlatformAdminStatus(
    id: string,
    status: string,
  ): Promise<PlatformAdmin> {
    const admin = await this.getPlatformAdminById(id);
    admin.status = status;
    return this.platformAdminRepository.save(admin);
  }

  async getPlatformSettings(): Promise<Record<string, any>> {
    const settings = await this.platformSettingRepository.find();
    return settings.reduce(
      (acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      },
      {} as Record<string, any>,
    );
  }

  async updatePlatformSettings(
    settings: Record<string, any>,
  ): Promise<Record<string, any>> {
    for (const [key, value] of Object.entries(settings)) {
      let setting = await this.platformSettingRepository.findOne({
        where: { key },
      });
      if (!setting) {
        setting = this.platformSettingRepository.create({ key, value });
      } else {
        setting.value = value;
      }
      await this.platformSettingRepository.save(setting);
    }

    return this.getPlatformSettings();
  }

  async getFeatureToggles(): Promise<Record<string, any>> {
    const setting = await this.platformSettingRepository.findOne({
      where: { key: 'feature_toggles' },
    });
    return setting?.value || {};
  }

  async getPublicSubscriptionPlans() {
    const plans = await this.subscriptionPlanRepository.find({
      // Trial plans are never part of the public marketing/requestable
      // catalog (Plan 14 Phase 5, task 5.5), and non-requestable business
      // plans are excluded from purchase choices (Plan 14 Phase 6, task 6.3).
      where: { status: 'active', planType: Not('trial'), requestable: true },
      order: { monthlyPrice: 'ASC', createdAt: 'ASC' },
    });

    return plans
      .map((plan) => {
        const publicMeta =
          typeof plan.features?.public === 'object' && plan.features.public
            ? (plan.features.public as Record<string, any>)
            : {};
        if (publicMeta.visible === false) return null;
        const featureList = Array.isArray(publicMeta.featureList)
          ? publicMeta.featureList
              .filter(
                (item): item is string =>
                  typeof item === 'string' && item.trim().length > 0,
              )
              .map((item) => item.trim())
          : [];
        return {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          monthlyPrice: Number(plan.monthlyPrice || 0),
          durationDays: plan.durationDays,
          messageQuotaMode: plan.messageQuotaMode || 'combined',
          maxCsrs: plan.maxCsrs,
          maxChannels: plan.maxChannels,
          messageLimit: plan.messageLimit,
          inboundMessageLimit: plan.inboundMessageLimit,
          outboundMessageLimit: plan.outboundMessageLimit,
          allowedProviders: plan.allowedProviders,
          apiLimit: plan.apiLimit,
          storageLimitGb: plan.storageLimitGb,
          status: plan.status,
          public: {
            displayOrder: Number.isFinite(Number(publicMeta.displayOrder))
              ? Number(publicMeta.displayOrder)
              : null,
            eyebrow:
              typeof publicMeta.eyebrow === 'string'
                ? publicMeta.eyebrow
                : null,
            summary:
              typeof publicMeta.summary === 'string'
                ? publicMeta.summary
                : null,
            targetCustomer:
              typeof publicMeta.targetCustomer === 'string'
                ? publicMeta.targetCustomer
                : null,
            recommended:
              typeof publicMeta.recommended === 'boolean'
                ? publicMeta.recommended
                : false,
            recommendationLabel:
              typeof publicMeta.recommendationLabel === 'string'
                ? publicMeta.recommendationLabel
                : null,
            selfServe:
              typeof publicMeta.selfServe === 'boolean'
                ? publicMeta.selfServe
                : false,
            ctaLabel:
              typeof publicMeta.ctaLabel === 'string'
                ? publicMeta.ctaLabel
                : null,
            ctaHref:
              typeof publicMeta.ctaHref === 'string'
                ? publicMeta.ctaHref
                : null,
            currencyCode:
              typeof publicMeta.currencyCode === 'string'
                ? publicMeta.currencyCode
                : null,
            billingInterval:
              publicMeta.billingInterval === 'monthly' ||
              publicMeta.billingInterval === 'one_time' ||
              publicMeta.billingInterval === 'custom'
                ? publicMeta.billingInterval
                : null,
            monthlyPriceLabel:
              typeof publicMeta.monthlyPriceLabel === 'string'
                ? publicMeta.monthlyPriceLabel
                : null,
            setupFeeMmk: Number.isFinite(Number(publicMeta.setupFeeMmk))
              ? Number(publicMeta.setupFeeMmk)
              : null,
            setupFeeLabel:
              typeof publicMeta.setupFeeLabel === 'string'
                ? publicMeta.setupFeeLabel
                : null,
            setupFeeStartsFrom:
              typeof publicMeta.setupFeeStartsFrom === 'boolean'
                ? publicMeta.setupFeeStartsFrom
                : false,
            includedUsersLabel:
              typeof publicMeta.includedUsersLabel === 'string'
                ? publicMeta.includedUsersLabel
                : null,
            includedChannelsLabel:
              typeof publicMeta.includedChannelsLabel === 'string'
                ? publicMeta.includedChannelsLabel
                : null,
            featureList,
            availability:
              publicMeta.availability === 'contact-only'
                ? 'contact-only'
                : 'enabled',
          },
        };
      })
      .filter(Boolean);
  }

  async updateFeatureToggles(
    features: Record<string, any>,
  ): Promise<Record<string, any>> {
    let setting = await this.platformSettingRepository.findOne({
      where: { key: 'feature_toggles' },
    });
    if (!setting) {
      setting = this.platformSettingRepository.create({
        key: 'feature_toggles',
        value: features,
      });
    } else {
      setting.value = features;
    }

    await this.platformSettingRepository.save(setting);
    return setting.value;
  }

  async getTenantRateLimit(tenantId: string): Promise<TenantRateLimit> {
    await this.getTenantById(tenantId);

    let rateLimit = await this.tenantRateLimitRepository.findOne({
      where: { tenantId },
    });
    if (!rateLimit) {
      rateLimit = this.tenantRateLimitRepository.create({ tenantId });
      rateLimit = await this.tenantRateLimitRepository.save(rateLimit);
    }

    return rateLimit;
  }

  async updateTenantRateLimit(
    tenantId: string,
    updateData: Partial<TenantRateLimit>,
  ): Promise<TenantRateLimit> {
    const rateLimit = await this.getTenantRateLimit(tenantId);
    Object.assign(rateLimit, updateData, { tenantId });
    return this.tenantRateLimitRepository.save(rateLimit);
  }

  async getPlatformRateLimits() {
    const [tenants, rateLimits] = await Promise.all([
      this.tenantRepository.find({ order: { companyName: 'ASC' } }),
      this.tenantRateLimitRepository.find({ order: { updatedAt: 'DESC' } }),
    ]);

    const byTenantId = new Map(
      rateLimits.map((rateLimit) => [rateLimit.tenantId, rateLimit]),
    );

    return tenants.map((tenant) => {
      const rateLimit = byTenantId.get(tenant.id);

      return {
        id: rateLimit?.id || null,
        tenantId: tenant.id,
        tenant: {
          id: tenant.id,
          tenantCode: tenant.tenantCode,
          companyName: tenant.companyName,
          status: tenant.status,
        },
        source: rateLimit ? 'persisted' : 'default',
        messagesPerMinute:
          rateLimit?.messagesPerMinute ??
          defaultTenantRateLimit.messagesPerMinute,
        apiRequestsPerMinute:
          rateLimit?.apiRequestsPerMinute ??
          defaultTenantRateLimit.apiRequestsPerMinute,
        webhookEventsPerMinute:
          rateLimit?.webhookEventsPerMinute ??
          defaultTenantRateLimit.webhookEventsPerMinute,
        throttlingMode:
          rateLimit?.throttlingMode ?? defaultTenantRateLimit.throttlingMode,
        graceLimitPercentage:
          rateLimit?.graceLimitPercentage ??
          defaultTenantRateLimit.graceLimitPercentage,
        updatedAt: rateLimit?.updatedAt?.toISOString?.() ?? null,
      };
    });
  }

  private async buildTenantUsageAndLimits(tenant: Tenant) {
    const { periodStart, periodEnd } = this.currentMonthlyPeriod();
    const plan = tenant.subscriptionPlanId
      ? await this.subscriptionPlanRepository.findOne({
          where: { id: tenant.subscriptionPlanId },
        })
      : null;
    const [
      apiRequestsUsed,
      providerMessagesUsed,
      csrsUsed,
      channelsUsed,
      providerBreakdown,
      latestUsageEventAt,
    ] = await Promise.all([
      this.sumTenantUsage(tenant.id, 'api_request', periodStart, periodEnd),
      this.sumTenantUsage(
        tenant.id,
        'provider_message',
        periodStart,
        periodEnd,
      ),
      this.tenantUserRepository.count({
        where: { tenantId: tenant.id, status: 'active' },
      }),
      this.tenantChannelRepository.count({
        where: { tenantId: tenant.id, status: 'active' },
      }),
      this.getProviderUsageBreakdown(tenant.id, periodStart, periodEnd),
      this.getLatestUsageEventAt(tenant.id, periodStart, periodEnd),
    ]);
    const refreshedAt = new Date().toISOString();
    return this.buildTenantUsageSummary({
      tenant,
      plan,
      periodStart,
      periodEnd,
      refreshedAt,
      latestUsageEventAt,
      apiRequestsUsed,
      providerMessagesUsed,
      csrsUsed,
      channelsUsed,
      providerBreakdown,
    });
  }

  private buildTenantUsageSummary(input: {
    tenant: Tenant;
    plan: SubscriptionPlan | null;
    periodStart: Date;
    periodEnd: Date;
    refreshedAt: string;
    latestUsageEventAt: string | null;
    apiRequestsUsed: number;
    providerMessagesUsed: number;
    csrsUsed: number;
    channelsUsed: number;
    providerBreakdown: Array<{
      provider: string | null;
      channelId: string | null;
      direction: string | null;
      used: number;
    }>;
  }) {
    const limits = {
      csrs: this.effectiveLimit(
        input.tenant.customCsrLimit,
        input.plan?.maxCsrs,
      ),
      channels: this.effectiveLimit(
        input.tenant.customChannelLimit,
        input.plan?.maxChannels,
      ),
      apiRequests: this.effectiveLimit(
        input.tenant.customApiLimit,
        input.plan?.apiLimit,
      ),
      providerMessages: this.effectiveLimit(
        input.tenant.customMessageLimit,
        input.plan?.messageLimit,
      ),
    };
    const usage = {
      csrs: input.csrsUsed,
      channels: input.channelsUsed,
      apiRequests: input.apiRequestsUsed,
      providerMessages: input.providerMessagesUsed,
    };
    const warnings = [
      this.buildUsageWarning('csrs', usage.csrs, limits.csrs),
      this.buildUsageWarning('channels', usage.channels, limits.channels),
      this.buildUsageWarning(
        'apiRequests',
        usage.apiRequests,
        limits.apiRequests,
      ),
      this.buildUsageWarning(
        'providerMessages',
        usage.providerMessages,
        limits.providerMessages,
      ),
    ].filter(Boolean) as UsageWarning[];

    return {
      tenant: {
        id: input.tenant.id,
        tenantCode: input.tenant.tenantCode,
        companyName: input.tenant.companyName,
        status: input.tenant.status,
      },
      subscriptionPlan: input.plan
        ? {
            id: input.plan.id,
            name: input.plan.name,
            monthlyPrice: Number(input.plan.monthlyPrice || 0),
          }
        : null,
      period: {
        start: input.periodStart.toISOString(),
        end: input.periodEnd.toISOString(),
      },
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      refreshedAt: input.refreshedAt,
      usageSource: 'tenant_usage_events',
      latestUsageEventAt: input.latestUsageEventAt,
      limits,
      usage,
      remaining: {
        csrs: this.remainingCapacity(usage.csrs, limits.csrs),
        channels: this.remainingCapacity(usage.channels, limits.channels),
        apiRequests: this.remainingCapacity(
          usage.apiRequests,
          limits.apiRequests,
        ),
        providerMessages: this.remainingCapacity(
          usage.providerMessages,
          limits.providerMessages,
        ),
      },
      metrics: {
        csrs: this.buildUsageMetric(
          'csrs',
          'Active team members',
          usage.csrs,
          limits.csrs,
          warnings,
          input.refreshedAt,
          null,
        ),
        channels: this.buildUsageMetric(
          'channels',
          'Active connected channels',
          usage.channels,
          limits.channels,
          warnings,
          input.refreshedAt,
          null,
        ),
        apiRequests: this.buildUsageMetric(
          'apiRequests',
          'API requests',
          usage.apiRequests,
          limits.apiRequests,
          warnings,
          input.refreshedAt,
          input.latestUsageEventAt,
        ),
        providerMessages: this.buildUsageMetric(
          'providerMessages',
          'Provider messages',
          usage.providerMessages,
          limits.providerMessages,
          warnings,
          input.refreshedAt,
          input.latestUsageEventAt,
        ),
      },
      warnings,
      providerBreakdown: input.providerBreakdown,
    };
  }

  private async sumTenantUsage(
    tenantId: string,
    usageType: UsageType,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const result = await this.tenantUsageRepository
      .createQueryBuilder('usage')
      .select('COALESCE(SUM(usage.quantity), 0)', 'total')
      .where('usage.tenant_id = :tenantId', { tenantId })
      .andWhere('usage.usage_type = :usageType', { usageType })
      .andWhere('usage.occurred_at >= :periodStart', { periodStart })
      .andWhere('usage.occurred_at < :periodEnd', { periodEnd })
      .getRawOne<{ total: string }>();

    return Number(result?.total || 0);
  }

  private async sumUsageByTenant(
    usageType: UsageType,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const rows = await this.tenantUsageRepository
      .createQueryBuilder('usage')
      .select('usage.tenant_id', 'tenantId')
      .addSelect('COALESCE(SUM(usage.quantity), 0)', 'total')
      .where('usage.usage_type = :usageType', { usageType })
      .andWhere('usage.occurred_at >= :periodStart', { periodStart })
      .andWhere('usage.occurred_at < :periodEnd', { periodEnd })
      .groupBy('usage.tenant_id')
      .getRawMany<{ tenantId: string; total: string }>();

    return new Map(rows.map((row) => [row.tenantId, Number(row.total || 0)]));
  }

  private async countActiveUsersByTenant() {
    const rows = await this.tenantUserRepository
      .createQueryBuilder('user')
      .select('user.tenant_id', 'tenantId')
      .addSelect('COUNT(*)', 'total')
      .where('user.status = :status', { status: 'active' })
      .groupBy('user.tenant_id')
      .getRawMany<{ tenantId: string; total: string }>();

    return new Map(rows.map((row) => [row.tenantId, Number(row.total || 0)]));
  }

  private async countActiveChannelsByTenant() {
    const rows = await this.tenantChannelRepository
      .createQueryBuilder('channel')
      .select('channel.tenant_id', 'tenantId')
      .addSelect('COUNT(*)', 'total')
      .where('channel.status = :status', { status: 'active' })
      .groupBy('channel.tenant_id')
      .getRawMany<{ tenantId: string; total: string }>();

    return new Map(rows.map((row) => [row.tenantId, Number(row.total || 0)]));
  }

  private async getProviderUsageBreakdown(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const rows = await this.tenantUsageRepository
      .createQueryBuilder('usage')
      .select('usage.provider', 'provider')
      .addSelect('usage.channel_id', 'channelId')
      .addSelect('usage.direction', 'direction')
      .addSelect('COALESCE(SUM(usage.quantity), 0)', 'total')
      .where('usage.tenant_id = :tenantId', { tenantId })
      .andWhere('usage.usage_type = :usageType', {
        usageType: 'provider_message',
      })
      .andWhere('usage.occurred_at >= :periodStart', { periodStart })
      .andWhere('usage.occurred_at < :periodEnd', { periodEnd })
      .groupBy('usage.provider')
      .addGroupBy('usage.channel_id')
      .addGroupBy('usage.direction')
      .getRawMany<{
        provider: string | null;
        channelId: string | null;
        direction: string | null;
        total: string;
      }>();

    return rows.map((row) => ({
      provider: row.provider,
      channelId: row.channelId,
      direction: row.direction,
      used: Number(row.total || 0),
    }));
  }

  private async getProviderUsageBreakdownByTenant(
    periodStart: Date,
    periodEnd: Date,
  ) {
    const rows = await this.tenantUsageRepository
      .createQueryBuilder('usage')
      .select('usage.tenant_id', 'tenantId')
      .addSelect('usage.provider', 'provider')
      .addSelect('usage.channel_id', 'channelId')
      .addSelect('usage.direction', 'direction')
      .addSelect('COALESCE(SUM(usage.quantity), 0)', 'total')
      .where('usage.usage_type = :usageType', { usageType: 'provider_message' })
      .andWhere('usage.occurred_at >= :periodStart', { periodStart })
      .andWhere('usage.occurred_at < :periodEnd', { periodEnd })
      .groupBy('usage.tenant_id')
      .addGroupBy('usage.provider')
      .addGroupBy('usage.channel_id')
      .addGroupBy('usage.direction')
      .getRawMany<{
        tenantId: string;
        provider: string | null;
        channelId: string | null;
        direction: string | null;
        total: string;
      }>();

    const grouped = new Map<
      string,
      Array<{
        provider: string | null;
        channelId: string | null;
        direction: string | null;
        used: number;
      }>
    >();
    for (const row of rows) {
      const current = grouped.get(row.tenantId) || [];
      current.push({
        provider: row.provider,
        channelId: row.channelId,
        direction: row.direction,
        used: Number(row.total || 0),
      });
      grouped.set(row.tenantId, current);
    }

    return grouped;
  }

  private async getLatestUsageEventAt(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const result = await this.tenantUsageRepository
      .createQueryBuilder('usage')
      .select('MAX(usage.occurred_at)', 'latest')
      .where('usage.tenant_id = :tenantId', { tenantId })
      .andWhere('usage.occurred_at >= :periodStart', { periodStart })
      .andWhere('usage.occurred_at < :periodEnd', { periodEnd })
      .getRawOne<{ latest: string | null }>();

    return result?.latest || null;
  }

  private async getLatestUsageEventsByTenant(
    periodStart: Date,
    periodEnd: Date,
  ) {
    const rows = await this.tenantUsageRepository
      .createQueryBuilder('usage')
      .select('usage.tenant_id', 'tenantId')
      .addSelect('MAX(usage.occurred_at)', 'latest')
      .where('usage.occurred_at >= :periodStart', { periodStart })
      .andWhere('usage.occurred_at < :periodEnd', { periodEnd })
      .groupBy('usage.tenant_id')
      .getRawMany<{ tenantId: string; latest: string | null }>();

    return new Map(rows.map((row) => [row.tenantId, row.latest || null]));
  }

  private buildUsageWarning(
    metric: UsageMetricKey,
    used: number,
    limit: number | null,
  ): UsageWarning | null {
    if (limit === null) return null;
    if (limit <= 0) {
      return {
        metric,
        severity: 'limit_reached',
        used,
        limit,
        percentUsed: 100,
      };
    }

    const percentUsed = Math.round((used / limit) * 100);
    if (used >= limit) {
      return { metric, severity: 'limit_reached', used, limit, percentUsed };
    }
    if (percentUsed >= 80) {
      return { metric, severity: 'warning', used, limit, percentUsed };
    }

    return null;
  }

  private remainingCapacity(used: number, limit: number | null) {
    return limit === null ? null : Math.max(limit - used, 0);
  }

  private usagePercent(used: number, limit: number | null) {
    if (limit === null) return null;
    if (limit <= 0) return 100;
    return Math.round((used / limit) * 100);
  }

  private buildUsageMetric(
    key: UsageMetricKey,
    label: string,
    used: number,
    limit: number | null,
    warnings: UsageWarning[],
    refreshedAt: string,
    lastRecordedAt: string | null,
  ) {
    const warning =
      warnings.find((candidate) => candidate.metric === key) || null;

    return {
      key,
      label,
      used,
      limit,
      remaining: this.remainingCapacity(used, limit),
      percentUsed: this.usagePercent(used, limit),
      unlimited: limit === null,
      available: true,
      warningSeverity: warning?.severity || null,
      refreshedAt,
      lastRecordedAt,
    };
  }

  private effectiveLimit(
    customLimit?: number | null,
    planLimit?: number | null,
  ) {
    if (customLimit !== undefined && customLimit !== null) {
      const custom = Number(customLimit);
      if (Number.isFinite(custom) && custom >= 0) return Math.floor(custom);
    }

    if (planLimit !== undefined && planLimit !== null) {
      const plan = Number(planLimit);
      if (Number.isFinite(plan) && plan >= 0) return Math.floor(plan);
    }

    return null;
  }

  private currentMonthlyPeriod(now = new Date()) {
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    );
    return { periodStart, periodEnd };
  }

  private dateOnly(value: Date | string | null | undefined) {
    return value ? new Date(value).toISOString().slice(0, 10) : null;
  }

  private sameDate(
    left: Date | string | null | undefined,
    right: Date | string | null | undefined,
  ) {
    return Boolean(
      left && right && this.dateOnly(left) === this.dateOnly(right),
    );
  }

  private periodsOverlap(
    leftStart: Date | string | null | undefined,
    leftEnd: Date | string | null | undefined,
    rightStart: Date | string | null | undefined,
    rightEnd: Date | string | null | undefined,
  ) {
    if (!leftStart || !leftEnd || !rightStart || !rightEnd) return false;
    return (
      new Date(leftStart) < new Date(rightEnd) &&
      new Date(rightStart) < new Date(leftEnd)
    );
  }

  private addMonths(date: Date, months: number) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private parseDate(
    value: string | Date | null | undefined,
    fieldName: string,
    fallback?: Date | null,
  ): Date | null {
    if (value === undefined || value === null || value === '')
      return fallback || null;

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }

    return parsed;
  }

  private assertBillingPeriod(periodStart: Date, periodEnd: Date) {
    if (periodEnd <= periodStart) {
      throw new BadRequestException(
        'billingPeriodEnd must be after billingPeriodStart',
      );
    }
  }

  private assertBillingStatuses(invoiceStatus: string, paymentStatus: string) {
    if (!billingInvoiceStatuses.includes(invoiceStatus as any)) {
      throw new BadRequestException('invoiceStatus is not valid');
    }
    if (!billingPaymentStatuses.includes(paymentStatus as any)) {
      throw new BadRequestException('paymentStatus is not valid');
    }
    if (invoiceStatus === 'void' && paymentStatus === 'paid') {
      throw new BadRequestException('Void invoices cannot be marked paid');
    }
  }

  private assertPaymentTransition(previousStatus: string, nextStatus: string) {
    const allowed = allowedPaymentStatusTransitions[previousStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `Cannot change paymentStatus from ${previousStatus} to ${nextStatus}`,
      );
    }
  }

  private assertPaymentAmounts(
    amountDue: number | string,
    amountPaid: number | string,
    paymentStatus: string,
  ) {
    const normalizedDue = this.moneyValue(amountDue);
    const normalizedPaid = this.moneyValue(amountPaid);
    if (normalizedPaid > normalizedDue) {
      throw new BadRequestException('amountPaid cannot exceed amountDue');
    }
    if (paymentStatus === 'paid' && normalizedPaid !== normalizedDue) {
      throw new BadRequestException(
        'Paid invoices must have amountPaid equal to amountDue',
      );
    }
  }

  private moneyValue(value: number | string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(
        'Billing amounts must be non-negative numbers',
      );
    }
    return Number(parsed.toFixed(2));
  }

  private assertBillingCollectionTimeline(
    billingRecord: TenantBillingRecord,
    markOverdue: boolean,
    suspendTenant: boolean,
    now: Date,
  ) {
    if (!markOverdue && !suspendTenant) return;
    if (!billingRecord.dueDate) {
      throw new BadRequestException(
        'dueDate is required before overdue or suspension actions',
      );
    }

    const dueDate = new Date(billingRecord.dueDate);
    const overdueAllowedAt = new Date(dueDate);
    overdueAllowedAt.setUTCHours(0, 0, 0, 0);
    overdueAllowedAt.setUTCDate(overdueAllowedAt.getUTCDate() + 1);
    if (markOverdue && now < overdueAllowedAt) {
      throw new BadRequestException(
        'Invoice cannot be marked overdue before the due date has passed',
      );
    }

    const suspensionAllowedAt = new Date(overdueAllowedAt);
    suspensionAllowedAt.setUTCDate(
      suspensionAllowedAt.getUTCDate() +
        billingCollectionPolicy.suspensionGraceDaysAfterDueDate,
    );
    if (suspendTenant && now < suspensionAllowedAt) {
      throw new BadRequestException(
        `Tenant billing suspension requires ${billingCollectionPolicy.suspensionGraceDaysAfterDueDate} grace days after due date`,
      );
    }
  }

  private normalizeAmount(
    value: number | string | null | undefined,
    fallback: number | string,
    fieldName: string,
  ) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(
        `${fieldName} must be a non-negative amount`,
      );
    }

    return Number(parsed.toFixed(2));
  }

  private normalizeCurrency(value: string | null | undefined) {
    const currency = (value || 'MMK').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException(
        'currency must be an ISO 4217 three-letter code',
      );
    }
    return currency;
  }

  private async assertUniqueInvoiceNumber(
    invoiceNumber: string | null,
    exceptId?: string,
  ) {
    if (!invoiceNumber) return;
    const existing = await this.tenantBillingRecordRepository.findOne({
      where: { invoiceNumber },
    });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('invoiceNumber already exists');
    }
  }

  private async assertNoOverlappingBillingRecord(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    exceptId?: string,
  ) {
    const existingRecords = await this.tenantBillingRecordRepository.find({
      where: { tenantId },
    });
    const overlap = existingRecords.find((record) => {
      if (record.id === exceptId || record.invoiceStatus === 'void')
        return false;
      const existingStart = new Date(record.billingPeriodStart);
      const existingEnd = new Date(record.billingPeriodEnd);
      return periodStart < existingEnd && periodEnd > existingStart;
    });
    if (overlap) {
      throw new ConflictException(
        'Billing period overlaps an existing non-void invoice',
      );
    }
  }

  private assertConfirmedBillingFieldsImmutable(
    billingRecord: TenantBillingRecord,
    updateBillingDto: UpdateTenantBillingRecordDto,
  ) {
    if (billingRecord.paymentStatus !== 'paid') return;
    const immutableFields: Array<keyof UpdateTenantBillingRecordDto> = [
      'subscriptionPlanId',
      'invoiceNumber',
      'billingPeriodStart',
      'billingPeriodEnd',
      'invoiceStatus',
      'paymentStatus',
      'amountDue',
      'amountPaid',
      'currency',
      'paidAt',
    ];
    const changedField = immutableFields.find(
      (field) => updateBillingDto[field] !== undefined,
    );
    if (changedField) {
      throw new ConflictException(
        `Paid billing records cannot change ${String(changedField)}`,
      );
    }
  }

  private assertYangonCalendarBillingWindow(
    periodStart: Date,
    periodEnd: Date,
  ): void {
    // TenantBillingRecord stores PostgreSQL `date` values. Compare their UTC
    // date parts as calendar dates; converting a date-typed value through
    // Asia/Yangon would shift June 1 UTC into May 31 Yangon.
    const startIsFirstOfMonth = periodStart.getUTCDate() === 1;
    const expectedEnd = new Date(
      Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
    );
    const actualEnd = new Date(
      Date.UTC(
        periodEnd.getUTCFullYear(),
        periodEnd.getUTCMonth(),
        periodEnd.getUTCDate(),
      ),
    );

    if (!startIsFirstOfMonth || actualEnd.getTime() !== expectedEnd.getTime()) {
      throw new ConflictException(
        'Billing period must match one complete Asia/Yangon calendar month',
      );
    }
  }

  private yangonStartFromBillingDate(billingDate: Date): Date {
    return yangonWallClockToUtc(
      billingDate.getUTCFullYear(),
      billingDate.getUTCMonth() + 1,
      billingDate.getUTCDate(),
    );
  }

  private async activateTopUpForPaidBillingRecord(
    billingRecord: TenantBillingRecord,
    manager?: EntityManager,
    reviewedBy?: string,
  ): Promise<void> {
    if (
      billingRecord.metadata?.purchaseRequestType !== 'top_up' ||
      !this.subscriptionAddOnPurchaseService
    ) {
      return;
    }
    await this.subscriptionAddOnPurchaseService.confirmPurchaseForBillingRecord(
      billingRecord.tenantId,
      billingRecord.id,
      {
        actor: { type: 'platform_admin', id: reviewedBy || 'billing-record' },
        source: 'platform_payment_confirmation',
        reason: 'Top-up payment confirmed through billing review',
        idempotencyKey: `top-up-payment-confirmation:${billingRecord.id}`,
        manager,
      },
    );
  }

  private async activateEntitlementForPaidBillingRecord(
    billingRecord: TenantBillingRecord,
    manager: EntityManager,
  ) {
    if (billingRecord.paymentStatus !== 'paid') {
      return;
    }

    const purchaseRequestType = billingRecord.metadata?.purchaseRequestType;
    const isUpgrade = purchaseRequestType === 'upgrade';
    const isTrialConversion = purchaseRequestType === 'trial_conversion';
    const isAfterTrial = billingRecord.metadata?.purchaseMode === 'after_trial';

    // Plan 13 Phase 2 (tasks 2.13/2.14): an upgrade invoice never creates a
    // second period. It marks the upgrade revision as payment-confirmed and
    // awaiting Platform Admin approval; the upgrade attaches to the existing
    // current period and the original period snapshot stays untouched.
    if (isUpgrade) {
      await this.markUpgradePaymentConfirmed(billingRecord, manager);
      return;
    }

    // Plan 14 Phase 4 (task 4.13): a trial-conversion invoice both marks the
    // conversion revision payment-confirmed and creates the paid business
    // period. The trial stays authoritative (and its period row stays active)
    // until Platform Admin activates the paid period.
    if (isTrialConversion) {
      await this.markUpgradePaymentConfirmed(billingRecord, manager);
    }

    if (!billingRecord.subscriptionPlanId) {
      return;
    }

    const plan = await this.getSubscriptionPlanById(
      billingRecord.subscriptionPlanId,
    );
    const billingPeriodStart = new Date(billingRecord.billingPeriodStart);
    const billingPeriodEnd = new Date(billingRecord.billingPeriodEnd);
    this.assertYangonCalendarBillingWindow(
      billingPeriodStart,
      billingPeriodEnd,
    );
    const calendarMonthStart =
      this.yangonStartFromBillingDate(billingPeriodStart);
    const calendarMonthEnd = yangonMonthEnd(calendarMonthStart);
    const requestedEffectiveStart =
      typeof billingRecord.metadata?.effectivePeriodStartAt === 'string'
        ? new Date(billingRecord.metadata.effectivePeriodStartAt)
        : null;
    const periodStart =
      isAfterTrial &&
      requestedEffectiveStart &&
      !Number.isNaN(requestedEffectiveStart.getTime())
        ? requestedEffectiveStart
        : calendarMonthStart;
    const periodEnd = calendarMonthEnd;
    if (
      periodStart.getTime() < calendarMonthStart.getTime() ||
      periodStart.getTime() >= periodEnd.getTime()
    ) {
      throw new ConflictException(
        'The scheduled after-trial period must start inside its Yangon calendar month.',
      );
    }
    const now = new Date();
    const currentMonthStart = yangonMonthStart(now);
    const currentMonthEnd = yangonMonthEnd(now);
    const isCurrentYangonMonth =
      calendarMonthStart.getTime() === currentMonthStart.getTime() &&
      calendarMonthEnd.getTime() === currentMonthEnd.getTime();
    const isEffectiveStartReached = now.getTime() >= periodStart.getTime();
    const isPastYangonMonth =
      periodEnd.getTime() <= currentMonthStart.getTime();
    const requestedStartOption =
      typeof billingRecord.metadata?.startOption === 'string'
        ? billingRecord.metadata.startOption
        : billingRecord.metadata?.activationPolicy;

    if (
      requestedStartOption === 'next_month' &&
      periodStart.getTime() <= currentMonthStart.getTime()
    ) {
      throw new ConflictException(
        'The selected next_month billing period is stale; choose a new start month',
      );
    }

    // Plan 13 Phase 2 (tasks 2.1–2.3): payment confirmation creates/reuses the
    // period ledger row with `admin_activation_status = pending` for business
    // plans (auto-approve trial plans pass `approved`). It no longer projects
    // operational entitlement — Platform Admin approval does that via
    // `adminActivatePeriod`.
    const period = await this.subscriptionPeriodService.ensurePaidBillingPeriod(
      {
        tenantId: billingRecord.tenantId,
        plan,
        monthStartAt: periodStart,
        monthEndAt: periodEnd,
        effectivePeriodStartAt: isAfterTrial ? periodStart : undefined,
        effectivePeriodEndAt: isAfterTrial ? periodEnd : undefined,
        startOption: isAfterTrial
          ? 'scheduled_prepaid'
          : isCurrentYangonMonth
            ? 'current_month'
            : 'scheduled_prepaid',
        periodStatus: isPastYangonMonth
          ? 'expired'
          : isAfterTrial
            ? isEffectiveStartReached
              ? 'active'
              : 'upcoming'
            : isCurrentYangonMonth
              ? 'active'
              : 'upcoming',
        paymentStatus: 'paid',
        adminActivationStatus: plan.autoApprove ? 'approved' : 'pending',
        billingRecordId: billingRecord.id,
        activatedAt:
          !isAfterTrial && isCurrentYangonMonth
            ? now
            : isAfterTrial && isEffectiveStartReached
              ? now
              : null,
        activationReason:
          !isAfterTrial && isCurrentYangonMonth
            ? 'initial'
            : isAfterTrial && isEffectiveStartReached
              ? 'scheduled'
              : null,
        expiredAt: isPastYangonMonth ? periodEnd : null,
        endReason: isPastYangonMonth ? 'scheduled_expiry' : null,
        actorType: 'platform_admin',

        actorId: 'billing-record',
        convertedFromPeriodId: isTrialConversion
          ? ((billingRecord.metadata?.subscriptionPeriodId as
              | string
              | undefined) ?? null)
          : null,
        metadata: {
          source: 'billing_payment_confirmation',
          billingRecordId: billingRecord.id,
          purchaseMode: isAfterTrial ? 'after_trial' : null,
          trialPeriodId: isAfterTrial
            ? (billingRecord.metadata?.trialPeriodId ?? null)
            : null,
          quotaCarryover: isAfterTrial ? false : null,
        },
      },
      manager,
    );

    // Plan 14 Phase 4 (task 4.13): link the paid conversion period back to the
    // trial it came from so admin activation can atomically close the trial.
    if (isTrialConversion && period.convertedFromPeriodId) {
      const periodRepository = manager.getRepository(TenantSubscriptionPeriod);
      const trialPeriod = await periodRepository.findOne({
        where: {
          id: period.convertedFromPeriodId,
          tenantId: billingRecord.tenantId,
        },
      });
      if (trialPeriod && trialPeriod.convertedToPeriodId !== period.id) {
        trialPeriod.convertedToPeriodId = period.id;
        await periodRepository.save(trialPeriod);
      }
    }
  }

  /**
   * Plan 13 Phase 2: mark an upgrade revision as payment-confirmed and
   * awaiting Platform Admin approval. Idempotent; never touches the period.
   */
  private async markUpgradePaymentConfirmed(
    billingRecord: TenantBillingRecord,
    manager?: EntityManager,
  ): Promise<TenantSubscriptionPeriodUpgradeRevision> {
    const run = async (transactionManager: EntityManager) => {
      const revisionRepository = transactionManager.getRepository(
        TenantSubscriptionPeriodUpgradeRevision,
      );
      const revision = billingRecord.metadata?.upgradeRevisionId
        ? await revisionRepository.findOne({
            where: {
              id: billingRecord.metadata.upgradeRevisionId,
              tenantId: billingRecord.tenantId,
            },
          })
        : await revisionRepository.findOne({
            where: {
              billingRecordId: billingRecord.id,
              tenantId: billingRecord.tenantId,
            },
          });
      if (!revision) {
        throw new ConflictException(
          'Upgrade revision for this billing record was not found.',
        );
      }
      if (
        revision.upgradeStatus === 'approved' ||
        revision.upgradeStatus === 'stale' ||
        revision.upgradeStatus === 'pending_approval'
      ) {
        return revision;
      }
      if (
        revision.upgradeStatus === 'rejected' ||
        revision.upgradeStatus === 'cancelled'
      ) {
        throw new ConflictException(
          `Upgrade is '${revision.upgradeStatus}' and cannot be confirmed.`,
        );
      }
      revision.upgradeStatus = 'pending_approval';
      const saved = await revisionRepository.save(revision);
      const isConversion = saved.metadata?.kind === 'trial_conversion';
      await this.writeUpgradeEvent(
        transactionManager,
        saved,
        isConversion
          ? 'trial_conversion_payment_confirmed'
          : 'upgrade_payment_confirmed',
        'platform_admin',
        undefined,
        isConversion
          ? 'Trial conversion payment confirmed; awaiting Platform Admin approval'
          : 'Upgrade payment confirmed; awaiting Platform Admin approval',
        { billingRecordId: billingRecord.id },
      );
      return saved;
    };
    return manager
      ? run(manager)
      : this.tenantBillingRecordRepository.manager.transaction(run);
  }

  /**
   * Plan 13 Phase 2 (tasks 2.4–2.8): Platform Admin activates a paid period.
   * Current-month periods become operational (entitlement projected to
   * `paid_active`); future periods are approved but remain queued until the
   * Yangon boundary.
   */
  async adminActivatePeriod(
    tenantId: string,
    periodId: string,
    actorId: string | undefined,
    reason: string | undefined,
  ) {
    const { period, operational } =
      await this.subscriptionPeriodService.adminApprovePeriod(
        tenantId,
        periodId,
        {
          approvedBy: actorId ?? null,
          reason,
        },
      );

    if (operational) {
      const billingRecord = period.billingRecordId
        ? await this.tenantBillingRecordRepository.findOne({
            where: { id: period.billingRecordId, tenantId },
          })
        : null;
      const periodStart =
        period.monthStartAt ?? period.periodStartAt ?? new Date();
      const periodEnd = period.monthEndAt ?? period.periodEndAt ?? periodStart;
      await this.entitlementService.activatePaidPeriod({
        tenantId,
        planId: period.planId,
        paidPeriodStartsAt: period.periodStartAt ?? periodStart,
        paidPeriodEndsAt: period.periodEndAt ?? periodEnd,
        actor: { type: 'platform_admin', id: actorId ?? 'platform-admin' },
        paymentEvidence: {
          billingRecordId: billingRecord?.id ?? null,
          invoiceNumber: billingRecord?.invoiceNumber ?? null,
          amountPaid: billingRecord
            ? Number(billingRecord.amountPaid || 0)
            : null,
          currency: billingRecord?.currency ?? 'MMK',
          paidAt: billingRecord?.paidAt
            ? new Date(billingRecord.paidAt).toISOString()
            : null,
          periodId: period.id,
          activatedBy: actorId ?? 'platform-admin',
          source: 'admin_period_activation',
        },
        idempotencyKey: `admin-period-activation:${period.id}`,
      });
    }

    // Plan 14 Phase 4 (tasks 4.16–4.19): when the activated paid period is a
    // trial conversion, atomically compute trial carryover, approve the
    // conversion revision, and close the trial.
    if (operational && period.convertedFromPeriodId) {
      await this.finalizeTrialConversionOnActivation(
        tenantId,
        period,
        actorId,
        reason,
      );
    }
    if (operational && period.metadata?.purchaseMode === 'after_trial') {
      await this.finalizeFreshAfterTrialActivation(tenantId, period);
    }

    return {
      id: period.id,
      tenantId,
      planId: period.planId,
      billingRecordId: period.billingRecordId,
      periodType: period.periodType,
      periodStatus: period.periodStatus,
      paymentStatus: period.paymentStatus,
      adminActivationStatus: period.adminActivationStatus,
      adminActivatedAt: period.adminActivatedAt,
      adminActivatedBy: period.adminActivatedBy,
      adminActivationReason: period.adminActivationReason,
      monthStartAt: period.monthStartAt,
      monthEndAt: period.monthEndAt,
      operational,
    };
  }

  private async finalizeFreshAfterTrialActivation(
    tenantId: string,
    paidPeriod: TenantSubscriptionPeriod,
  ): Promise<void> {
    const trialPeriodId =
      typeof paidPeriod.metadata?.trialPeriodId === 'string'
        ? paidPeriod.metadata.trialPeriodId
        : null;
    if (!trialPeriodId) return;

    await this.tenantBillingRecordRepository.manager.transaction(
      async (manager) => {
        await this.subscriptionPeriodService.lockTenantPeriods(
          manager,
          tenantId,
        );
        const periodRepository = manager.getRepository(
          TenantSubscriptionPeriod,
        );
        const trialPeriod = await periodRepository.findOne({
          where: { id: trialPeriodId, tenantId },
        });
        if (
          !trialPeriod ||
          trialPeriod.periodType !== 'trial' ||
          trialPeriod.periodStatus !== 'active' ||
          !trialPeriod.periodEndAt ||
          trialPeriod.periodEndAt.getTime() > Date.now()
        ) {
          return;
        }

        trialPeriod.periodStatus = 'expired';
        trialPeriod.expiredAt = new Date();
        trialPeriod.endReason = 'scheduled_expiry';
        await periodRepository.save(trialPeriod);

        const eventRepository = manager.getRepository(SubscriptionPeriodEvent);
        const expiryKey = `trial-expiry:${trialPeriod.id}`;
        const existingEvent = await eventRepository.findOne({
          where: { idempotencyKey: expiryKey },
        });
        if (!existingEvent) {
          await eventRepository.save(
            eventRepository.create({
              subscriptionPeriodId: trialPeriod.id,
              tenantId,
              eventType: 'trial_period_expired',
              previousStatus: 'active',
              newStatus: 'expired',
              actorType: 'platform_admin',
              actorId: 'period-activation',
              source: 'after-trial-period-activation',
              reason:
                'Trial expired before its scheduled paid plan became operational',
              idempotencyKey: expiryKey,
              metadata: {
                expiredAt: new Date().toISOString(),
                paidPeriodId: paidPeriod.id,
              },
            }),
          );
        }
      },
    );
  }

  /**
   * Plan 14 Phase 4 (tasks 4.16–4.19): after a trial-conversion paid period
   * becomes operational, compute the eligible remaining trial
   * inbound/outbound/API carryover exactly once under tenant-period locks,
   * approve the conversion revision (re-pointing it from the trial to the paid
   * period so the resolver applies it), and close the trial. If the trial has
   * already expired, the revision is marked stale and the trial is left to its
   * natural expiry. Idempotent — retries never double-close or double-apply.
   */
  private async finalizeTrialConversionOnActivation(
    tenantId: string,
    paidPeriod: TenantSubscriptionPeriod,
    actorId: string | undefined,
    reason: string | undefined,
  ): Promise<void> {
    await this.tenantBillingRecordRepository.manager.transaction(
      async (manager) => {
        const periodRepository = manager.getRepository(
          TenantSubscriptionPeriod,
        );
        const revisionRepository = manager.getRepository(
          TenantSubscriptionPeriodUpgradeRevision,
        );
        await this.subscriptionPeriodService.lockTenantPeriods(
          manager,
          tenantId,
        );

        const trialPeriod = paidPeriod.convertedFromPeriodId
          ? await periodRepository.findOne({
              where: { id: paidPeriod.convertedFromPeriodId, tenantId },
            })
          : null;
        if (!trialPeriod) {
          throw new NotFoundException(
            'The trial period linked to this conversion was not found.',
          );
        }

        const revision = await revisionRepository.findOne({
          where: { subscriptionPeriodId: trialPeriod.id, tenantId },
        });
        if (!revision) {
          // No conversion revision recorded; the paid period is already
          // operational, so there is nothing left to finalize.
          return;
        }
        if (revision.upgradeStatus === 'approved') {
          return; // idempotent retry
        }

        const now = new Date();
        const trialExpired = !isTrialOperational({ period: trialPeriod, now });
        if (trialExpired) {
          if (
            revision.upgradeStatus !== 'stale' &&
            revision.upgradeStatus !== 'rejected' &&
            revision.upgradeStatus !== 'cancelled'
          ) {
            revision.upgradeStatus = 'stale';
            await revisionRepository.save(revision);
            await this.writeUpgradeEvent(
              manager,
              revision,
              'trial_conversion_stale',
              'platform_admin',
              actorId,
              'The trial ended before the conversion was approved; paid evidence requires manual billing reconciliation',
              {
                trialPeriodEndAt:
                  trialPeriod.periodEndAt?.toISOString() ?? null,
              },
            );
          }
          return;
        }

        const snapshot = trialPeriod.quotaSnapshot;
        const [inboundUsed, outboundUsed, apiUsed] = await Promise.all([
          this.sumPeriodUsage(
            manager,
            tenantId,
            trialPeriod.id,
            'provider_message',
            'inbound',
          ),
          this.sumPeriodUsage(
            manager,
            tenantId,
            trialPeriod.id,
            'provider_message',
            'outbound',
          ),
          this.sumPeriodUsage(
            manager,
            tenantId,
            trialPeriod.id,
            'api_request',
            'request',
          ),
        ]);
        const carryover = {
          inboundMessages:
            snapshot.inboundMessageLimit === null
              ? null
              : Math.max(
                  0,
                  Number(snapshot.inboundMessageLimit || 0) - inboundUsed,
                ),
          outboundMessages:
            snapshot.outboundMessageLimit === null
              ? null
              : Math.max(
                  0,
                  Number(snapshot.outboundMessageLimit || 0) - outboundUsed,
                ),
          apiRequests:
            snapshot.apiLimit === null
              ? null
              : Math.max(0, Number(snapshot.apiLimit || 0) - apiUsed),
        };

        // Re-point the conversion revision from the trial to the paid period so
        // the resolver applies the upgraded snapshot + carryover to the paid
        // period. The one-upgrade-per-period unique index now guards the paid
        // period (one conversion consumes the current-month slot).
        revision.subscriptionPeriodId = paidPeriod.id;
        revision.upgradeStatus = 'approved';
        revision.upgradeEffectiveAt = now;
        revision.approvedAt = now;
        revision.approvedBy = actorId ?? null;
        revision.rejectionReason = null;
        revision.carryover = carryover;
        const saved = await revisionRepository.save(revision);

        // Close the trial (terminal `expired` state). Exact access is governed
        // by `period_end_at`, but this makes the conversion explicit and blocks
        // any further trial path.
        if (trialPeriod.periodStatus === 'active') {
          trialPeriod.periodStatus = 'expired';
          trialPeriod.expiredAt = now;
          trialPeriod.endReason = 'scheduled_expiry';
          trialPeriod.convertedToPeriodId = paidPeriod.id;
          await periodRepository.save(trialPeriod);
        }

        await this.writeUpgradeEvent(
          manager,
          saved,
          'trial_conversion_approved',
          'platform_admin',
          actorId,
          reason?.trim() ||
            'Trial conversion approved; the paid period is now authoritative',
          {
            carryover,
            trialPeriodId: trialPeriod.id,
            paidPeriodId: paidPeriod.id,
          },
        );
        await this.writeUpgradeEvent(
          manager,
          saved,
          'upgrade_effective_applied',
          'platform_admin',
          actorId,
          'The converted business plan and eligible trial carryover are now the effective entitlement',
          { upgradedPlanId: saved.upgradedPlanId, carryover },
        );

        const eventRepository = manager.getRepository(SubscriptionPeriodEvent);
        const closeKey = `trial-period-closed-on-conversion:${trialPeriod.id}`;
        const existingClose = await eventRepository.findOne({
          where: { idempotencyKey: closeKey },
        });
        if (!existingClose) {
          await eventRepository.save(
            eventRepository.create({
              subscriptionPeriodId: trialPeriod.id,
              tenantId,
              eventType: 'trial_period_closed_on_conversion',
              previousStatus: 'active',
              newStatus: 'expired',
              actorType: 'platform_admin',
              actorId: actorId ?? 'platform-admin',
              source: 'platform-admin-trial-conversion',
              reason:
                'Trial period closed after successful conversion to a paid business plan',
              idempotencyKey: closeKey,
              metadata: {
                paidPeriodId: paidPeriod.id,
                upgradeRevisionId: saved.id,
              },
            }),
          );
        }
      },
    );
  }

  /**
   * Plan 13 Phase 2 (task 3.11 prep): approve a payment-confirmed upgrade.
   * Computes eligible remaining inbound/outbound/API quota once at approval
   * time under the transaction lock, stores it on the revision, and marks the
   * upgrade effective. Approval after period expiry is rejected and the
   * revision becomes `stale` (manual billing reconciliation when already paid).
   */
  async approveUpgradeRevision(
    tenantId: string,
    periodId: string,
    revisionId: string,
    actorId: string | undefined,
    reason: string | undefined,
  ) {
    return this.tenantBillingRecordRepository.manager.transaction(
      async (manager) => {
        const revisionRepository = manager.getRepository(
          TenantSubscriptionPeriodUpgradeRevision,
        );
        const revision = await revisionRepository.findOne({
          where: { id: revisionId, subscriptionPeriodId: periodId, tenantId },
        });
        if (!revision) {
          throw new NotFoundException('Upgrade revision not found');
        }
        if (revision.upgradeStatus === 'approved') {
          return this.toUpgradeApprovalResponse(revision);
        }
        if (revision.upgradeStatus !== 'pending_approval') {
          throw new ConflictException(
            `Upgrade is '${revision.upgradeStatus}'; only payment-confirmed upgrades awaiting approval can be approved.`,
          );
        }

        const periodRepository = manager.getRepository(
          TenantSubscriptionPeriod,
        );
        const period = await periodRepository.findOne({
          where: { id: periodId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!period) {
          throw new NotFoundException('Subscription period not found');
        }
        const now = new Date();
        const monthEnd = period.monthEndAt ?? period.periodEndAt;
        const withinWindow = monthEnd
          ? now.getTime() < monthEnd.getTime()
          : true;
        if (period.periodStatus !== 'active' || !withinWindow) {
          // Late approval after expiry: never reactivate or extend; mark stale.
          // The stale state + event MUST be persisted, so return the stale
          // revision instead of throwing (a throw would roll back this write),
          // mirroring the trial-conversion stale path.
          revision.upgradeStatus = 'stale';
          const savedStale = await revisionRepository.save(revision);
          await this.writeUpgradeEvent(
            manager,
            savedStale,
            'upgrade_stale',
            'platform_admin',
            actorId,
            'The current period ended before the upgrade was approved; paid evidence requires manual billing reconciliation',
            { periodStatus: period.periodStatus },
          );
          return this.toUpgradeApprovalResponse(savedStale);
        }

        const snapshot = period.quotaSnapshot;
        const [inboundUsed, outboundUsed, apiUsed] = await Promise.all([
          this.sumPeriodUsage(
            manager,
            tenantId,
            periodId,
            'provider_message',
            'inbound',
          ),
          this.sumPeriodUsage(
            manager,
            tenantId,
            periodId,
            'provider_message',
            'outbound',
          ),
          this.sumPeriodUsage(
            manager,
            tenantId,
            periodId,
            'api_request',
            'request',
          ),
        ]);
        const carryover = {
          inboundMessages:
            snapshot.inboundMessageLimit === null
              ? null
              : Math.max(
                  0,
                  Number(snapshot.inboundMessageLimit || 0) - inboundUsed,
                ),
          outboundMessages:
            snapshot.outboundMessageLimit === null
              ? null
              : Math.max(
                  0,
                  Number(snapshot.outboundMessageLimit || 0) - outboundUsed,
                ),
          apiRequests:
            snapshot.apiLimit === null
              ? null
              : Math.max(0, Number(snapshot.apiLimit || 0) - apiUsed),
        };

        revision.upgradeStatus = 'approved';
        revision.upgradeEffectiveAt = now;
        revision.approvedAt = now;
        revision.approvedBy = actorId ?? null;
        revision.rejectionReason = null;
        revision.carryover = carryover;
        const saved = await revisionRepository.save(revision);

        // Plan 14 Phase 4 (tasks 4.1/4.2): make the upgraded plan the period's
        // authoritative catalog identity WITHOUT mutating the original quota
        // snapshot. The resolver reads `upgraded_plan_snapshot` + `carryover`
        // from this approved revision to assemble the effective entitlement.
        period.planId = saved.upgradedPlanId;
        await periodRepository.save(period);

        await this.writeUpgradeEvent(
          manager,
          saved,
          'upgrade_approved',
          'platform_admin',
          actorId,
          reason?.trim() || 'Platform Admin approved the current-month upgrade',
          { carryover },
        );
        await this.writeUpgradeEvent(
          manager,
          saved,
          'upgrade_effective_applied',
          'platform_admin',
          actorId,
          'The upgraded plan and eligible carryover are now the effective entitlement',
          { upgradedPlanId: saved.upgradedPlanId, carryover },
        );
        return this.toUpgradeApprovalResponse(saved);
      },
    );
  }

  /** Reject a pending upgrade before it is approved. */
  async rejectUpgradeRevision(
    tenantId: string,
    periodId: string,
    revisionId: string,
    actorId: string | undefined,
    reason: string | undefined,
  ) {
    const safeReason = reason?.trim();
    if (!safeReason) {
      throw new BadRequestException(
        'A reason is required to reject an upgrade',
      );
    }
    return this.tenantBillingRecordRepository.manager.transaction(
      async (manager) => {
        const revisionRepository = manager.getRepository(
          TenantSubscriptionPeriodUpgradeRevision,
        );
        const revision = await revisionRepository.findOne({
          where: { id: revisionId, subscriptionPeriodId: periodId, tenantId },
        });
        if (!revision) {
          throw new NotFoundException('Upgrade revision not found');
        }
        if (
          revision.upgradeStatus === 'approved' ||
          revision.upgradeStatus === 'stale' ||
          revision.upgradeStatus === 'rejected'
        ) {
          throw new ConflictException(
            `Upgrade is '${revision.upgradeStatus}' and cannot be rejected.`,
          );
        }
        revision.upgradeStatus = 'rejected';
        revision.rejectionReason = safeReason;
        const saved = await revisionRepository.save(revision);
        await this.writeUpgradeEvent(
          manager,
          saved,
          'upgrade_rejected',
          'platform_admin',
          actorId,
          safeReason,
          {},
        );
        return this.toUpgradeApprovalResponse(saved);
      },
    );
  }

  /**
   * Plan 14 Phase 5 (task 5.9): list upgrade/conversion revisions for a
   * tenant with plan names/prices so the Platform billing queue can render
   * review rows (previous/target plan, status, carryover, timestamps).
   */
  async getTenantUpgradeRevisions(tenantId: string) {
    await this.getTenantById(tenantId);
    const revisions = await this.subscriptionPeriodRepository.manager
      .getRepository(TenantSubscriptionPeriodUpgradeRevision)
      .find({ where: { tenantId }, order: { createdAt: 'DESC' } });
    const planIds = Array.from(
      new Set(
        revisions.flatMap((revision) => [
          revision.previousPlanId,
          revision.upgradedPlanId,
        ]),
      ),
    );
    const plans = planIds.length
      ? await this.subscriptionPlanRepository.find({
          where: { id: In(planIds) },
        })
      : [];
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    return revisions.map((revision) => {
      const previousPlan = planById.get(revision.previousPlanId);
      const upgradedPlan = planById.get(revision.upgradedPlanId);
      return {
        ...this.toUpgradeApprovalResponse(revision),
        kind:
          revision.metadata?.kind === 'trial_conversion'
            ? ('trial_conversion' as const)
            : ('upgrade' as const),
        previousPlanName: previousPlan?.name ?? null,
        upgradedPlanName: upgradedPlan?.name ?? null,
        previousPlanPrice: previousPlan
          ? Number(previousPlan.monthlyPrice || 0)
          : null,
        upgradedPlanPrice: upgradedPlan
          ? Number(upgradedPlan.monthlyPrice || 0)
          : null,
      };
    });
  }

  private async sumPeriodUsage(
    manager: EntityManager,
    tenantId: string,
    periodId: string,
    usageType: 'api_request' | 'provider_message',
    direction: 'inbound' | 'outbound' | 'request',
  ): Promise<number> {
    const row = await manager
      .getRepository(TenantUsageEvent)
      .createQueryBuilder('usage')
      .select('COALESCE(SUM(usage.quantity), 0)', 'total')
      .where('usage.tenant_id = :tenantId', { tenantId })
      .andWhere('usage.subscription_period_id = :periodId', { periodId })
      .andWhere('usage.usage_type = :usageType', { usageType })
      .andWhere('usage.direction = :direction', { direction })
      .andWhere("COALESCE(usage.metadata ->> 'billable', 'true') <> 'false'")
      .getRawOne<{ total: string }>();
    return Number(row?.total || 0);
  }

  private async writeUpgradeEvent(
    manager: EntityManager,
    revision: TenantSubscriptionPeriodUpgradeRevision,
    eventType: SubscriptionPeriodEventType,
    actorType: string,
    actorId: string | null | undefined,
    reason: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const eventRepository = manager.getRepository(SubscriptionPeriodEvent);
    const idempotencyKey = `${eventType}:upgrade:${revision.id}`;
    const existing = await eventRepository.findOne({
      where: { idempotencyKey },
    });
    if (existing) return;
    await eventRepository.save(
      eventRepository.create({
        subscriptionPeriodId: revision.subscriptionPeriodId,
        tenantId: revision.tenantId,
        eventType,
        previousStatus: null,
        newStatus: null,
        actorType: actorType.slice(0, 40),
        actorId: actorId ?? 'system',
        source: 'platform-admin-upgrade',
        reason: reason.slice(0, 240),
        idempotencyKey,
        metadata: {
          upgradeRevisionId: revision.id,
          upgradeStatus: revision.upgradeStatus,
          ...metadata,
        },
      }),
    );
  }

  private toUpgradeApprovalResponse(
    revision: TenantSubscriptionPeriodUpgradeRevision,
  ) {
    return {
      id: revision.id,
      subscriptionPeriodId: revision.subscriptionPeriodId,
      tenantId: revision.tenantId,
      billingRecordId: revision.billingRecordId,
      previousPlanId: revision.previousPlanId,
      upgradedPlanId: revision.upgradedPlanId,
      upgradeStatus: revision.upgradeStatus,
      upgradeRequestedAt: revision.upgradeRequestedAt,
      upgradeEffectiveAt: revision.upgradeEffectiveAt,
      approvedAt: revision.approvedAt,
      approvedBy: revision.approvedBy,
      rejectionReason: revision.rejectionReason,
      carryover: revision.carryover,
      previousPlanSnapshot: revision.previousPlanSnapshot,
      upgradedPlanSnapshot: revision.upgradedPlanSnapshot,
      metadata: revision.metadata,
    };
  }

  private assignIfPresent<T extends keyof Tenant>(
    tenant: Tenant,
    field: T,
    value: Tenant[T] | null | undefined,
  ) {
    if (value !== undefined) {
      (tenant as any)[field] = value;
    }
  }

  async listTenantUsers(tenantId: string) {
    const users = await this.tenantUserRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    return users.map(({ passwordHash: _, normalizedEmail: __, ...user }) => ({
      ...user,
    }));
  }

  async inviteTenantUser(
    tenantId: string,
    dto: { fullName: string; email: string; role?: string },
  ) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.tenantUserRepository.findOne({
      where: { normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const parts = dto.fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] || dto.fullName;
    const lastName = parts.slice(1).join(' ') || parts[0] || dto.fullName;
    const placeholderHash = await bcrypt.hash(
      `invite:${tenantId}:${normalizedEmail}:${Date.now()}`,
      12,
    );

    const user = this.tenantUserRepository.create({
      tenantId,
      fullName: dto.fullName.trim(),
      firstName,
      lastName,
      email: dto.email.trim(),
      normalizedEmail,
      passwordHash: placeholderHash,
      role: dto.role || 'csr',
      status: 'inactive',
      notificationPreferences: { email: true, inApp: true },
    });

    const savedUser = await this.tenantUserRepository.save(user);
    const invite = await this.authService.issueTenantUserInvite(
      savedUser.id,
      normalizedEmail,
      { role: savedUser.role, tenantId, invitedBy: 'platform-admin' },
    );

    return {
      user: { ...savedUser, type: 'tenant_user' as const },
      invitation: {
        message: invite.message,
        invitationDelivery: invite.invitationDelivery,
        expiresAt: invite.expiresAt,
      },
    };
  }

  async resendTenantUserInvite(tenantId: string, userId: string) {
    const user = await this.tenantUserRepository.findOne({
      where: { id: userId, tenantId },
    });
    if (!user) {
      throw new NotFoundException('Tenant user not found');
    }
    if (user.status !== 'inactive') {
      throw new ConflictException('Only inactive users can be re-invited');
    }

    const invite = await this.authService.issueTenantUserInvite(
      user.id,
      user.normalizedEmail,
      { role: user.role, tenantId, invitedBy: 'platform-admin' },
    );

    return {
      message: 'Invitation re-sent',
      invitationDelivery: invite.invitationDelivery,
      expiresAt: invite.expiresAt,
    };
  }
}
