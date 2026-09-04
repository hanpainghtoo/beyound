/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- Legacy tenant service contains dynamic DTO/entity metadata paths; this task only changes channel webhook routing. */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  MoreThanOrEqual,
  Not,
  type EntityManager,
  type Repository,
} from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  serviceAuthHeaders,
} from '@zayos/internal-service-auth';

import { TenantUser } from '../auth/entities/tenant-user.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { CannedResponse } from '../common/entities/canned-response.entity';
import { Product } from '../product/entities/product.entity';
import { ProductCategory } from '../product/entities/product-category.entity';
import { TenantAnalytics } from '../analytics/entities/tenant-analytics.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Tenant } from './entities/tenant.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { Lead } from '../lead/entities/lead.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { ChannelAdapterService } from '../channel-adapter/channel-adapter.service';
import { AuditLogService } from '../logging/audit-log.service';
import { AuthService } from '../auth/auth.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { SubscriptionEntitlementService } from '../subscription-period/subscription-entitlement.service';
import { MediaLibraryService } from '../media/media-library.service';
import { isPeriodScopedEnforcementEnabled } from '../subscription-period/subscription-entitlement-flag.util';
import {
  MissingActivePeriodError,
  type ResolvedSubscriptionEntitlement,
} from '../subscription-period/subscription-entitlement.types';
import {
  expiredTopUpChannels,
  isUsageCountedChannel,
  resolveChannelCapacity,
  selectChannelsForRetention,
} from '../channel/channel-capacity.util';
import {
  decryptProviderCredentials,
  encryptProviderCredentials,
  getProviderCredentialSchema,
  redactProviderCredentials,
  validateProviderCredentials,
} from '../channel/provider-credentials.util';
import type { ProviderCredentialSchemaField } from '../channel/provider-credentials.util';

import type { CreateCsrDto } from './dto/create-csr.dto';
import type { CreateCsrInviteDto } from './dto/create-csr-invite.dto';
import type { UpdateCsrDto } from './dto/update-csr.dto';
import type { CreateTenantChannelDto } from './dto/create-channel.dto';
import type { CreateCannedResponseDto } from './dto/create-canned-response.dto';
import type { TenantDashboardStatsDto } from './dto/tenant-dashboard-stats.dto';
import type { PaginationDto } from '../common/dto/pagination.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import type { SubmitPaymentProofDto } from './dto/submit-payment-proof.dto';
import type {
  CreateSubscriptionPurchaseRequestDto,
  SubscriptionPurchaseStartOption,
} from './dto/create-subscription-purchase-request.dto';
import type { RequestPlanChangeDto } from './dto/request-plan-change.dto';
import { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';
import { TenantSubscriptionPeriodUpgradeRevision } from '../subscription-period/entities/tenant-subscription-period-upgrade-revision.entity';
import { SubscriptionPeriodEvent } from '../subscription-period/entities/subscription-period-event.entity';
import { buildQuotaSnapshot } from '../subscription-period/subscription-period.types';
import { isTrialOperational } from '../subscription-period/subscription-period.service';
import { baseLimitForDimension } from '../subscription-period/subscription-entitlement.service';
import type { EntitlementDimensionKey } from '../subscription-period/subscription-entitlement.types';
import {
  yangonCalendarDate,
  yangonMonthEnd,
  yangonMonthStart,
  yangonNextMonthStart,
  yangonWallClockToUtc,
} from '../subscription-period/yangon-month.util';
import type { TenantPlanChangeRequestDto } from './dto/tenant-plan-change-request.dto';
import {
  toPaginatedTenantUserResponse,
  toTenantUserResponse,
  type TenantUserInvitationResponseDto,
  type TenantUserResponseDto,
} from './dto/tenant-user-response.dto';
import { tenantRoleValues } from '../common/constants/tenant-roles';
import { assertStrongPassword } from '../auth/password-policy';
import { resolvePublicBaseUrl } from '../config/public-base-url';
import {
  buildProviderWebhookUrl,
  normalizeWebhookChannelId,
  normalizeWebhookProvider,
  UUID_PATTERN,
} from '../channel/provider-webhook-url.util';
import {
  mapTenantUserIdentityConflict,
  normalizeIdentityEmail,
  TENANT_USER_EMAIL_CONFLICT_MESSAGE,
} from '../auth/identity-email.util';

const csrSortColumns: Record<string, string> = {
  createdAt: 'user.createdAt',
  updatedAt: 'user.updatedAt',
  fullName: 'user.fullName',
  email: 'user.email',
  role: 'user.role',
  status: 'user.status',
  lastSeenAt: 'user.lastSeenAt',
};

const cannedResponseSortColumns: Record<string, string> = {
  createdAt: 'response.createdAt',
  updatedAt: 'response.updatedAt',
  title: 'response.title',
  shortcut: 'response.shortcut',
  visibility: 'response.visibility',
  usageCount: 'response.usageCount',
};

const productSortColumns: Record<string, string> = {
  createdAt: 'product.createdAt',
  updatedAt: 'product.updatedAt',
  name: 'product.name',
  sku: 'product.sku',
  type: 'product.type',
  status: 'product.status',
  price: 'product.price',
  stockQuantity: 'product.stockQuantity',
};

type TelegramLifecycle = {
  rawCredentials: Record<string, any>;
  providerAccountId: string | null;
  verifiedIdentity?: Record<string, any>;
  credentialsVerifiedAt?: Date | null;
  connectionStatus?: string;
  status?: string;
  errorMessage?: string | null;
  configuration: Record<string, any>;
};

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

function buildSubscriptionInvoiceNumber(
  now: Date,
  billingRecordId: string,
): string {
  const datePart = yangonCalendarDate(now)
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '');
  const idPart = billingRecordId.replaceAll('-', '').toUpperCase();
  return `INV-${datePart}-${idPart}`;
}

function mapPlanRequestStatus(
  lead: Lead,
): TenantPlanChangeRequestDto['status'] {
  if (lead.status === 'converted') return 'approved';
  if (lead.metadata?.reviewOutcome === 'approved') return 'approved';
  if (lead.status === 'closed') {
    const outcome =
      typeof lead.metadata?.outcome === 'string' ? lead.metadata.outcome : null;
    return outcome === 'cancelled' ? 'cancelled' : 'rejected';
  }
  return 'pending';
}

@Injectable()
export class TenantService {
  private tenantUserRepository: Repository<TenantUser>;
  private tenantChannelRepository: Repository<TenantChannel>;
  private cannedResponseRepository: Repository<CannedResponse>;
  private productRepository: Repository<Product>;
  private productCategoryRepository: Repository<ProductCategory>;
  private tenantAnalyticsRepository: Repository<TenantAnalytics>;
  private conversationRepository: Repository<Conversation>;
  private tenantRepository: Repository<Tenant>;
  private subscriptionPlanRepository: Repository<SubscriptionPlan>;
  private tenantBillingRecordRepository: Repository<TenantBillingRecord>;
  private leadRepository: Repository<Lead>;
  private tenantUsageRepository: Repository<TenantUsageEvent>;
  private subscriptionPeriodRepository: Repository<TenantSubscriptionPeriod>;
  private subscriptionPeriodUpgradeRevisionRepository: Repository<TenantSubscriptionPeriodUpgradeRevision>;

  @Inject(SubscriptionEntitlementService)
  @Optional()
  private subscriptionEntitlementService?: SubscriptionEntitlementService;

  constructor(
    @InjectRepository(TenantUser)
    tenantUserRepository: Repository<TenantUser>,
    @InjectRepository(TenantChannel)
    tenantChannelRepository: Repository<TenantChannel>,
    @InjectRepository(CannedResponse)
    cannedResponseRepository: Repository<CannedResponse>,
    @InjectRepository(Product)
    productRepository: Repository<Product>,
    @InjectRepository(ProductCategory)
    productCategoryRepository: Repository<ProductCategory>,
    @InjectRepository(TenantAnalytics)
    tenantAnalyticsRepository: Repository<TenantAnalytics>,
    @InjectRepository(Conversation)
    conversationRepository: Repository<Conversation>,
    @InjectRepository(Tenant)
    tenantRepository: Repository<Tenant>,
    @InjectRepository(SubscriptionPlan)
    subscriptionPlanRepository: Repository<SubscriptionPlan>,
    @InjectRepository(TenantBillingRecord)
    tenantBillingRecordRepository: Repository<TenantBillingRecord>,
    @InjectRepository(Lead)
    leadRepository: Repository<Lead>,
    @InjectRepository(TenantUsageEvent)
    tenantUsageRepository: Repository<TenantUsageEvent>,
    @InjectRepository(TenantSubscriptionPeriod)
    subscriptionPeriodRepository: Repository<TenantSubscriptionPeriod>,
    @InjectRepository(TenantSubscriptionPeriodUpgradeRevision)
    subscriptionPeriodUpgradeRevisionRepository: Repository<TenantSubscriptionPeriodUpgradeRevision>,
    private channelAdapterService: ChannelAdapterService,
    private auditLogService: AuditLogService,
    private authService: AuthService,
    @Optional() private entitlementService?: EntitlementService,
    @Optional() private mediaLibraryService?: MediaLibraryService,
  ) {
    this.tenantUserRepository = tenantUserRepository;
    this.tenantChannelRepository = tenantChannelRepository;
    this.cannedResponseRepository = cannedResponseRepository;
    this.productRepository = productRepository;
    this.productCategoryRepository = productCategoryRepository;
    this.tenantAnalyticsRepository = tenantAnalyticsRepository;
    this.conversationRepository = conversationRepository;
    this.tenantRepository = tenantRepository;
    this.subscriptionPlanRepository = subscriptionPlanRepository;
    this.tenantBillingRecordRepository = tenantBillingRecordRepository;
    this.leadRepository = leadRepository;
    this.tenantUsageRepository = tenantUsageRepository;
    this.subscriptionPeriodRepository = subscriptionPeriodRepository;
    this.subscriptionPeriodUpgradeRevisionRepository =
      subscriptionPeriodUpgradeRevisionRepository;
  }

  async getDashboardStats(tenantId: string): Promise<TenantDashboardStatsDto> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      todaysConversations,
      activeCsrs,
      pendingTickets,
      channels,
      todaysAnalytics,
      totalMessages,
      resolvedConversations,
    ] = await Promise.all([
      this.conversationRepository.count({
        where: { tenantId, createdAt: MoreThanOrEqual(today) },
      }),
      this.tenantUserRepository.count({
        where: { tenantId, status: 'active', isOnline: true },
      }),
      this.conversationRepository.count({
        where: { tenantId, status: 'pending' },
      }),
      this.tenantChannelRepository.find({
        where: { tenantId },
        select: ['channelType', 'status'],
      }),
      this.tenantAnalyticsRepository.findOne({
        where: { tenantId, date: today },
      }),
      this.conversationRepository
        .createQueryBuilder('conversation')
        .leftJoin(
          'messages',
          'message',
          'message.conversation_id = conversation.id',
        )
        .where('conversation.tenant_id = :tenantId', { tenantId })
        .andWhere('conversation.created_at >= :today', { today })
        .getCount(),
      this.conversationRepository.count({
        where: { tenantId, status: 'resolved' },
      }),
    ]);

    const channelStatus = channels.reduce(
      (acc, channel) => {
        acc[channel.channelType] = channel.status;
        return acc;
      },
      {} as Record<string, string>,
    );

    return {
      todaysConversations,
      activeCsrs,
      pendingTickets,
      channelStatus,
      avgResponseTime: todaysAnalytics?.avgResponseTimeSeconds || 0,
      totalMessages,
      resolvedConversations,
      customerSatisfactionAvg: todaysAnalytics?.customerSatisfactionAvg || 0,
    };
  }

  async getTenantSettings(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async updateTenantSettings(
    tenantId: string,
    updateData: Partial<Tenant>,
  ): Promise<Tenant> {
    const tenant = await this.getTenantSettings(tenantId);
    const allowedFields: Array<keyof Tenant> = [
      'companyName',
      'industry',
      'businessType',
      'contactPerson',
      'contactEmail',
      'contactPhone',
      'website',
      'address',
      'logoUrl',
      'description',
      'timezone',
      'language',
      'featureFlags',
      'aiSettings',
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        (tenant as any)[field] = updateData[field];
      }
    }

    return this.tenantRepository.save(tenant);
  }

  async updateOnboardingState(
    tenantId: string,
    userId: string,
    state: { dismissedAt?: string | null; completedAt?: string | null },
  ): Promise<Tenant> {
    const tenant = await this.getTenantSettings(tenantId);
    const currentFlags = tenant.featureFlags || {};
    tenant.featureFlags = {
      ...currentFlags,
      onboardingSetupGuide: {
        ...((currentFlags.onboardingSetupGuide as
          | Record<string, any>
          | undefined) || {}),
        ...state,
        dismissedBy: state.dismissedAt ? userId : undefined,
        updatedAt: new Date().toISOString(),
      },
    };
    return this.tenantRepository.save(tenant);
  }

  async getTenantBilling(tenantId: string) {
    const tenant = await this.getTenantSettings(tenantId);
    const { periodStart, periodEnd } = this.currentMonthlyPeriod();

    // The purchased-period ledger is authoritative for the current plan:
    // resolve the active paid period first, and keep the legacy tenant-level
    // plan as a fallback for trial/legacy tenants that have no period rows.
    let periodEntitlement: ResolvedSubscriptionEntitlement | null = null;
    if (this.subscriptionEntitlementService) {
      try {
        periodEntitlement =
          await this.subscriptionEntitlementService.resolveActiveSubscriptionEntitlement(
            tenantId,
          );
      } catch (error) {
        if (error instanceof MissingActivePeriodError) {
          periodEntitlement = null;
        } else {
          throw error;
        }
      }
    }
    // Plan 14 Phase 3: only a PAID period drives the `currentPeriod` concept.
    // A resolved trial is surfaced separately via the `trial` field below, so
    // it never appears as both the current paid period and the trial.
    if (periodEntitlement?.periodType !== 'paid') {
      periodEntitlement = null;
    }
    let currentPeriodPlanId = periodEntitlement?.planId ?? null;

    // Plan 13 Phase 5/6: when payment is confirmed but the period is still
    // awaiting Platform Admin activation, the resolver reports no operational
    // period. The billing overview must still surface the confirmed plan with
    // its unactivated state instead of falling back to the legacy
    // tenant-level assignment. Resolve the active paid period's plan here.
    let pendingPeriodAdminStatus: string | null = null;
    let pendingPeriodId: string | null = null;
    if (!currentPeriodPlanId && this.subscriptionPeriodRepository) {
      const paidActivePeriods = await this.subscriptionPeriodRepository.find({
        where: {
          tenantId,
          periodType: 'paid',
          periodStatus: 'active',
          paymentStatus: 'paid',
        },
        order: { sequenceNumber: 'ASC' },
      });
      const awaiting = paidActivePeriods.find(
        (period) => period.adminActivationStatus !== 'approved',
      );
      if (awaiting) {
        pendingPeriodId = awaiting.id;
        pendingPeriodAdminStatus = awaiting.adminActivationStatus;
        currentPeriodPlanId = awaiting.planId;
      }
    }

    const [
      plan,
      records,
      teamMembers,
      connectedChannels,
      monthlyMessages,
      latestUsageEventAt,
      entitlement,
    ] = await Promise.all([
      currentPeriodPlanId || tenant.subscriptionPlanId
        ? this.subscriptionPlanRepository.findOne({
            where: { id: currentPeriodPlanId || tenant.subscriptionPlanId },
          })
        : Promise.resolve(null),
      this.tenantBillingRecordRepository.find({
        where: { tenantId },
        relations: ['subscriptionPlan'],
        order: { createdAt: 'DESC' },
      }),
      this.tenantUserRepository.count({
        where: { tenantId, status: 'active' },
      }),
      this.countOperationalChannels(tenantId),
      this.sumTenantUsage(tenantId, 'provider_message', periodStart, periodEnd),
      this.getLatestUsageEventAt(tenantId, periodStart, periodEnd),
      this.entitlementService
        ? this.entitlementService
            .getTenantEntitlement(tenantId)
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    const refreshedAt = new Date().toISOString();

    // Team-member capacity now comes from the active period's frozen snapshot
    // when available (fallback to the legacy custom/plan limits otherwise).
    // `null` from the period means unlimited and must NOT fall through to the
    // legacy custom/plan fields — only `undefined` (missing legacy snapshot
    // field) falls back.
    const periodTeamMemberLimit =
      periodEntitlement?.effectiveLimits.team_members;
    const teamMemberLimit =
      periodTeamMemberLimit !== undefined
        ? periodTeamMemberLimit
        : (tenant.customCsrLimit ?? plan?.maxCsrs ?? null);
    const usageMetrics = {
      monthlyMessages: this.buildUsageMetric(
        'providerMessages',
        'Provider messages',
        monthlyMessages,
        tenant.customMessageLimit ?? plan?.messageLimit ?? null,
        refreshedAt,
        latestUsageEventAt,
      ),
      teamMembers: this.buildUsageMetric(
        'csrs',
        'Active team members',
        teamMembers,
        teamMemberLimit,
        refreshedAt,
        null,
      ),
      connectedChannels: this.buildUsageMetric(
        'channels',
        'Active connected channels',
        connectedChannels,
        tenant.customChannelLimit ?? plan?.maxChannels ?? null,
        refreshedAt,
        null,
      ),
    };

    // Plan 14 Phase 2 (task 2.12): surface trial and upgrade/conversion
    // status so the Workspace renders state without parsing invoice metadata.
    // The trial period is the authoritative trial state; the active
    // upgrade/conversion revision reports any in-flight request.
    const activeTrialPeriod = await this.subscriptionPeriodRepository.findOne({
      where: { tenantId, periodType: 'trial', periodStatus: 'active' },
      order: { sequenceNumber: 'ASC' },
    });
    // Plan 14 Phase 6 (task 6.5): surface the latest trial period (active OR
    // expired) so the Workspace can render an accurate "Trial expired" state
    // instead of silently collapsing into "No plan".
    const latestTrialPeriod = await this.subscriptionPeriodRepository.findOne({
      where: { tenantId, periodType: 'trial' },
      order: { sequenceNumber: 'DESC' },
    });
    const revisionTargetPeriodId =
      periodEntitlement?.activePeriodId ??
      pendingPeriodId ??
      activeTrialPeriod?.id ??
      null;
    const activeUpgradeRevision = revisionTargetPeriodId
      ? await this.subscriptionPeriodUpgradeRevisionRepository.findOne({
          where: {
            tenantId,
            subscriptionPeriodId: revisionTargetPeriodId,
            upgradeStatus: Not('cancelled'),
          },
          relations: ['previousPlan', 'upgradedPlan'],
          order: { createdAt: 'DESC' },
        })
      : null;
    const toUpgradeOverview = (
      revision: TenantSubscriptionPeriodUpgradeRevision | null,
    ) =>
      revision
        ? {
            kind:
              revision.metadata?.kind === 'trial_conversion'
                ? ('trial_conversion' as const)
                : ('upgrade' as const),
            upgradeRevisionId: revision.id,
            upgradeStatus: revision.upgradeStatus,
            previousPlanId: revision.previousPlanId,
            previousPlanName: revision.previousPlan?.name ?? null,
            targetPlanId: revision.upgradedPlanId,
            targetPlanName: revision.upgradedPlan?.name ?? null,
            billingRecordId: revision.billingRecordId,
            requestedAt: revision.upgradeRequestedAt?.toISOString() ?? null,
            upgradeEffectiveAt:
              revision.upgradeEffectiveAt?.toISOString() ?? null,
            approvedAt: revision.approvedAt?.toISOString() ?? null,
            rejectionReason: revision.rejectionReason ?? null,
            carryover: revision.carryover ?? {},
          }
        : null;
    const upgrade = toUpgradeOverview(activeUpgradeRevision);
    // Plan 14 Phase 6 (task 6.13): full revision history so the Workspace can
    // render the previous plan/revision and closed-trial entry after a
    // conversion or upgrade is activated.
    const upgradeHistory = (
      await this.subscriptionPeriodUpgradeRevisionRepository.find({
        where: { tenantId },
        relations: ['previousPlan', 'upgradedPlan'],
        order: { createdAt: 'DESC' },
      })
    ).map(toUpgradeOverview);

    return {
      tenant: {
        companyName: tenant.companyName,
        status: tenant.status,
        subscriptionStartDate: tenant.subscriptionStartDate,
        subscriptionEndDate: tenant.subscriptionEndDate,
        renewalDate: tenant.subscriptionEndDate,
        storageCapacityState: tenant.storageCapacityState || {},
      },
      trial: latestTrialPeriod
        ? {
            id: latestTrialPeriod.id,
            planId: latestTrialPeriod.planId,
            periodStatus: latestTrialPeriod.periodStatus,
            paymentStatus: latestTrialPeriod.paymentStatus,
            adminActivationStatus: latestTrialPeriod.adminActivationStatus,
            periodStartAt:
              latestTrialPeriod.periodStartAt?.toISOString() ?? null,
            periodEndAt: latestTrialPeriod.periodEndAt?.toISOString() ?? null,
          }
        : null,
      upgrade,
      upgradeHistory,
      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
            monthlyPrice: plan.monthlyPrice,
            currency: 'MMK',
            maxCsrs: teamMemberLimit,
            maxChannels: tenant.customChannelLimit ?? plan.maxChannels,
            messageLimit: tenant.customMessageLimit ?? plan.messageLimit,
            apiLimit: tenant.customApiLimit ?? plan.apiLimit,
            storageLimitGb: plan.storageLimitGb,
          }
        : null,
      currentPeriod: periodEntitlement
        ? {
            id: periodEntitlement.activePeriodId,
            planId: periodEntitlement.planId,
            periodStatus: periodEntitlement.periodStatus,
            paymentStatus: periodEntitlement.paymentStatus,
            adminActivationStatus: 'approved',
            adminActivatedAt: null,
            monthStartAt:
              periodEntitlement.periodStartAt?.toISOString() ?? null,
            monthEndAt: periodEntitlement.periodEndAt?.toISOString() ?? null,
          }
        : pendingPeriodId && pendingPeriodAdminStatus
          ? {
              id: pendingPeriodId,
              planId: currentPeriodPlanId ?? '',
              periodStatus: 'active',
              paymentStatus: 'paid',
              adminActivationStatus: pendingPeriodAdminStatus,
              adminActivatedAt: null,
              monthStartAt: null,
              monthEndAt: null,
            }
          : null,
      entitlement: entitlement
        ? {
            state: entitlement.state,
            trialStartsAt: entitlement.trialStartsAt,
            trialEndsAt: entitlement.trialEndsAt,
            graceEndsAt: entitlement.graceEndsAt,
            paidPeriodStartsAt: entitlement.paidPeriodStartsAt,
            paidPeriodEndsAt: entitlement.paidPeriodEndsAt,
            suspendedAt: entitlement.suspendedAt,
            suspensionReason: entitlement.suspensionReason,
            cancelledAt: entitlement.cancelledAt,
            cancellationReason: entitlement.cancellationReason,
          }
        : null,
      usage: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        refreshedAt,
        latestUsageEventAt,
        source: 'tenant_usage_events',
        monthlyMessages,
        teamMembers,
        connectedChannels,
        metrics: usageMetrics,
      },
      records,
    };
  }

  async createSubscriptionPurchaseRequest(
    tenantId: string,
    input: CreateSubscriptionPurchaseRequestDto,
  ) {
    const repositoryManager = this.tenantBillingRecordRepository.manager;
    if (!repositoryManager?.transaction) {
      throw new ConflictException(
        'Subscription purchase requests require a transaction-capable repository.',
      );
    }

    return repositoryManager.transaction(async (manager) => {
      const idempotencyKey = input.idempotencyKey.trim();
      if (!idempotencyKey) {
        throw new BadRequestException('idempotencyKey is required');
      }
      const lockedTenant = await manager
        .getRepository(Tenant)
        .createQueryBuilder('tenant')
        .setLock('pessimistic_write')
        .where('tenant.id = :tenantId', { tenantId })
        .getOne();
      if (!lockedTenant) throw new NotFoundException('Tenant not found');

      // Resolve the selected plan: explicit planId takes priority, otherwise
      // fall back to the tenant assigned plan for backward compatibility.
      const resolvedPlanId =
        input.subscriptionPlanId || lockedTenant.subscriptionPlanId;
      if (!resolvedPlanId) {
        throw new BadRequestException(
          'A subscription plan must be assigned or selected before purchasing a period.',
        );
      }
      const plan = await manager.getRepository(SubscriptionPlan).findOne({
        where: { id: resolvedPlanId, status: 'active' },
      });
      if (!plan) {
        throw new NotFoundException(
          input.subscriptionPlanId
            ? 'Selected subscription plan was not found or is not active.'
            : 'Assigned subscription plan was not found',
        );
      }

      const periodRepository = manager.getRepository(TenantSubscriptionPeriod);
      const periods = await periodRepository
        .createQueryBuilder('period')
        .setLock('pessimistic_write')
        .where('period.tenant_id = :tenantId', { tenantId })
        .orderBy('period.sequence_number', 'ASC')
        .getMany();
      const now = new Date();
      const currentStart = yangonMonthStart(now);
      const currentEnd = yangonMonthEnd(now);

      // Paid non-cancelled periods that overlap the current month or later
      const occupiedPeriods = periods.filter(
        (period) =>
          period.periodType === 'paid' &&
          period.periodStatus !== 'cancelled' &&
          (period.monthEndAt || period.periodEndAt || currentEnd).getTime() >
            currentStart.getTime(),
      );

      // ─── Plan 13 Phase 2 (task 2.11): server-side upgrade classification ───
      // The server derives "upgrade" from locked state: an active paid current
      // period plus a higher-priced business plan requested for the current
      // month. The client can never force an upgrade; a lower/equal plan or a
      // next-month request for an occupied month falls through to the normal
      // plan-change/occupancy rules below.
      const activePaidCurrentPeriod = occupiedPeriods.find(
        (period) =>
          period.periodStatus === 'active' &&
          (period.monthStartAt || period.periodStartAt)?.getTime() ===
            currentStart.getTime(),
      );
      if (input.startOption === 'current_month' && activePaidCurrentPeriod) {
        const currentPlan = await manager
          .getRepository(SubscriptionPlan)
          .findOne({ where: { id: activePaidCurrentPeriod.planId } });
        if (
          currentPlan &&
          plan.planType === 'business' &&
          Number(plan.monthlyPrice) > Number(currentPlan.monthlyPrice)
        ) {
          return this.createCurrentMonthUpgrade(manager, {
            tenantId,
            currentPeriod: activePaidCurrentPeriod,
            currentPlan,
            targetPlan: plan,
            idempotencyKey,
            now,
            currentStart,
            currentEnd,
          });
        }
      }

      // ─── Plan 14 Phase 2 (task 2.10): trial conversion classification ───
      // An unexpired operational trial + a business target requested for the
      // current month converts the trial into a paid-period request. The
      // conversion reuses the upgrade revision model with the trial period as
      // the previous snapshot source. It does NOT compare price or protected
      // dimensions (trial conversion may target any active business plan).
      // The one-conversion-per-trial rule is enforced by the same partial
      // unique index on the revision's subscription_period_id.
      const billingRepository = manager.getRepository(TenantBillingRecord);
      const billingRecords = await billingRepository
        .createQueryBuilder('billing')
        .setLock('pessimistic_write')
        .where('billing.tenant_id = :tenantId', { tenantId })
        .andWhere("billing.invoice_status <> 'void'")
        .getMany();
      const activeTrialPeriod = periods.find(
        (period) =>
          period.periodType === 'trial' &&
          period.periodStatus === 'active' &&
          isTrialOperational({ period, now }),
      );
      const trialConversionRevision = activeTrialPeriod
        ? await manager
            .getRepository(TenantSubscriptionPeriodUpgradeRevision)
            .findOne({
              where: {
                tenantId,
                subscriptionPeriodId: activeTrialPeriod.id,
              },
            })
        : null;
      const hasOpenTrialConversion = Boolean(
        trialConversionRevision &&
        trialConversionRevision.upgradeStatus !== 'cancelled' &&
        trialConversionRevision.metadata?.idempotencyKey !== idempotencyKey,
      );
      const hasOpenAfterTrialRequest = billingRecords.some(
        (record) =>
          record.metadata?.purchaseMode === 'after_trial' &&
          record.metadata?.idempotencyKey !== idempotencyKey &&
          record.invoiceStatus !== 'void',
      );
      if (
        input.startOption === 'current_month' &&
        !activePaidCurrentPeriod &&
        activeTrialPeriod &&
        plan.planType === 'business' &&
        hasOpenAfterTrialRequest
      ) {
        throw new ConflictException(
          'A trial plan request already exists; cancel or resolve it before choosing another trial purchase path.',
        );
      }
      if (
        input.startOption === 'current_month' &&
        !activePaidCurrentPeriod &&
        activeTrialPeriod &&
        plan.planType === 'business'
      ) {
        const trialPlan = await manager
          .getRepository(SubscriptionPlan)
          .findOne({ where: { id: activeTrialPeriod.planId } });
        if (trialPlan) {
          return this.createTrialConversion(manager, {
            tenantId,
            trialPeriod: activeTrialPeriod,
            trialPlan,
            targetPlan: plan,
            idempotencyKey,
            now,
            currentStart,
            currentEnd,
          });
        }
      }

      // A fresh paid request from an active trial is intentionally different
      // from conversion: it preserves the trial row, carries no trial quota,
      // and schedules the paid period to begin at the exact trial expiry.
      if (input.startOption === 'after_trial') {
        if (activePaidCurrentPeriod) {
          throw new ConflictException(
            'A paid current-month period already exists; an after-trial purchase is not available.',
          );
        }
        if (hasOpenTrialConversion || hasOpenAfterTrialRequest) {
          throw new ConflictException(
            'A trial plan request already exists; cancel or resolve it before choosing another trial purchase path.',
          );
        }
        if (!activeTrialPeriod || plan.planType !== 'business') {
          throw new ConflictException(
            'Scheduling a fresh paid plan after trial requires an active trial and a business plan.',
          );
        }
        return this.createFreshAfterTrialPurchase(manager, {
          tenantId,
          trialPeriod: activeTrialPeriod,
          targetPlan: plan,
          idempotencyKey,
          now,
        });
      }

      const subscriptionBillingRecords = billingRecords.filter(
        (record) =>
          ['subscription_period', 'trial_conversion', 'upgrade'].includes(
            String(record.metadata?.purchaseRequestType || ''),
          ) || Boolean(record.subscriptionPlanId),
      );

      // Separate current-month vs future billing reservations
      const currentMonthBillingRecords = subscriptionBillingRecords.filter(
        (record) => {
          const recordStart = yangonCalendarDate(
            new Date(record.billingPeriodStart),
          );
          return (
            recordStart.getTime() >= currentStart.getTime() &&
            recordStart.getTime() < currentEnd.getTime()
          );
        },
      );
      const futureBillingRecords = subscriptionBillingRecords.filter(
        (record) => {
          const recordStart = yangonCalendarDate(
            new Date(record.billingPeriodStart),
          );
          return recordStart.getTime() >= currentEnd.getTime();
        },
      );

      const existingIdempotentRequest = billingRecords.find(
        (record) =>
          record.metadata?.purchaseRequestType === 'subscription_period' &&
          record.metadata?.idempotencyKey === idempotencyKey,
      );
      if (existingIdempotentRequest) {
        return {
          billingRecord: existingIdempotentRequest,
          purchase: {
            startOption:
              existingIdempotentRequest.metadata?.requestedStartOption ===
              'current_month'
                ? 'current_month'
                : 'next_month',
            monthStartAt: yangonWallClockToUtc(
              new Date(
                existingIdempotentRequest.billingPeriodStart,
              ).getUTCFullYear(),
              new Date(
                existingIdempotentRequest.billingPeriodStart,
              ).getUTCMonth() + 1,
              new Date(
                existingIdempotentRequest.billingPeriodStart,
              ).getUTCDate(),
            ),
            monthEndAt: yangonWallClockToUtc(
              new Date(
                existingIdempotentRequest.billingPeriodEnd,
              ).getUTCFullYear(),
              new Date(
                existingIdempotentRequest.billingPeriodEnd,
              ).getUTCMonth() + 1,
              new Date(existingIdempotentRequest.billingPeriodEnd).getUTCDate(),
            ),
            amountDue: Number(existingIdempotentRequest.amountDue || 0),
            currency: existingIdempotentRequest.currency,
            paymentStatus: existingIdempotentRequest.paymentStatus,
            periodStatus:
              existingIdempotentRequest.metadata?.startOption ===
              'current_month'
                ? 'pending_activation'
                : 'upcoming',
          },
        };
      }

      // ─── Month-occupancy resolution ───
      const currentHasPaidActive = occupiedPeriods.some(
        (period) =>
          period.periodStatus === 'active' &&
          (period.monthStartAt || period.periodStartAt)?.getTime() ===
            currentStart.getTime(),
      );
      const currentHasUnpaidReservation = currentMonthBillingRecords.some(
        (record) => !['paid', 'waived'].includes(record.paymentStatus),
      );
      const currentHasPaidReservation = currentMonthBillingRecords.some(
        (record) => ['paid', 'waived'].includes(record.paymentStatus),
      );
      const hasPendingSubscriptionReservation = subscriptionBillingRecords.some(
        (record) =>
          record.metadata?.purchaseRequestType === 'subscription_period' &&
          record.invoiceStatus !== 'void' &&
          !['paid', 'waived'].includes(record.paymentStatus),
      );

      if (input.startOption === 'current_month') {
        if (currentHasPaidActive || currentHasPaidReservation) {
          throw new ConflictException(
            'The current Yangon month is already occupied; purchase the next sequential month instead.',
          );
        }
        if (currentHasUnpaidReservation) {
          throw new ConflictException(
            'A pending payment already reserves the current Yangon month. Confirm payment for the existing invoice before requesting another current-month purchase.',
          );
        }
      } else {
        // Plan 14 acceptance (7.37c): a future month may only be requested
        // once the tenant holds an active paid subscription for the current
        // month. A trial period (or no period at all) does not qualify; the
        // tenant must first upgrade or make a fresh current-month purchase.
        if (!currentHasPaidActive && !currentHasPaidReservation) {
          throw new ConflictException(
            'Requesting a future month requires an active paid subscription for the current month; purchase or upgrade for the current month first.',
          );
        }
        if (hasPendingSubscriptionReservation) {
          throw new ConflictException(
            'A pending subscription payment already reserves a month. Confirm the existing invoice before requesting another sequential month.',
          );
        }
      }

      // Derive target month
      let monthStart = currentStart;
      let purchaseStartOption: SubscriptionPurchaseStartOption =
        input.startOption;
      let persistedStartOption:
        | 'current_month'
        | 'next_month'
        | 'scheduled_prepaid' = input.startOption;

      if (input.startOption === 'current_month') {
        // Current month is valid (no active/paid current period, no unpaid
        // current reservation). Use it directly.
        monthStart = currentStart;
      } else {
        // next_month: derive the earliest valid sequential month after the
        // latest occupied month (paid period, paid billing record, or unpaid
        // current-month billing record).
        const occupiedStarts = [
          ...occupiedPeriods.map(
            (period) => period.monthStartAt || period.periodStartAt,
          ),
          ...currentMonthBillingRecords.map((record) =>
            yangonCalendarDate(new Date(record.billingPeriodStart)),
          ),
          ...futureBillingRecords.map((record) =>
            yangonCalendarDate(new Date(record.billingPeriodStart)),
          ),
        ]
          .filter((value): value is Date => Boolean(value))
          .sort((left, right) => left.getTime() - right.getTime());

        // A first purchase explicitly requesting next_month must target the
        // following Yangon month when the current month is still free. Once a
        // current period exists, start at the current month and skip occupied
        // months to preserve the sequential queue.
        const currentMonthIsOccupied = occupiedStarts.some(
          (occupied) =>
            occupied.getTime() >= currentStart.getTime() &&
            occupied.getTime() < yangonMonthEnd(currentStart).getTime(),
        );
        // Build sequential months starting from the requested month (max
        // 24-month safety cap to prevent unbounded loops on bad data).
        let candidate = currentMonthIsOccupied
          ? currentStart
          : yangonNextMonthStart(currentStart);
        let iterations = 0;
        let monthFound = false;
        while (iterations < 24) {
          iterations += 1;
          const candidateEnd = yangonMonthEnd(candidate);
          const isOccupied = occupiedStarts.some(
            (occupied) =>
              occupied.getTime() >= candidate.getTime() &&
              occupied.getTime() < candidateEnd.getTime(),
          );
          if (!isOccupied) {
            monthStart = candidate;
            monthFound = true;
            break;
          }
          candidate = yangonNextMonthStart(candidate);
        }
        if (!monthFound) {
          throw new ConflictException(
            'No valid subscription month is available within the next 24 months.',
          );
        }

        if (monthStart.getTime() > currentStart.getTime()) {
          persistedStartOption = 'scheduled_prepaid';
        }
        purchaseStartOption =
          monthStart.getTime() === currentStart.getTime()
            ? 'current_month'
            : 'next_month';
      }

      const monthEnd = yangonMonthEnd(monthStart);
      const billingStart = yangonCalendarDate(monthStart);
      const billingEnd = yangonCalendarDate(monthEnd);

      // Overlap check against ALL subscription billing records for the
      // derived target month (not only current-month ones).
      const overlaps = subscriptionBillingRecords.find((record) => {
        const recordStart = new Date(record.billingPeriodStart).getTime();
        const recordEnd = new Date(record.billingPeriodEnd).getTime();
        return (
          billingStart.getTime() < recordEnd &&
          billingEnd.getTime() > recordStart
        );
      });
      if (overlaps) {
        throw new ConflictException(
          'A billing request already reserves the selected Yangon month.',
        );
      }

      const amountDue = Number(plan.monthlyPrice || 0);
      const requestedAt = now.toISOString();
      const billingRecord = billingRepository.create({
        tenantId,
        subscriptionPlanId: plan.id,
        invoiceNumber: null,
        billingPeriodStart: billingStart,
        billingPeriodEnd: billingEnd,
        invoiceStatus: 'issued',
        paymentStatus: 'unpaid',
        amountDue,
        amountPaid: 0,
        currency: 'MMK',
        dueDate: null,
        paidAt: null,
        notes:
          'Subscription period purchase request awaiting payment confirmation.',
        metadata: {
          source: 'tenant_subscription_purchase_request',
          purchaseRequestType: 'subscription_period',
          requestedAt,
          requestedStartOption: input.startOption,
          startOption: persistedStartOption,
          selectedPlanId: plan.id,
          selectedPlanName: plan.name,
          monthStartAt: monthStart.toISOString(),
          monthEndAt: monthEnd.toISOString(),
          purchaseSequence:
            periods.length +
            currentMonthBillingRecords.length +
            futureBillingRecords.length +
            1,
          idempotencyKey,
          fullMonthlyPrice: true,
          proration: false,
        },
      });
      let saved = await billingRepository.save(billingRecord);
      if (!saved.invoiceNumber) {
        saved.invoiceNumber = buildSubscriptionInvoiceNumber(now, saved.id);
        saved = await billingRepository.save(saved);
      }
      return {
        billingRecord: saved,
        purchase: {
          startOption: purchaseStartOption,
          monthStartAt: monthStart,
          monthEndAt: monthEnd,
          amountDue,
          currency: 'MMK',
          paymentStatus: saved.paymentStatus,
          periodStatus:
            persistedStartOption === 'current_month'
              ? 'pending_activation'
              : 'upcoming',
        },
      };
    });
  }

  /**
   * Plan 13 Phase 2 (tasks 2.12–2.14): create a current-month upgrade request.
   *
   * The upgrade attaches to the existing active current period — it never
   * creates a second period. It charges the full target-plan price, rejects
   * protected-dimension reductions, and enforces the one-upgrade-per-current-
   * period rule in the same transaction as the billing record and revision.
   */
  private async createCurrentMonthUpgrade(
    manager: EntityManager,
    input: {
      tenantId: string;
      currentPeriod: TenantSubscriptionPeriod;
      currentPlan: SubscriptionPlan;
      targetPlan: SubscriptionPlan;
      idempotencyKey: string;
      now: Date;
      currentStart: Date;
      currentEnd: Date;
    },
  ) {
    const {
      tenantId,
      currentPeriod,
      currentPlan,
      targetPlan,
      idempotencyKey,
      now,
      currentStart,
      currentEnd,
    } = input;
    this.assertUpgradeDoesNotReduceDimensions(currentPlan, targetPlan);

    const revisionRepository = manager.getRepository(
      TenantSubscriptionPeriodUpgradeRevision,
    );
    const existingRevision = await revisionRepository.findOne({
      where: { subscriptionPeriodId: currentPeriod.id, tenantId },
    });
    if (existingRevision && existingRevision.upgradeStatus !== 'cancelled') {
      if (existingRevision.metadata?.idempotencyKey === idempotencyKey) {
        // Idempotent retry returns the existing request unchanged.
        const billingRecord = existingRevision.billingRecordId
          ? await manager.getRepository(TenantBillingRecord).findOne({
              where: {
                id: existingRevision.billingRecordId,
                tenantId,
              },
            })
          : null;
        return this.toUpgradeRequestResponse(
          billingRecord,
          existingRevision,
          currentPeriod,
        );
      }
      throw new ConflictException(
        'An upgrade for the current month already exists; one upgrade is allowed per current period.',
      );
    }

    const billingRepository = manager.getRepository(TenantBillingRecord);
    const billingRecord = billingRepository.create({
      tenantId,
      subscriptionPlanId: targetPlan.id,
      invoiceNumber: null,
      billingPeriodStart: yangonCalendarDate(currentStart),
      billingPeriodEnd: yangonCalendarDate(currentEnd),
      invoiceStatus: 'issued',
      paymentStatus: 'unpaid',
      amountDue: Number(targetPlan.monthlyPrice || 0),
      amountPaid: 0,
      currency: 'MMK',
      dueDate: null,
      paidAt: null,
      notes:
        'Current-month upgrade request awaiting payment confirmation and platform approval.',
      metadata: {
        source: 'tenant_subscription_upgrade_request',
        purchaseRequestType: 'upgrade',
        requestedAt: now.toISOString(),
        requestedStartOption: 'current_month',
        startOption: 'current_month',
        selectedPlanId: targetPlan.id,
        selectedPlanName: targetPlan.name,
        previousPlanId: currentPlan.id,
        previousPlanName: currentPlan.name,
        subscriptionPeriodId: currentPeriod.id,
        monthStartAt: currentStart.toISOString(),
        monthEndAt: currentEnd.toISOString(),
        idempotencyKey,
        fullMonthlyPrice: true,
        proration: false,
      },
    });
    let savedBillingRecord = await billingRepository.save(billingRecord);
    if (!savedBillingRecord.invoiceNumber) {
      savedBillingRecord.invoiceNumber = buildSubscriptionInvoiceNumber(
        now,
        savedBillingRecord.id,
      );
      savedBillingRecord = await billingRepository.save(savedBillingRecord);
    }

    const revision = revisionRepository.create({
      subscriptionPeriodId: currentPeriod.id,
      tenantId,
      billingRecordId: savedBillingRecord.id,
      previousPlanId: currentPlan.id,
      upgradedPlanId: targetPlan.id,
      previousPlanSnapshot: buildQuotaSnapshot(
        currentPlan,
      ) as unknown as Record<string, unknown>,
      upgradedPlanSnapshot: buildQuotaSnapshot(targetPlan) as unknown as Record<
        string,
        unknown
      >,
      upgradeStatus: 'requested',
      upgradeRequestedAt: now,
      upgradeEffectiveAt: null,
      carryover: {
        inboundMessages: null,
        outboundMessages: null,
        apiRequests: null,
      },
      approvedAt: null,
      approvedBy: null,
      rejectionReason: null,
      metadata: { idempotencyKey, source: 'tenant_upgrade_request' },
    });
    const savedRevision = await revisionRepository.save(revision);

    savedBillingRecord.metadata = {
      ...savedBillingRecord.metadata,
      upgradeRevisionId: savedRevision.id,
    };
    savedBillingRecord = await billingRepository.save(savedBillingRecord);

    const eventRepository = manager.getRepository(SubscriptionPeriodEvent);
    await eventRepository.save(
      eventRepository.create({
        subscriptionPeriodId: currentPeriod.id,
        tenantId,
        eventType: 'upgrade_requested',
        previousStatus: null,
        newStatus: null,
        actorType: 'tenant_user',
        actorId: 'tenant-upgrade-request',
        source: 'tenant-subscription-upgrade',
        reason: `Current-month upgrade to ${targetPlan.name} requested`,
        idempotencyKey: `upgrade-requested:${savedRevision.id}`,
        metadata: {
          upgradeRevisionId: savedRevision.id,
          targetPlanId: targetPlan.id,
          previousPlanId: currentPlan.id,
        },
      }),
    );
    await eventRepository.save(
      eventRepository.create({
        subscriptionPeriodId: currentPeriod.id,
        tenantId,
        eventType: 'upgrade_revision_created',
        previousStatus: null,
        newStatus: null,
        actorType: 'tenant_user',
        actorId: 'tenant-upgrade-request',
        source: 'tenant-subscription-upgrade',
        reason: 'Upgrade revision persisted',
        idempotencyKey: `upgrade-revision-created:${savedRevision.id}`,
        metadata: { upgradeRevisionId: savedRevision.id },
      }),
    );

    return this.toUpgradeRequestResponse(
      savedBillingRecord,
      savedRevision,
      currentPeriod,
    );
  }

  /**
   * Create a normal paid subscription request that starts at trial expiry.
   * Unlike trial conversion, this path keeps the trial independent and gives
   * the paid period a fresh quota snapshot with no carryover.
   */
  private async createFreshAfterTrialPurchase(
    manager: EntityManager,
    input: {
      tenantId: string;
      trialPeriod: TenantSubscriptionPeriod;
      targetPlan: SubscriptionPlan;
      idempotencyKey: string;
      now: Date;
    },
  ) {
    const { tenantId, trialPeriod, targetPlan, idempotencyKey, now } = input;
    const trialEndAt = trialPeriod.periodEndAt;
    if (!trialEndAt) {
      throw new ConflictException(
        'The active trial has no valid expiry date for scheduling a paid plan.',
      );
    }

    const targetMonthStart = yangonMonthStart(trialEndAt);
    const targetMonthEnd = yangonMonthEnd(targetMonthStart);
    const billingRepository = manager.getRepository(TenantBillingRecord);
    const subscriptionBillingRecords = await billingRepository
      .createQueryBuilder('billing')
      .setLock('pessimistic_write')
      .where('billing.tenant_id = :tenantId', { tenantId })
      .andWhere("billing.invoice_status <> 'void'")
      .getMany();
    const subscriptionRecords = subscriptionBillingRecords.filter((record) => {
      const requestType = record.metadata?.purchaseRequestType;
      return (
        requestType === 'subscription_period' ||
        requestType === 'trial_conversion' ||
        requestType === 'upgrade' ||
        Boolean(record.subscriptionPlanId)
      );
    });

    const existingIdempotentRequest = subscriptionRecords.find(
      (record) => record.metadata?.idempotencyKey === idempotencyKey,
    );
    if (existingIdempotentRequest) {
      return {
        billingRecord: existingIdempotentRequest,
        purchase: {
          startOption: 'after_trial' as const,
          monthStartAt: targetMonthStart,
          monthEndAt: targetMonthEnd,
          scheduledStartAt: trialEndAt,
          amountDue: Number(existingIdempotentRequest.amountDue || 0),
          currency: existingIdempotentRequest.currency,
          paymentStatus: existingIdempotentRequest.paymentStatus,
          periodStatus: 'upcoming' as const,
        },
      };
    }

    const overlaps = subscriptionRecords.find((record) => {
      const recordStart = new Date(record.billingPeriodStart).getTime();
      const recordEnd = new Date(record.billingPeriodEnd).getTime();
      return (
        targetMonthStart.getTime() < recordEnd &&
        targetMonthEnd.getTime() > recordStart
      );
    });
    if (overlaps) {
      throw new ConflictException(
        'A paid plan request already reserves the month in which the trial ends.',
      );
    }

    const amountDue = Number(targetPlan.monthlyPrice || 0);
    const billingRecord = billingRepository.create({
      tenantId,
      subscriptionPlanId: targetPlan.id,
      invoiceNumber: null,
      billingPeriodStart: yangonCalendarDate(targetMonthStart),
      billingPeriodEnd: yangonCalendarDate(targetMonthEnd),
      invoiceStatus: 'issued',
      paymentStatus: 'unpaid',
      amountDue,
      amountPaid: 0,
      currency: 'MMK',
      dueDate: null,
      paidAt: null,
      notes:
        'Fresh paid plan requested after trial; starts at trial expiry with no trial quota carryover.',
      metadata: {
        source: 'tenant_after_trial_purchase_request',
        purchaseRequestType: 'subscription_period',
        purchaseMode: 'after_trial',
        requestedAt: now.toISOString(),
        requestedStartOption: 'after_trial',
        startOption: 'scheduled_prepaid',
        selectedPlanId: targetPlan.id,
        selectedPlanName: targetPlan.name,
        trialPeriodId: trialPeriod.id,
        scheduledStartAt: trialEndAt.toISOString(),
        effectivePeriodStartAt: trialEndAt.toISOString(),
        monthStartAt: targetMonthStart.toISOString(),
        monthEndAt: targetMonthEnd.toISOString(),
        idempotencyKey,
        fullMonthlyPrice: true,
        proration: false,
        quotaCarryover: false,
      },
    });
    let saved = await billingRepository.save(billingRecord);
    if (!saved.invoiceNumber) {
      saved.invoiceNumber = buildSubscriptionInvoiceNumber(now, saved.id);
      saved = await billingRepository.save(saved);
    }

    return {
      billingRecord: saved,
      purchase: {
        startOption: 'after_trial' as const,
        monthStartAt: targetMonthStart,
        monthEndAt: targetMonthEnd,
        scheduledStartAt: trialEndAt,
        amountDue,
        currency: 'MMK',
        paymentStatus: saved.paymentStatus,
        periodStatus: 'upcoming' as const,
      },
    };
  }

  /**
   * Plan 14 Phase 2 (task 2.10): create a trial-to-business conversion
   * request.
   *
   * A conversion always targets the current Yangon month and attaches to the
   * existing trial period — it never creates a second period. It charges the
   * full target-plan price with no trial-to-business price comparison and no
   * protected-dimension reduction check. The one-conversion-per-trial rule is
   * enforced by the same partial unique index as upgrades. The trial remains
   * authoritative until the paid period is paid, admin-approved, and
   * operational.
   */
  private async createTrialConversion(
    manager: EntityManager,
    input: {
      tenantId: string;
      trialPeriod: TenantSubscriptionPeriod;
      trialPlan: SubscriptionPlan;
      targetPlan: SubscriptionPlan;
      idempotencyKey: string;
      now: Date;
      currentStart: Date;
      currentEnd: Date;
    },
  ) {
    const {
      tenantId,
      trialPeriod,
      trialPlan,
      targetPlan,
      idempotencyKey,
      now,
      currentStart,
      currentEnd,
    } = input;

    const revisionRepository = manager.getRepository(
      TenantSubscriptionPeriodUpgradeRevision,
    );
    const existingRevision = await revisionRepository.findOne({
      where: { subscriptionPeriodId: trialPeriod.id, tenantId },
    });
    if (existingRevision && existingRevision.upgradeStatus !== 'cancelled') {
      if (existingRevision.metadata?.idempotencyKey === idempotencyKey) {
        const billingRecord = existingRevision.billingRecordId
          ? await manager.getRepository(TenantBillingRecord).findOne({
              where: { id: existingRevision.billingRecordId, tenantId },
            })
          : null;
        return this.toUpgradeRequestResponse(
          billingRecord,
          existingRevision,
          trialPeriod,
        );
      }
      throw new ConflictException(
        'A trial conversion for the current month already exists; one conversion is allowed per trial period.',
      );
    }

    const billingRepository = manager.getRepository(TenantBillingRecord);
    const billingRecord = billingRepository.create({
      tenantId,
      subscriptionPlanId: targetPlan.id,
      invoiceNumber: null,
      billingPeriodStart: yangonCalendarDate(currentStart),
      billingPeriodEnd: yangonCalendarDate(currentEnd),
      invoiceStatus: 'issued',
      paymentStatus: 'unpaid',
      amountDue: Number(targetPlan.monthlyPrice || 0),
      amountPaid: 0,
      currency: 'MMK',
      dueDate: null,
      paidAt: null,
      notes:
        'Trial-to-business conversion request awaiting payment confirmation and platform approval.',
      metadata: {
        source: 'tenant_trial_conversion_request',
        purchaseRequestType: 'trial_conversion',
        kind: 'trial_conversion',
        requestedAt: now.toISOString(),
        requestedStartOption: 'current_month',
        startOption: 'current_month',
        selectedPlanId: targetPlan.id,
        selectedPlanName: targetPlan.name,
        previousPlanId: trialPlan.id,
        previousPlanName: trialPlan.name,
        subscriptionPeriodId: trialPeriod.id,
        monthStartAt: currentStart.toISOString(),
        monthEndAt: currentEnd.toISOString(),
        idempotencyKey,
        fullMonthlyPrice: true,
        proration: false,
      },
    });
    let savedBillingRecord = await billingRepository.save(billingRecord);
    if (!savedBillingRecord.invoiceNumber) {
      savedBillingRecord.invoiceNumber = buildSubscriptionInvoiceNumber(
        now,
        savedBillingRecord.id,
      );
      savedBillingRecord = await billingRepository.save(savedBillingRecord);
    }

    const revision = revisionRepository.create({
      subscriptionPeriodId: trialPeriod.id,
      tenantId,
      billingRecordId: savedBillingRecord.id,
      previousPlanId: trialPlan.id,
      upgradedPlanId: targetPlan.id,
      previousPlanSnapshot: trialPeriod.quotaSnapshot as unknown as Record<
        string,
        unknown
      >,
      upgradedPlanSnapshot: buildQuotaSnapshot(targetPlan) as unknown as Record<
        string,
        unknown
      >,
      upgradeStatus: 'requested',
      upgradeRequestedAt: now,
      upgradeEffectiveAt: null,
      carryover: {
        inboundMessages: null,
        outboundMessages: null,
        apiRequests: null,
      },
      approvedAt: null,
      approvedBy: null,
      rejectionReason: null,
      metadata: {
        idempotencyKey,
        source: 'tenant_trial_conversion_request',
        kind: 'trial_conversion',
      },
    });
    const savedRevision = await revisionRepository.save(revision);

    savedBillingRecord.metadata = {
      ...savedBillingRecord.metadata,
      upgradeRevisionId: savedRevision.id,
    };
    savedBillingRecord = await billingRepository.save(savedBillingRecord);

    const eventRepository = manager.getRepository(SubscriptionPeriodEvent);
    await eventRepository.save(
      eventRepository.create({
        subscriptionPeriodId: trialPeriod.id,
        tenantId,
        eventType: 'trial_conversion_requested',
        previousStatus: null,
        newStatus: null,
        actorType: 'tenant_user',
        actorId: 'tenant-trial-conversion-request',
        source: 'tenant-trial-conversion',
        reason: `Trial conversion to ${targetPlan.name} requested`,
        idempotencyKey: `trial-conversion-requested:${savedRevision.id}`,
        metadata: {
          upgradeRevisionId: savedRevision.id,
          targetPlanId: targetPlan.id,
          previousPlanId: trialPlan.id,
        },
      }),
    );
    await eventRepository.save(
      eventRepository.create({
        subscriptionPeriodId: trialPeriod.id,
        tenantId,
        eventType: 'upgrade_revision_created',
        previousStatus: null,
        newStatus: null,
        actorType: 'tenant_user',
        actorId: 'tenant-trial-conversion-request',
        source: 'tenant-trial-conversion',
        reason: 'Trial conversion revision persisted',
        idempotencyKey: `upgrade-revision-created:${savedRevision.id}`,
        metadata: { upgradeRevisionId: savedRevision.id },
      }),
    );

    return this.toUpgradeRequestResponse(
      savedBillingRecord,
      savedRevision,
      trialPeriod,
    );
  }

  /**
   * Plan 13 Phase 2: the target plan must not reduce protected dimensions even
   * when its price is higher. Unlimited (null) current limits may only be
   * matched by unlimited target limits.
   */
  private assertUpgradeDoesNotReduceDimensions(
    current: SubscriptionPlan,
    target: SubscriptionPlan,
  ) {
    const dimensions: Array<[EntitlementDimensionKey, string]> = [
      ['inbound_messages', 'inbound messages'],
      ['outbound_messages', 'outbound messages'],
      ['api_requests', 'API requests'],
      ['channel_slots', 'channels'],
      ['storage_gb', 'storage'],
      ['team_members', 'team members'],
    ];
    const reduced = dimensions.filter(([dimension]) => {
      const currentValue = baseLimitForDimension(current, dimension);
      const targetValue = baseLimitForDimension(target, dimension);
      if (currentValue === null) return targetValue !== null;
      if (currentValue === undefined) return false;
      if (targetValue === null || targetValue === undefined) return false;
      return Number(targetValue) < Number(currentValue);
    });
    if (reduced.length > 0) {
      throw new ConflictException(
        `The target plan reduces ${reduced
          .map(([, label]) => label)
          .join(', ')}; upgrades must not reduce protected dimensions.`,
      );
    }
  }

  private toUpgradeRequestResponse(
    billingRecord: TenantBillingRecord | null,
    revision: TenantSubscriptionPeriodUpgradeRevision,
    currentPeriod: TenantSubscriptionPeriod,
  ) {
    const kind =
      revision.metadata?.kind === 'trial_conversion'
        ? ('trial_conversion' as const)
        : ('upgrade' as const);
    return {
      billingRecord,
      purchase: {
        kind,
        startOption: 'current_month' as const,
        monthStartAt: currentPeriod.monthStartAt ?? currentPeriod.periodStartAt,
        monthEndAt: currentPeriod.monthEndAt ?? currentPeriod.periodEndAt,
        amountDue: billingRecord ? Number(billingRecord.amountDue || 0) : 0,
        currency: billingRecord?.currency ?? 'MMK',
        paymentStatus: billingRecord?.paymentStatus ?? 'unpaid',
        periodStatus: currentPeriod.periodStatus,
        previousPlanId: revision.previousPlanId,
        targetPlanId: revision.upgradedPlanId,
        upgradeRevisionId: revision.id,
        upgradeStatus: revision.upgradeStatus,
      },
    };
  }

  /**
   * Plan 13 Phase 2: tenant cancels a pending upgrade request. Approved and
   * stale upgrades are terminal and cannot be cancelled.
   */
  async cancelUpgradeRevision(
    tenantId: string,
    userId: string,
    revisionId: string,
  ) {
    return this.tenantBillingRecordRepository.manager.transaction(
      async (manager) => {
        const revisionRepository = manager.getRepository(
          TenantSubscriptionPeriodUpgradeRevision,
        );
        const revision = await revisionRepository.findOne({
          where: { id: revisionId, tenantId },
        });
        if (!revision) {
          throw new NotFoundException('Upgrade revision not found');
        }
        if (
          !['requested', 'pending_payment'].includes(revision.upgradeStatus)
        ) {
          throw new ConflictException(
            `Upgrade is '${revision.upgradeStatus}' and cannot be cancelled.`,
          );
        }
        revision.upgradeStatus = 'cancelled';
        const saved = await revisionRepository.save(revision);
        await manager.getRepository(SubscriptionPeriodEvent).save(
          manager.getRepository(SubscriptionPeriodEvent).create({
            subscriptionPeriodId: revision.subscriptionPeriodId,
            tenantId,
            eventType: 'upgrade_cancelled',
            previousStatus: null,
            newStatus: null,
            actorType: 'tenant_user',
            actorId: userId,
            source: 'tenant-upgrade-cancel',
            reason: 'Tenant cancelled the pending upgrade request',
            idempotencyKey: `upgrade-cancelled:${revision.id}`,
            metadata: { upgradeRevisionId: revision.id },
          }),
        );
        return {
          id: revision.id,
          upgradeStatus: revision.upgradeStatus,
          cancelledAt: new Date().toISOString(),
        };
      },
    );
  }

  async submitPaymentProof(
    tenantId: string,
    billingRecordId: string,
    submittedBy: string | undefined,
    proof: SubmitPaymentProofDto,
  ) {
    const billingRecord = await this.tenantBillingRecordRepository.findOne({
      where: { id: billingRecordId, tenantId },
    });

    if (!billingRecord) throw new NotFoundException('Billing record not found');
    if (['paid', 'waived'].includes(billingRecord.paymentStatus)) {
      throw new BadRequestException(
        'Payment proof is not required for this invoice',
      );
    }
    if (proof.mediaScanStatus !== 'clean') {
      throw new BadRequestException(
        'Payment proof must pass media quarantine before submission',
      );
    }
    if (!this.mediaLibraryService) {
      throw new ConflictException(
        'Payment proof media validation is not configured.',
      );
    }
    await this.mediaLibraryService.getBillingProofFile(
      tenantId,
      proof.mediaFileId,
    );

    const metadata = billingRecord.metadata || {};
    const existingProof = metadata.paymentProof;
    if (existingProof?.status === 'pending_review') {
      throw new ConflictException(
        'Payment proof is already pending operator review',
      );
    }

    const submittedAt = new Date().toISOString();
    const submission = {
      id: `proof-${billingRecord.id}-${submittedAt}`,
      status: 'pending_review',
      reviewStatus: 'pending_review',
      paymentMethod: proof.paymentMethod,
      paidAmount: proof.paidAmount,
      paidDate: proof.paidDate,
      transactionReference: proof.transactionReference || null,
      mediaFileId: proof.mediaFileId,
      fileName: proof.fileName,
      mediaScanStatus: proof.mediaScanStatus,
      note: proof.note || null,
      submittedBy: submittedBy || null,
      submittedAt,
    };
    const history = Array.isArray(metadata.paymentProofSubmissions)
      ? metadata.paymentProofSubmissions
      : [];
    billingRecord.metadata = {
      ...metadata,
      paymentProof: submission,
      paymentProofSubmissions: [...history, submission],
    };

    await this.tenantBillingRecordRepository.save(billingRecord);
    return {
      message: 'Payment proof submitted for review',
      billingRecordId: billingRecord.id,
      paymentStatus: billingRecord.paymentStatus,
      proof: submission,
    };
  }

  async requestPlanChange(
    tenantId: string,
    userId: string,
    userRole: string,
    input: RequestPlanChangeDto,
  ) {
    const tenant = await this.getTenantSettings(tenantId);
    const desiredPlan = await this.subscriptionPlanRepository.findOne({
      where: { id: input.desiredPlanId, status: 'active' },
    });
    if (!desiredPlan) {
      throw new NotFoundException('Requested subscription plan was not found');
    }

    if (tenant.subscriptionPlanId === desiredPlan.id) {
      throw new BadRequestException(
        'This workspace is already assigned to the requested plan',
      );
    }

    const existingRequest = await this.leadRepository
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

    if (existingRequest) {
      throw new ConflictException(
        'A plan change request is already open for this workspace',
      );
    }

    const requester = await this.tenantUserRepository.findOne({
      where: { id: userId, tenantId },
    });
    if (!requester) {
      throw new NotFoundException('Requesting user not found');
    }

    const currentPlan = tenant.subscriptionPlanId
      ? await this.subscriptionPlanRepository.findOne({
          where: { id: tenant.subscriptionPlanId },
        })
      : null;
    const requestedAt = new Date().toISOString();
    const note = input.note?.trim() || null;
    const request = this.leadRepository.create({
      intent: 'sales',
      status: 'new',
      fullName:
        requester.fullName || tenant.contactPerson || tenant.companyName,
      companyName: tenant.companyName,
      emailAddress: tenant.contactEmail,
      phoneNumber: requester.phone || tenant.contactPhone || null,
      businessType: tenant.businessType || null,
      teamSize: null,
      interestedIn: desiredPlan.name,
      message: note,
      source: 'workspace-plan-change',
      metadata: {
        requestType: 'plan_change',
        tenantId,
        tenantCode: tenant.tenantCode,
        requestedByUserId: userId,
        requestedByRole: userRole,
        currentPlanId: currentPlan?.id || null,
        currentPlanName: currentPlan?.name || null,
        desiredPlanId: desiredPlan.id,
        desiredPlanName: desiredPlan.name,
        requestedAt,
      },
    });

    const savedRequest = await this.leadRepository.save(request);
    return {
      id: savedRequest.id,
      status: mapPlanRequestStatus(savedRequest),
      requestedAt,
      currentPlan: currentPlan
        ? { id: currentPlan.id, name: currentPlan.name }
        : null,
      desiredPlan: { id: desiredPlan.id, name: desiredPlan.name },
      note,
    };
  }

  async listPlanChangeRequests(
    tenantId: string,
  ): Promise<TenantPlanChangeRequestDto[]> {
    const requests = await this.leadRepository.find({
      where: { source: 'workspace-plan-change' },
      order: { createdAt: 'DESC' },
    });

    return requests
      .filter(
        (request) =>
          request.metadata?.tenantId === tenantId &&
          request.metadata?.requestType === 'plan_change',
      )
      .map((request) => ({
        id: request.id,
        status: mapPlanRequestStatus(request),
        requestedAt:
          request.metadata?.requestedAt || request.createdAt.toISOString(),
        resolvedAt:
          typeof request.metadata?.resolvedAt === 'string'
            ? request.metadata.resolvedAt
            : null,
        note: request.message || null,
        currentPlan:
          request.metadata?.currentPlanId && request.metadata?.currentPlanName
            ? {
                id: String(request.metadata.currentPlanId),
                name: String(request.metadata.currentPlanName),
              }
            : null,
        desiredPlan: {
          id: String(request.metadata?.desiredPlanId || ''),
          name: String(
            request.metadata?.desiredPlanName ||
              request.interestedIn ||
              'Requested plan',
          ),
        },
      }));
  }

  async requestDataExport(
    tenantId: string,
    userId: string,
    userRole: string,
    note?: string,
  ) {
    const tenant = await this.getTenantSettings(tenantId);
    const requester = await this.tenantUserRepository.findOne({
      where: { id: userId, tenantId },
    });
    const requestedAt = new Date().toISOString();
    const request = this.leadRepository.create({
      intent: 'support',
      status: 'new',
      fullName:
        requester?.fullName || tenant.contactPerson || tenant.companyName,
      companyName: tenant.companyName,
      emailAddress: requester?.email || tenant.contactEmail,
      phoneNumber: requester?.phone || tenant.contactPhone || null,
      businessType: tenant.businessType || null,
      teamSize: null,
      interestedIn: 'Data export',
      message: note?.trim() || 'Tenant data export requested from workspace.',
      source: 'workspace-data-export',
      metadata: {
        requestType: 'data_export',
        tenantId,
        tenantCode: tenant.tenantCode,
        requestedByUserId: userId,
        requestedByRole: userRole,
        requestedAt,
      },
    });
    const savedRequest = await this.leadRepository.save(request);
    return {
      id: savedRequest.id,
      status: 'requested',
      requestedAt,
      message: 'Data export request queued for support review.',
    };
  }

  async cancelPlanChangeRequest(
    tenantId: string,
    userId: string,
    requestId: string,
  ): Promise<TenantPlanChangeRequestDto> {
    const request = await this.leadRepository.findOne({
      where: { id: requestId, source: 'workspace-plan-change' },
    });
    if (
      !request ||
      request.metadata?.tenantId !== tenantId ||
      request.metadata?.requestType !== 'plan_change'
    ) {
      throw new NotFoundException('Plan change request not found');
    }
    if (request.status === 'converted') {
      throw new BadRequestException(
        'Approved plan change requests cannot be cancelled',
      );
    }
    if (request.status === 'closed') {
      throw new BadRequestException(
        'This plan change request is already closed',
      );
    }

    request.status = 'closed';
    request.metadata = {
      ...(request.metadata || {}),
      outcome: 'cancelled',
      cancelledByUserId: userId,
      resolvedAt: new Date().toISOString(),
    };
    const savedRequest = await this.leadRepository.save(request);
    const [currentPlanId, currentPlanName] = [
      savedRequest.metadata?.currentPlanId,
      savedRequest.metadata?.currentPlanName,
    ];

    return {
      id: savedRequest.id,
      status: mapPlanRequestStatus(savedRequest),
      requestedAt:
        savedRequest.metadata?.requestedAt ||
        savedRequest.createdAt.toISOString(),
      resolvedAt:
        typeof savedRequest.metadata?.resolvedAt === 'string'
          ? savedRequest.metadata.resolvedAt
          : null,
      note: savedRequest.message || null,
      currentPlan:
        currentPlanId && currentPlanName
          ? { id: String(currentPlanId), name: String(currentPlanName) }
          : null,
      desiredPlan: {
        id: String(savedRequest.metadata?.desiredPlanId || ''),
        name: String(
          savedRequest.metadata?.desiredPlanName ||
            savedRequest.interestedIn ||
            'Requested plan',
        ),
      },
    };
  }

  getAvailableRoles() {
    return [
      {
        role: 'owner',
        permissions: [
          'tenant.manage',
          'billing.manage',
          'csrs.manage',
          'channels.manage',
          'responses.manage',
          'products.manage',
          'orders.manage',
          'reports.view',
          'audit.view',
        ],
      },
      {
        role: 'admin',
        permissions: [
          'tenant.manage',
          'billing.manage',
          'csrs.manage',
          'channels.manage',
          'responses.manage',
          'products.manage',
          'orders.manage',
          'reports.view',
          'audit.view',
        ],
      },
      {
        role: 'supervisor',
        permissions: [
          'csrs.view',
          'billing.view',
          'channels.manage',
          'responses.manage',
          'products.manage',
          'orders.manage',
          'reports.view',
          'audit.view',
        ],
      },
      {
        role: 'csr',
        permissions: [
          'inbox.manage',
          'customers.view',
          'orders.create',
          'responses.use',
        ],
      },
      {
        role: 'finance',
        permissions: [
          'billing.view',
          'billing.manage',
          'orders.view',
          'payments.manage',
          'reports.view',
        ],
      },
      {
        role: 'delivery',
        permissions: ['deliveries.view', 'deliveries.manage', 'orders.view'],
      },
    ];
  }

  async updateCsrPermissions(
    tenantId: string,
    csrId: string,
    permissions: Record<string, any>,
  ): Promise<TenantUserResponseDto> {
    const csr = await this.getCsrEntityById(tenantId, csrId);
    csr.permissions = permissions;
    return toTenantUserResponse(await this.tenantUserRepository.save(csr));
  }

  // CSR Management
  async getAllCsrs(
    tenantId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<TenantUserResponseDto>> {
    const { page = 1, limit = 10, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.tenantUserRepository
      .createQueryBuilder('user')
      .where('user.tenant_id = :tenantId', { tenantId });

    if (search) {
      queryBuilder.andWhere(
        'user.full_name ILIKE :search OR user.email ILIKE :search',
        {
          search: `%${search}%`,
        },
      );
    }

    queryBuilder.orderBy(
      csrSortColumns[sortBy || 'createdAt'] || 'user.createdAt',
      sortOrder || 'DESC',
    );

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPages = Math.ceil(total / limit);

    return toPaginatedTenantUserResponse({
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    });
  }

  async getCsrById(
    tenantId: string,
    csrId: string,
  ): Promise<TenantUserResponseDto> {
    return toTenantUserResponse(await this.getCsrEntityById(tenantId, csrId));
  }

  private async getCsrEntityById(
    tenantId: string,
    csrId: string,
  ): Promise<TenantUser> {
    const csr = await this.tenantUserRepository.findOne({
      where: { id: csrId, tenantId },
    });

    if (!csr) {
      throw new NotFoundException('CSR not found');
    }

    return csr;
  }

  async createCsr(
    tenantId: string,
    createCsrDto: CreateCsrDto,
    actorRole?: string,
  ): Promise<TenantUserResponseDto> {
    // Check if csr already exists
    const normalizedEmail = normalizeIdentityEmail(createCsrDto.email);
    const email = createCsrDto.email.trim();
    const existCSR = await this.tenantUserRepository.findOne({
      where: { normalizedEmail },
    });

    if (existCSR) {
      throw new ConflictException(TENANT_USER_EMAIL_CONFLICT_MESSAGE);
    }

    await this.assertPlanLimitAvailable(tenantId, 'csrs');
    this.assertRoleManagementAllowed(actorRole, createCsrDto.role);
    this.ensureStrongPassword(createCsrDto.password);

    // Hash password
    const passwordHash = await bcrypt.hash(createCsrDto.password, 12);

    const { firstName, lastName } = splitFullName(createCsrDto.fullName);

    const csr = this.tenantUserRepository.create({
      ...createCsrDto,
      tenantId,
      email,
      normalizedEmail,
      firstName,
      lastName,
      passwordHash,
      role: createCsrDto.role || 'csr',
      status: createCsrDto.status || 'active',
      emailVerifiedAt: new Date(),
    });

    try {
      return toTenantUserResponse(await this.tenantUserRepository.save(csr));
    } catch (error) {
      throw mapTenantUserIdentityConflict(error) || error;
    }
  }

  async inviteCsr(
    tenantId: string,
    inviteCsrDto: CreateCsrInviteDto,
    invitedBy: string,
    actorRole?: string,
  ): Promise<TenantUserInvitationResponseDto> {
    const normalizedEmail = normalizeIdentityEmail(inviteCsrDto.email);
    const email = inviteCsrDto.email.trim();
    const csrAgent = await this.tenantUserRepository.findOne({
      where: { normalizedEmail },
    });

    if (csrAgent) {
      throw new ConflictException(TENANT_USER_EMAIL_CONFLICT_MESSAGE);
    }

    await this.assertPlanLimitAvailable(tenantId, 'csrs');
    this.assertRoleManagementAllowed(actorRole, inviteCsrDto.role);

    const placeholderPassword = await bcrypt.hash(
      `invite:${tenantId}:${normalizedEmail}:${Date.now()}`,
      12,
    );
    const { firstName, lastName } = splitFullName(inviteCsrDto.fullName);
    const invitedCsr = this.tenantUserRepository.create({
      ...inviteCsrDto,
      tenantId,
      email,
      normalizedEmail,
      firstName,
      lastName,
      passwordHash: placeholderPassword,
      role: inviteCsrDto.role || 'csr',
      status: 'inactive',
      emailVerifiedAt: null,
      notificationPreferences: { email: true, inApp: true },
    });

    let savedCsr: TenantUser;
    try {
      savedCsr = await this.tenantUserRepository.save(invitedCsr);
    } catch (error) {
      throw mapTenantUserIdentityConflict(error) || error;
    }
    const invitation = await this.authService.issueTenantUserInvite(
      savedCsr.id,
      normalizedEmail,
      {
        invitedBy,
        tenantId,
        role: savedCsr.role,
      },
    );

    return {
      user: toTenantUserResponse(savedCsr),
      invitation: {
        message: invitation.message,
        invitationDelivery: invitation.invitationDelivery,
        expiresAt: invitation.expiresAt,
      },
    };
  }

  async updateCsr(
    tenantId: string,
    csrId: string,
    updateCsrDto: UpdateCsrDto,
    actorRole?: string,
  ): Promise<TenantUserResponseDto> {
    const csr = await this.getCsrEntityById(tenantId, csrId);
    this.assertRoleManagementAllowed(actorRole, updateCsrDto.role, csr.role);
    if (updateCsrDto.email !== undefined) {
      const normalizedEmail = normalizeIdentityEmail(updateCsrDto.email);
      if (normalizedEmail !== csr.normalizedEmail) {
        const existingUser = await this.tenantUserRepository.findOne({
          where: { normalizedEmail },
        });
        if (existingUser && existingUser.id !== csr.id) {
          throw new ConflictException(TENANT_USER_EMAIL_CONFLICT_MESSAGE);
        }
      }
    }
    Object.assign(csr, updateCsrDto);
    if (updateCsrDto.email !== undefined) {
      csr.email = updateCsrDto.email.trim();
      csr.normalizedEmail = normalizeIdentityEmail(updateCsrDto.email);
    }
    try {
      return toTenantUserResponse(await this.tenantUserRepository.save(csr));
    } catch (error) {
      throw mapTenantUserIdentityConflict(error) || error;
    }
  }

  async deleteCsr(
    tenantId: string,
    csrId: string,
    actorRole?: string,
  ): Promise<void> {
    const csr = await this.getCsrEntityById(tenantId, csrId);
    this.assertRoleManagementAllowed(actorRole, undefined, csr.role);
    await this.tenantUserRepository.remove(csr);
  }

  // Channel Management
  async getAllChannels(tenantId: string): Promise<TenantChannel[]> {
    const channels = await this.tenantChannelRepository.find({
      where: { tenantId, channelType: Not('line') },
      order: { createdAt: 'DESC' },
    });
    await this.refreshStaleMessengerWebhookUrls(channels);
    return channels.map((channel) => this.toPublicChannel(channel));
  }

  async getChannelById(
    tenantId: string,
    channelId: string,
  ): Promise<TenantChannel> {
    const channel = await this.tenantChannelRepository.findOne({
      where: { id: channelId, tenantId, channelType: Not('line') },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (
      channel.channelType === 'messenger' &&
      this.isStaleMessengerWebhookUrl(channel.webhookUrl)
    ) {
      channel.webhookUrl = this.buildChannelWebhookUrl(
        channel.channelType,
        channel.id,
      );
      channel.configuration = {
        ...(channel.configuration || {}),
        webhookUrl: channel.webhookUrl,
      };
      await this.tenantChannelRepository.save(channel);
    }

    return this.toPublicChannel(channel);
  }

  async createChannel(
    tenantId: string,
    createChannelDto: CreateTenantChannelDto,
    actorUserId?: string | null,
  ): Promise<TenantChannel> {
    const repositoryManager = this.tenantChannelRepository.manager;
    let savedChannel: TenantChannel;

    // Validate provider credentials outside the transaction: the adapter
    // performs network calls to the provider/integration service, and the
    // transaction holds pessimistic tenant locks while it stays open.
    const validation = await this.channelAdapterService.validateConfig(
      createChannelDto.channelType,
      createChannelDto.configuration || {},
      createChannelDto.credentials || {},
    );

    if (!repositoryManager?.transaction) {
      if (process.env.NODE_ENV === 'production') {
        throw new ConflictException({
          code: 'CHANNEL_TRANSACTION_REQUIRED',
          message:
            'Channel creation requires a transaction-capable repository.',
        });
      }
      savedChannel = await this.createChannelInTransaction(
        tenantId,
        createChannelDto,
        actorUserId,
        undefined,
        validation,
      );
    } else {
      savedChannel = await repositoryManager.transaction(async (manager) => {
        await manager
          .getRepository(Tenant)
          .createQueryBuilder('tenant')
          .where('tenant.id = :tenantId', { tenantId })
          .setLock('pessimistic_write')
          .getOne();

        return this.createChannelInTransaction(
          tenantId,
          createChannelDto,
          actorUserId,
          manager,
          validation,
        );
      });
    }

    // The channel must be committed before provider network work starts. This
    // keeps a slow integration service from rolling back the local channel.
    const persistedChannel =
      savedChannel.id &&
      typeof this.tenantChannelRepository.findOne === 'function'
        ? await this.tenantChannelRepository.findOne({
            where: { id: savedChannel.id, tenantId },
          })
        : null;
    const completedChannel = await this.completeTelegramWebhookRegistration(
      persistedChannel || savedChannel,
    );
    return this.toPublicChannel(completedChannel);
  }

  private async createChannelInTransaction(
    tenantId: string,
    createChannelDto: CreateTenantChannelDto,
    actorUserId: string | null | undefined,
    manager?: EntityManager,
    adapterValidation?: Record<string, any>,
  ): Promise<TenantChannel> {
    const channelRepository =
      manager?.getRepository(TenantChannel) || this.tenantChannelRepository;
    const channelCapacity = await this.resolveChannelCapacityForTenant(
      tenantId,
      manager,
    );
    if (!channelCapacity.canCreate) {
      throw new ConflictException({
        code: 'CHANNELS_PLAN_LIMIT_REACHED',
        message: `Channel capacity reached (${channelCapacity.operationalCount}/${channelCapacity.effectiveCapacity ?? 'unlimited'}).`,
        limit: channelCapacity.effectiveCapacity,
        used: channelCapacity.operationalCount,
      });
    }
    await this.assertProviderAllowed(tenantId, createChannelDto.channelType);

    const rawCredentials = createChannelDto.credentials || {};
    const credentialValidation = validateProviderCredentials(
      createChannelDto.channelType,
      rawCredentials,
    );
    const validation =
      adapterValidation ||
      (await this.channelAdapterService.validateConfig(
        createChannelDto.channelType,
        createChannelDto.configuration || {},
        rawCredentials,
      ));
    if (
      createChannelDto.channelType === 'telegram' &&
      validation.valid &&
      validation.verifiedIdentity
    ) {
      const identity = validation.verifiedIdentity;
      const botId =
        typeof identity.botId === 'string'
          ? identity.botId
          : typeof identity.id === 'string'
            ? identity.id
            : null;
      if (botId) {
        const existing = await channelRepository.findOne({
          where: {
            channelType: 'telegram',
            providerAccountId: botId,
            tenantId,
          },
        });
        if (existing) {
          return this.updateChannel(
            tenantId,
            existing.id,
            createChannelDto,
            actorUserId,
            manager,
            true,
          );
        }
      }
    }

    const telegramLifecycle = await this.prepareTelegramLifecycle(
      createChannelDto.channelType,
      rawCredentials,
      validation,
      createChannelDto.configuration || {},
    );
    const credentialStatus = this.getCredentialStatus(
      telegramLifecycle.rawCredentials,
      credentialValidation.valid,
    );
    const connectionStatus =
      telegramLifecycle.connectionStatus ||
      this.getConnectionStatus(credentialValidation.valid, validation.valid);
    const channel = channelRepository.create({
      ...createChannelDto,
      tenantId,
      webhookUrl: null,
      credentials: this.encryptCredentials(telegramLifecycle.rawCredentials),
      credentialSchema: getProviderCredentialSchema(
        createChannelDto.channelType,
      ),
      credentialStatus,
      connectionStatus,
      providerAccountId: telegramLifecycle.providerAccountId,
      credentialsVerifiedAt: telegramLifecycle.credentialsVerifiedAt || null,
      credentialLastUpdatedAt:
        Object.keys(telegramLifecycle.rawCredentials).length > 0
          ? new Date()
          : undefined,
      status: telegramLifecycle.status || 'pending',
      entitlementOrigin: channelCapacity.originForNewChannel,
      entitlementExpiresAt:
        channelCapacity.originForNewChannel === 'top_up'
          ? channelCapacity.periodEndAt
          : null,
      retentionSelected: false,
      disabledAt: null,
      disabledReason: null,
      disabledPreviousStatus: null,
      disabledPreviousConnectionStatus: null,
      webhookRegistrationStatus: 'pending',
      webhookRegisteredAt: null,
      webhookRegistrationCheckedAt: null,
      webhookRegistrationErrorCode: null,
      errorMessage:
        telegramLifecycle.errorMessage ||
        [...credentialValidation.errors, ...validation.errors].join(', ') ||
        null,
      configuration: {
        ...(telegramLifecycle.configuration || {}),
        adapterType: createChannelDto.channelType,
        adapterValidation: validation,
        credentialValidation,
      },
    });

    const pendingChannel = await channelRepository.save(channel);
    if (!pendingChannel.id) {
      throw new Error('Persisted channel did not receive an immutable UUID.');
    }

    const webhookUrl = this.buildChannelWebhookUrl(
      pendingChannel.channelType,
      pendingChannel.id,
    );
    pendingChannel.webhookUrl = webhookUrl;
    pendingChannel.webhookRegistrationStatus = 'pending';
    pendingChannel.webhookRegistrationCheckedAt = new Date();
    pendingChannel.configuration = {
      ...(pendingChannel.configuration || {}),
      webhookUrl,
      adapterType: pendingChannel.channelType,
      adapterValidation: validation,
      credentialValidation,
    };

    const savedChannel = await channelRepository.save(pendingChannel);
    if (Object.keys(telegramLifecycle.rawCredentials).length > 0) {
      await this.logChannelAudit(
        tenantId,
        actorUserId,
        'channel_credentials_configured',
        savedChannel,
        {
          credentialStatus: savedChannel.credentialStatus,
          connectionStatus: savedChannel.connectionStatus,
          credentials: redactProviderCredentials(
            savedChannel.channelType,
            savedChannel.credentials,
          ),
        },
        manager,
      );
    }
    return savedChannel;
  }

  private async completeTelegramWebhookRegistration(
    channel: TenantChannel,
  ): Promise<TenantChannel> {
    if (
      channel.channelType !== 'telegram' ||
      channel.webhookRegistrationStatus === 'registered' ||
      channel.configuration?.adapterValidation?.valid === false
    ) {
      return channel;
    }

    let rawCredentials: Record<string, any>;
    try {
      rawCredentials = decryptProviderCredentials(
        channel.credentials,
        this.getCredentialSecret(),
      );
      if (
        typeof rawCredentials.botToken !== 'string' ||
        !rawCredentials.botToken
      ) {
        return channel;
      }
      await this.registerTelegramWebhook(channel, rawCredentials);
    } catch (error) {
      const errorName =
        error && typeof error === 'object' && 'name' in error
          ? String((error as { name?: unknown }).name)
          : '';
      const errorCode =
        errorName === 'TimeoutError' || errorName === 'AbortError'
          ? 'webhook_registration_timeout'
          : 'webhook_registration_error';
      const now = new Date();
      channel.webhookRegistrationStatus = 'failed';
      channel.webhookRegistrationErrorCode = errorCode;
      channel.webhookRegistrationCheckedAt = now;
      channel.connectionStatus = 'error';
      channel.status = 'pending';
      channel.errorMessage = errorCode;
      channel.configuration = {
        ...(channel.configuration || {}),
        telegramWebhook: {
          ...(channel.configuration?.telegramWebhook || {}),
          status: errorCode,
          checkedAt: now.toISOString(),
        },
      };
    }

    const lifecycleState = {
      webhookUrl: channel.webhookUrl,
      webhookRegisteredAt: channel.webhookRegisteredAt,
      webhookRegistrationCheckedAt: channel.webhookRegistrationCheckedAt,
      webhookRegistrationErrorCode: channel.webhookRegistrationErrorCode,
      webhookRegistrationStatus: channel.webhookRegistrationStatus,
      connectionStatus: channel.connectionStatus,
      status: channel.status,
      errorMessage: channel.errorMessage,
      configuration: channel.configuration,
    };

    const latestChannel =
      channel.id && typeof this.tenantChannelRepository.findOne === 'function'
        ? await this.tenantChannelRepository.findOne({
            where: { id: channel.id, tenantId: channel.tenantId },
          })
        : null;
    const channelToSave = latestChannel || channel;
    Object.assign(channelToSave, lifecycleState);
    await this.tenantChannelRepository.save(channelToSave);
    return channelToSave;
  }

  async validateTelegramToken(botToken: string): Promise<{
    ok: boolean;
    botId?: string;
    username?: string;
    firstName?: string;
    error?: string;
  }> {
    if (!botToken?.trim()) {
      return { ok: false, error: 'Bot token is required' };
    }

    const validation = await this.channelAdapterService.validateConfig(
      'telegram',
      {},
      { botToken: botToken.trim() },
    );

    if (!validation.valid) {
      return {
        ok: false,
        error:
          validation.errors?.join(', ') ||
          validation.status ||
          'token_validation_failed',
      };
    }

    const identity = validation.verifiedIdentity || {};
    const botId =
      typeof identity.botId === 'string'
        ? identity.botId
        : typeof identity.id === 'string'
          ? identity.id
          : undefined;

    return {
      ok: true,
      botId,
      username:
        typeof identity.username === 'string' ? identity.username : undefined,
      firstName:
        typeof identity.firstName === 'string' ? identity.firstName : undefined,
    };
  }

  async updateChannel(
    tenantId: string,
    channelId: string,
    updateChannelDto: Partial<CreateTenantChannelDto>,
    actorUserId?: string | null,
    manager?: EntityManager,
    deferTelegramWebhookRegistration = false,
  ): Promise<TenantChannel> {
    const channelRepository =
      manager?.getRepository(TenantChannel) || this.tenantChannelRepository;
    const channel = await this.getStoredChannelById(
      tenantId,
      channelId,
      manager,
    );
    if (channel.status === 'disabled') {
      throw new ConflictException(
        'Capacity-disabled channels must be reactivated through the reactivation endpoint before editing.',
      );
    }
    const existingCredentials = decryptProviderCredentials(
      channel.credentials,
      this.getCredentialSecret(),
    );
    const rawCredentials =
      updateChannelDto.credentials !== undefined
        ? this.mergeCredentialUpdates(
            existingCredentials,
            updateChannelDto.credentials || {},
          )
        : existingCredentials;
    let telegramLifecycle: TelegramLifecycle | null = null;

    Object.assign(channel, {
      ...updateChannelDto,
      credentials:
        updateChannelDto.credentials !== undefined
          ? this.encryptCredentials(rawCredentials)
          : channel.credentials,
    });

    if (updateChannelDto.channelType || updateChannelDto.configuration) {
      const nextConfiguration = channel.configuration || {};
      const nextChannelType = channel.channelType;
      const webhookUrl =
        channel.webhookUrl ||
        this.buildChannelWebhookUrl(nextChannelType, channel.id);
      channel.webhookUrl = webhookUrl;
      channel.configuration = {
        ...nextConfiguration,
        webhookUrl,
      };
    }

    if (
      updateChannelDto.channelType ||
      updateChannelDto.configuration ||
      updateChannelDto.credentials
    ) {
      const credentialValidation = validateProviderCredentials(
        channel.channelType,
        rawCredentials,
      );
      const validation = await this.channelAdapterService.validateConfig(
        channel.channelType,
        channel.configuration || {},
        rawCredentials,
      );
      telegramLifecycle = await this.prepareTelegramLifecycle(
        channel.channelType,
        rawCredentials,
        validation,
        channel.configuration || {},
        channel.id,
      );
      const telegramAlreadyReady =
        channel.channelType === 'telegram' &&
        updateChannelDto.credentials === undefined &&
        ['ready', 'connected'].includes(String(channel.connectionStatus || ''));
      channel.credentialSchema = getProviderCredentialSchema(
        channel.channelType,
      );
      channel.credentialStatus = this.getCredentialStatus(
        telegramLifecycle.rawCredentials,
        credentialValidation.valid,
      );
      channel.connectionStatus = telegramAlreadyReady
        ? channel.connectionStatus
        : telegramLifecycle.connectionStatus ||
          this.getConnectionStatus(
            credentialValidation.valid,
            validation.valid,
          );
      channel.providerAccountId = telegramLifecycle.providerAccountId;
      channel.credentialsVerifiedAt =
        telegramLifecycle.credentialsVerifiedAt ||
        channel.credentialsVerifiedAt ||
        null;
      channel.credentialLastUpdatedAt =
        updateChannelDto.credentials !== undefined
          ? new Date()
          : channel.credentialLastUpdatedAt;
      channel.status = telegramAlreadyReady
        ? channel.status
        : telegramLifecycle.status ||
          (credentialValidation.valid && validation.valid
            ? 'active'
            : 'pending');
      channel.errorMessage =
        telegramLifecycle.errorMessage ||
        [...credentialValidation.errors, ...validation.errors].join(', ');
      channel.credentials =
        updateChannelDto.credentials !== undefined
          ? this.encryptCredentials(telegramLifecycle.rawCredentials)
          : channel.credentials;
      channel.configuration = {
        ...(telegramAlreadyReady
          ? channel.configuration || {}
          : telegramLifecycle.configuration || channel.configuration || {}),
        webhookUrl:
          channel.webhookUrl ||
          this.buildChannelWebhookUrl(channel.channelType, channel.id),
        adapterType: channel.channelType,
        adapterValidation: validation,
        credentialValidation,
      };
    }

    const savedChannel = await channelRepository.save(channel);
    if (
      !deferTelegramWebhookRegistration &&
      savedChannel.channelType === 'telegram' &&
      telegramLifecycle?.rawCredentials.botToken &&
      !['ready', 'connected'].includes(
        String(savedChannel.connectionStatus || ''),
      ) &&
      telegramLifecycle.connectionStatus === 'credentials_verified'
    ) {
      await this.registerTelegramWebhook(
        savedChannel,
        telegramLifecycle.rawCredentials,
      );
      await channelRepository.save(savedChannel);
    }
    if (updateChannelDto.credentials !== undefined) {
      await this.logChannelAudit(
        tenantId,
        actorUserId,
        'channel_credentials_updated',
        savedChannel,
        {
          credentialStatus: savedChannel.credentialStatus,
          connectionStatus: savedChannel.connectionStatus,
          credentials: redactProviderCredentials(
            savedChannel.channelType,
            savedChannel.credentials,
          ),
        },
        manager,
      );
    }
    return deferTelegramWebhookRegistration
      ? savedChannel
      : this.toPublicChannel(savedChannel);
  }

  async disconnectChannel(
    tenantId: string,
    channelId: string,
    actorUserId: string,
  ): Promise<TenantChannel> {
    const channel = await this.getStoredChannelById(tenantId, channelId);

    if (channel.channelType === 'telegram') {
      try {
        const credentials = decryptProviderCredentials(
          channel.credentials,
          this.getCredentialSecret(),
        );
        if (typeof credentials.botToken === 'string' && credentials.botToken) {
          await this.callIntegrationTelegramWebhook('delete', {
            credentials,
            dropPendingUpdates: false,
          });
        }
      } catch {
        channel.webhookRegistrationStatus = 'failed';
        channel.webhookRegistrationErrorCode = 'disconnect_cleanup_failed';
      }
    }

    channel.status = 'inactive';
    channel.connectionStatus = 'disabled';
    channel.credentialStatus = 'missing_required';
    channel.credentials = {};
    channel.credentialsVerifiedAt = null;
    channel.errorMessage = null;
    channel.webhookRegistrationStatus =
      channel.webhookRegistrationStatus === 'failed'
        ? channel.webhookRegistrationStatus
        : 'pending';
    const savedChannel = await this.tenantChannelRepository.save(channel);
    await this.logChannelAudit(
      tenantId,
      actorUserId,
      'channel_disconnected',
      savedChannel,
      {
        status: savedChannel.status,
        connectionStatus: savedChannel.connectionStatus,
      },
    );
    return this.toPublicChannel(savedChannel);
  }

  async setChannelRetentionSelection(
    tenantId: string,
    channelId: string,
    selected: boolean,
  ): Promise<TenantChannel> {
    const channel = await this.getStoredChannelById(tenantId, channelId);
    if (channel.status === 'inactive') {
      throw new ConflictException(
        'Disconnected channels cannot be selected for capacity retention.',
      );
    }
    channel.retentionSelected = selected;
    return this.toPublicChannel(
      await this.tenantChannelRepository.save(channel),
    );
  }

  async reactivateChannel(
    tenantId: string,
    channelId: string,
  ): Promise<TenantChannel> {
    const repositoryManager = this.tenantChannelRepository.manager;
    const reactivate = async (manager?: EntityManager) => {
      if (manager) {
        await manager
          .getRepository(Tenant)
          .createQueryBuilder('tenant')
          .where('tenant.id = :tenantId', { tenantId })
          .setLock('pessimistic_write')
          .getOne();
      }
      const channelRepository =
        manager?.getRepository(TenantChannel) || this.tenantChannelRepository;
      const channel = await channelRepository.findOne({
        where: { id: channelId, tenantId, channelType: Not('line') },
      });
      if (!channel) throw new NotFoundException('Channel not found');
      if (channel.status !== 'disabled') {
        throw new ConflictException(
          'Only a capacity-disabled channel can be reactivated.',
        );
      }
      const capacity = await this.resolveChannelCapacityForTenant(
        tenantId,
        manager,
      );
      if (!capacity.canCreate) {
        throw new ConflictException({
          code: 'CHANNELS_PLAN_LIMIT_REACHED',
          message:
            'Channel capacity is full; disable another channel or purchase active channel capacity first.',
          limit: capacity.effectiveCapacity,
          used: capacity.operationalCount,
        });
      }
      channel.status = channel.disabledPreviousStatus || 'active';
      channel.connectionStatus =
        channel.disabledPreviousConnectionStatus || 'ready';
      channel.disabledAt = null;
      channel.disabledReason = null;
      channel.disabledPreviousStatus = null;
      channel.disabledPreviousConnectionStatus = null;
      return this.toPublicChannel(await channelRepository.save(channel));
    };
    if (!repositoryManager?.transaction) {
      if (process.env.NODE_ENV === 'production') {
        throw new ConflictException({
          code: 'CHANNEL_TRANSACTION_REQUIRED',
          message:
            'Channel reactivation requires a transaction-capable repository.',
        });
      }
      return reactivate();
    }
    return repositoryManager.transaction((manager) => reactivate(manager));
  }

  /**
   * Applies the non-destructive channel expiry transition. Phase 8 owns the
   * month-boundary scheduler; this method is the idempotent resource transition
   * that scheduler/coordinator code can call at that boundary.
   */
  async expireChannelCapacity(
    tenantId: string,
    baseCapacity: number | null,
    now = new Date(),
  ): Promise<{ retained: string[]; disabled: string[] }> {
    return this.tenantChannelRepository.manager.transaction(async (manager) => {
      const channelRepository = manager.getRepository(TenantChannel);
      const channels = await channelRepository
        .createQueryBuilder('channel')
        .where('channel.tenant_id = :tenantId', { tenantId })
        .orderBy('channel.created_at', 'ASC')
        .setLock('pessimistic_write')
        .getMany();
      const due = expiredTopUpChannels(channels, now).filter(
        (channel) => channel.status !== 'disabled',
      );
      if (due.length === 0) return { retained: [], disabled: [] };
      const selection = selectChannelsForRetention(
        channels,
        baseCapacity,
        channels
          .filter((channel) => channel.retentionSelected)
          .map((channel) => channel.id),
      );
      const dueIds = new Set(due.map((channel) => channel.id));
      const disabled = selection.disabled.filter((channel) =>
        dueIds.has(channel.id),
      );
      for (const channel of disabled) {
        channel.disabledPreviousStatus = channel.status;
        channel.disabledPreviousConnectionStatus = channel.connectionStatus;
        channel.status = 'disabled';
        channel.connectionStatus = 'disabled';
        channel.disabledAt = now;
        channel.disabledReason = 'capacity_expired';
        await channelRepository.save(channel);
      }
      const disabledIds = new Set(disabled.map((channel) => channel.id));
      for (const channel of due) {
        if (!disabledIds.has(channel.id)) {
          channel.entitlementOrigin = 'base_plan';
          channel.entitlementExpiresAt = null;
          await channelRepository.save(channel);
        }
      }
      return {
        retained: due
          .filter((channel) => !disabledIds.has(channel.id))
          .map((channel) => channel.id),
        disabled: disabled.map((channel) => channel.id),
      };
    });
  }

  async deleteChannel(
    tenantId: string,
    channelId: string,
    actorUserId: string,
  ): Promise<void> {
    const channel = await this.getStoredChannelById(tenantId, channelId);
    const manager = this.tenantChannelRepository.manager;

    if (channel.channelType === 'telegram') {
      try {
        const credentials = decryptProviderCredentials(
          channel.credentials,
          this.getCredentialSecret(),
        );
        if (typeof credentials.botToken === 'string' && credentials.botToken) {
          await this.callIntegrationTelegramWebhook('delete', {
            credentials,
            dropPendingUpdates: false,
          });
        }
      } catch {
        // Provider cleanup is best-effort; the local channel record is removed below.
      }
    }

    await manager.query(
      'DELETE FROM outbound_message_commands WHERE channel_id = $1',
      [channelId],
    );
    await manager.query(
      'DELETE FROM inbound_provider_events WHERE channel_id = $1',
      [channelId],
    );
    await manager.query('DELETE FROM messages WHERE channel_id = $1', [
      channelId,
    ]);
    await manager.query('DELETE FROM conversations WHERE channel_id = $1', [
      channelId,
    ]);
    await manager.query('DELETE FROM customers WHERE channel_id = $1', [
      channelId,
    ]);
    await manager.query(
      'UPDATE tenant_usage_events SET channel_id = NULL WHERE channel_id = $1',
      [channelId],
    );
    void actorUserId;
    await this.tenantChannelRepository.remove(channel);
  }

  async testChannelConnection(
    tenantId: string,
    channelId: string,
    actorUserId?: string | null,
  ) {
    const channel = await this.getStoredChannelById(tenantId, channelId);
    if (channel.status === 'disabled') {
      throw new ConflictException(
        'Capacity-disabled channels must be reactivated before testing the provider connection.',
      );
    }
    const rawCredentials = decryptProviderCredentials(
      channel.credentials,
      this.getCredentialSecret(),
    );
    const credentialValidation = validateProviderCredentials(
      channel.channelType,
      rawCredentials,
    );
    const adapterValidation = await this.channelAdapterService.validateConfig(
      channel.channelType,
      channel.configuration || {},
      rawCredentials,
    );
    const telegramLifecycle = await this.prepareTelegramLifecycle(
      channel.channelType,
      rawCredentials,
      adapterValidation,
      channel.configuration || {},
      channel.id,
    );

    const ok = credentialValidation.valid && adapterValidation.valid;
    const telegramAlreadyReady =
      channel.channelType === 'telegram' &&
      ['ready', 'connected'].includes(String(channel.connectionStatus || ''));
    channel.lastConnectionTestAt = new Date();
    channel.credentialSchema = getProviderCredentialSchema(channel.channelType);
    channel.credentialStatus = this.getCredentialStatus(
      rawCredentials,
      credentialValidation.valid,
    );
    channel.providerAccountId = telegramLifecycle.providerAccountId;
    channel.credentialsVerifiedAt =
      telegramLifecycle.credentialsVerifiedAt || channel.credentialsVerifiedAt;
    channel.connectionStatus =
      channel.channelType === 'telegram'
        ? telegramAlreadyReady
          ? channel.connectionStatus
          : telegramLifecycle.connectionStatus || 'connected'
        : ok
          ? 'connected'
          : credentialValidation.valid
            ? 'error'
            : 'pending_configuration';
    channel.status =
      channel.channelType === 'telegram'
        ? telegramAlreadyReady
          ? channel.status
          : telegramLifecycle.status === 'connected'
            ? 'active'
            : telegramLifecycle.status || 'pending'
        : ok
          ? 'active'
          : 'pending';
    channel.connectedAt = ok
      ? channel.connectedAt || new Date()
      : channel.connectedAt;
    channel.errorMessage =
      telegramLifecycle.errorMessage ||
      [...credentialValidation.errors, ...adapterValidation.errors].join(
        ', ',
      ) ||
      null;
    channel.credentials = this.encryptCredentials(
      telegramLifecycle.rawCredentials,
    );
    channel.configuration = {
      ...(telegramAlreadyReady
        ? channel.configuration || {}
        : telegramLifecycle.configuration || {}),
      webhookUrl:
        channel.webhookUrl ||
        this.buildChannelWebhookUrl(channel.channelType, channel.id),
      adapterType: channel.channelType,
      adapterValidation,
      credentialValidation,
      lastConnectionTest: {
        ok,
        testedAt: channel.lastConnectionTestAt.toISOString(),
      },
    };

    if (
      channel.channelType === 'telegram' &&
      ok &&
      !telegramAlreadyReady &&
      telegramLifecycle.rawCredentials.botToken
    ) {
      await this.registerTelegramWebhook(
        channel,
        telegramLifecycle.rawCredentials,
      );
    }

    const savedChannel = await this.tenantChannelRepository.save(channel);
    await this.logChannelAudit(
      tenantId,
      actorUserId,
      'channel_connection_tested',
      savedChannel,
      {
        ok,
        credentialStatus: savedChannel.credentialStatus,
        connectionStatus: savedChannel.connectionStatus,
        errors: [...credentialValidation.errors, ...adapterValidation.errors],
        testedAt: savedChannel.lastConnectionTestAt,
      },
    );

    return {
      ok,
      channel: this.toPublicChannel(savedChannel),
      provider: savedChannel.channelType,
      connectionStatus: savedChannel.connectionStatus,
      credentialStatus: savedChannel.credentialStatus,
      errors: [...credentialValidation.errors, ...adapterValidation.errors],
      testedAt: savedChannel.lastConnectionTestAt,
    };
  }

  async getInternalProviderVerification(channelId: string, provider: string) {
    const { normalizedProvider, normalizedChannelId } =
      this.normalizeWebhookRoute(provider, channelId);
    const channel = await this.tenantChannelRepository.findOne({
      where: { id: normalizedChannelId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.channelType !== normalizedProvider) {
      throw new BadRequestException('Channel provider mismatch');
    }

    const credentials = decryptProviderCredentials(
      channel.credentials,
      this.getCredentialSecret(),
    );

    return {
      channelId: channel.id,
      provider: normalizedProvider,
      verification: this.getProviderVerificationPayload(
        normalizedProvider,
        credentials,
        channel.configuration || {},
      ),
    };
  }

  async resolveInternalWebhookChannel(channelId: string, provider: string) {
    const { normalizedProvider, normalizedChannelId } =
      this.normalizeWebhookRoute(provider, channelId);
    const channel = await this.tenantChannelRepository.findOne({
      where: { id: normalizedChannelId },
      relations: ['tenant'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.channelType !== normalizedProvider) {
      throw new NotFoundException('Channel not found');
    }

    if (
      channel.status === 'disabled' ||
      channel.status === 'inactive' ||
      channel.connectionStatus === 'disabled'
    ) {
      return {
        channelId: channel.id,
        tenantId: channel.tenantId,
        provider: normalizedProvider,
        status: 'disabled',
        connectionStatus: 'disabled',
        webhookRegistrationStatus:
          channel.webhookRegistrationStatus || 'pending',
        disposition: 'acknowledge_without_ingestion',
        reasonCode: 'CHANNEL_DISABLED',
      };
    }

    if (
      channel.tenant &&
      ['suspended', 'deleted'].includes(
        String(channel.tenant.status || '').toLowerCase(),
      )
    ) {
      throw new NotFoundException('Channel not found');
    }

    return {
      channelId: channel.id,
      tenantId: channel.tenantId,
      provider: normalizedProvider,
      status: channel.status,
      connectionStatus: channel.connectionStatus,
      webhookRegistrationStatus: channel.webhookRegistrationStatus || 'pending',
      webhookUrl:
        channel.webhookUrl ||
        this.buildChannelWebhookUrl(channel.channelType, channel.id),
      verificationConfig: {
        mode: 'provider-specific',
      },
    };
  }

  getInternalProviderAppWebhookConfig(provider: string, routingId: string) {
    const normalizedProvider = normalizeWebhookProvider(provider);
    const normalizedRoutingId = (routingId || '').trim();

    if (normalizedProvider !== 'messenger') {
      throw new NotFoundException('Provider app configuration not found');
    }

    const configuredRoutingId =
      process.env.META_PROVIDER_APP_ROUTING_ID ||
      process.env.MESSENGER_PROVIDER_APP_ROUTING_ID;
    const appSecret =
      process.env.META_APP_SECRET || process.env.MESSENGER_APP_SECRET;
    const verifyToken =
      process.env.META_WEBHOOK_VERIFY_TOKEN ||
      process.env.MESSENGER_VERIFY_TOKEN;
    const graphApiVersion =
      process.env.META_GRAPH_API_VERSION ||
      process.env.MESSENGER_GRAPH_API_VERSION ||
      'v25.0';

    if (
      !configuredRoutingId ||
      !normalizedRoutingId ||
      normalizedRoutingId !== configuredRoutingId
    ) {
      throw new NotFoundException('Provider app configuration not found');
    }

    if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
      throw new BadRequestException('Invalid Meta Graph API version');
    }

    if (!appSecret || !verifyToken) {
      throw new NotFoundException('Provider app configuration not available');
    }

    return {
      provider: normalizedProvider,
      providerAppConfigId: 'default-meta-app',
      routingId: configuredRoutingId,
      graphApiVersion,
      status: process.env.META_APP_STATUS || 'development_only',
      webhookConfig: {
        appSecret,
        verifyToken,
      },
    };
  }

  async resolveInternalProviderAppPageChannel(
    provider: string,
    routingId: string,
    pageId: string,
  ) {
    const appConfig = this.getInternalProviderAppWebhookConfig(
      provider,
      routingId,
    );
    const normalizedPageId = (pageId || '').trim();

    if (!/^\d{2,40}$/.test(normalizedPageId)) {
      throw new NotFoundException('Webhook route not found');
    }

    const channel = await this.tenantChannelRepository
      .createQueryBuilder('channel')
      .leftJoinAndSelect('channel.tenant', 'tenant')
      .where('channel.channel_type = :provider', { provider: 'messenger' })
      .andWhere(
        '(channel.provider_account_id = :pageId OR channel.configuration ->> :pageIdKey = :pageId)',
        { pageId: normalizedPageId, pageIdKey: 'pageId' },
      )
      .andWhere(
        "(channel.configuration ->> 'providerAppRoutingId' IS NULL OR channel.configuration ->> 'providerAppRoutingId' = :routingId)",
        { routingId: appConfig.routingId },
      )
      .getOne();

    if (!channel) {
      throw new NotFoundException('Webhook route not found');
    }

    if (
      channel.status === 'disabled' ||
      channel.status === 'inactive' ||
      channel.connectionStatus === 'disabled'
    ) {
      return {
        channelId: channel.id,
        tenantId: channel.tenantId,
        provider: 'messenger',
        providerAppConfigId: appConfig.providerAppConfigId,
        providerAppRoutingId: appConfig.routingId,
        externalPageId: normalizedPageId,
        status: 'disabled',
        connectionStatus: 'disabled',
        webhookRegistrationStatus:
          channel.webhookRegistrationStatus || 'pending',
        disposition: 'acknowledge_without_ingestion',
        reasonCode: 'CHANNEL_DISABLED',
      };
    }

    if (
      channel.tenant &&
      ['suspended', 'deleted'].includes(
        String(channel.tenant.status || '').toLowerCase(),
      )
    ) {
      throw new NotFoundException('Webhook route not found');
    }

    return {
      channelId: channel.id,
      tenantId: channel.tenantId,
      provider: 'messenger',
      providerAppConfigId: appConfig.providerAppConfigId,
      providerAppRoutingId: appConfig.routingId,
      externalPageId: normalizedPageId,
      status: channel.status,
      connectionStatus: channel.connectionStatus,
      webhookRegistrationStatus: channel.webhookRegistrationStatus || 'pending',
    };
  }

  async getInternalProviderCredentials(channelId: string, provider: string) {
    const normalizedProvider = provider.trim().toLowerCase();
    const channel = await this.tenantChannelRepository.findOne({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.channelType !== normalizedProvider) {
      throw new BadRequestException('Channel provider mismatch');
    }

    return {
      channelId: channel.id,
      provider: normalizedProvider,
      credentials: decryptProviderCredentials(
        channel.credentials,
        this.getCredentialSecret(),
      ),
    };
  }

  async updateInternalProviderCredentials(
    channelId: string,
    provider: string,
    credentialUpdates: Record<string, any>,
  ) {
    const { normalizedProvider, normalizedChannelId } =
      this.normalizeWebhookRoute(provider, channelId);
    const channel = await this.tenantChannelRepository.findOne({
      where: { id: normalizedChannelId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.channelType !== normalizedProvider) {
      throw new BadRequestException('Channel provider mismatch');
    }

    const nextCredentials = {
      ...decryptProviderCredentials(
        channel.credentials,
        this.getCredentialSecret(),
      ),
      ...(credentialUpdates || {}),
    };

    channel.credentials = this.encryptCredentials(nextCredentials);
    channel.credentialSchema = getProviderCredentialSchema(channel.channelType);
    channel.credentialLastUpdatedAt = new Date();

    await this.tenantChannelRepository.save(channel);

    return {
      channelId: channel.id,
      provider: normalizedProvider,
      updated: true,
      verification: this.getProviderVerificationPayload(
        normalizedProvider,
        nextCredentials,
        channel.configuration || {},
      ),
    };
  }

  async updateInternalWebhookRegistrationStatus(
    channelId: string,
    provider: string,
    status: string | undefined,
    errorCode?: string | null,
  ) {
    const { normalizedProvider, normalizedChannelId } =
      this.normalizeWebhookRoute(provider, channelId);
    const normalizedStatus = this.normalizeWebhookRegistrationStatus(status);
    const channel = await this.tenantChannelRepository.findOne({
      where: { id: normalizedChannelId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.channelType !== normalizedProvider) {
      throw new BadRequestException('Channel provider mismatch');
    }

    const now = new Date();
    channel.webhookRegistrationStatus = normalizedStatus;
    channel.webhookRegistrationCheckedAt = now;
    channel.webhookRegistrationErrorCode =
      normalizedStatus === 'failed' && errorCode
        ? String(errorCode).slice(0, 120)
        : null;
    channel.webhookRegisteredAt =
      normalizedStatus === 'registered' ? now : channel.webhookRegisteredAt;
    if (
      normalizedStatus === 'registered' &&
      channel.connectionStatus === 'ready'
    ) {
      channel.status = 'active';
    }

    await this.tenantChannelRepository.save(channel);

    return {
      channelId: channel.id,
      provider: normalizedProvider,
      webhookRegistrationStatus: channel.webhookRegistrationStatus,
      webhookRegisteredAt: channel.webhookRegisteredAt,
      updated: true,
    };
  }

  private async getStoredChannelById(
    tenantId: string,
    channelId: string,
    manager?: EntityManager,
  ): Promise<TenantChannel> {
    const channelRepository =
      manager?.getRepository(TenantChannel) || this.tenantChannelRepository;
    const channel = await channelRepository.findOne({
      where: { id: channelId, tenantId, channelType: Not('line') },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return channel;
  }

  private toPublicChannel(
    channel: TenantChannel,
  ): TenantChannel & { credentialPreview: Record<string, any> } {
    const resolvedWebhookUrl =
      channel.webhookUrl ||
      this.buildChannelWebhookUrl(channel.channelType, channel.id);
    const credentialPreview = this.toPublicCredentialPreview(channel);
    const publicConfiguration = this.toPublicChannelConfiguration(
      channel,
      resolvedWebhookUrl,
    );
    return {
      ...channel,
      providerAccountId: null,
      webhookUrl: resolvedWebhookUrl,
      configuration: publicConfiguration,
      credentials: credentialPreview,
      credentialPreview,
      credentialSchema: this.getPublicCredentialSchema(
        channel.channelType,
        channel.credentialSchema,
      ),
    };
  }

  private toPublicCredentialPreview(
    channel: TenantChannel,
  ): Record<string, any> {
    const preview = redactProviderCredentials(
      channel.channelType,
      channel.credentials,
    );

    if (channel.channelType !== 'telegram') {
      return preview;
    }

    const fields = Array.isArray(preview.fields)
      ? preview.fields.filter((field: string) => field !== 'secretToken')
      : [];
    const values = { ...(preview.values || {}) };
    delete values.secretToken;

    return {
      ...preview,
      fields,
      values,
    };
  }

  private getPublicCredentialSchema(
    channelType: string,
    schema?: Array<ProviderCredentialSchemaField | Record<string, any>> | null,
  ): ProviderCredentialSchemaField[] {
    const resolvedSchema = (
      schema?.length ? schema : getProviderCredentialSchema(channelType)
    ) as ProviderCredentialSchemaField[];

    if (channelType !== 'telegram') {
      return resolvedSchema;
    }

    return resolvedSchema.filter((field) => field.key !== 'secretToken');
  }

  private toPublicChannelConfiguration(
    channel: TenantChannel,
    webhookUrl: string,
  ): Record<string, any> {
    const configuration = { ...(channel.configuration || {}) };
    const identity = configuration.verifiedIdentity;

    if (channel.channelType === 'telegram' && identity) {
      configuration.verifiedIdentity = {
        username:
          typeof identity.username === 'string' ? identity.username : undefined,
        firstName:
          typeof identity.firstName === 'string'
            ? identity.firstName
            : undefined,
      };
    }

    delete configuration.providerAccountId;
    delete configuration.botId;
    delete configuration.secretToken;

    return {
      ...configuration,
      webhookUrl,
    };
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

  private async sumTenantUsage(
    tenantId: string,
    usageType: 'api_request' | 'provider_message',
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

  private async countOperationalChannels(tenantId: string): Promise<number> {
    const channels = await this.tenantChannelRepository.find({
      where: { tenantId },
    });
    if (Array.isArray(channels)) {
      return channels.filter(isUsageCountedChannel).length;
    }

    // Preserve a safe legacy fallback for repository adapters that only expose
    // count() during the transition to connection-aware channel projections.
    return this.tenantChannelRepository.count({
      where: { tenantId, status: 'active' },
    });
  }

  private buildUsageMetric(
    key: 'csrs' | 'channels' | 'providerMessages',
    label: string,
    used: number,
    limit: number | null,
    refreshedAt: string,
    lastRecordedAt: string | null,
  ) {
    return {
      key,
      label,
      used,
      limit,
      remaining: limit === null ? null : Math.max(limit - used, 0),
      percentUsed:
        limit === null
          ? null
          : limit <= 0
            ? 100
            : Math.round((used / limit) * 100),
      unlimited: limit === null,
      available: true,
      refreshedAt,
      lastRecordedAt,
    };
  }

  private encryptCredentials(
    credentials: Record<string, any>,
  ): Record<string, any> {
    if (!Object.keys(credentials || {}).length) return {};
    return encryptProviderCredentials(credentials, this.getCredentialSecret());
  }

  private async prepareTelegramLifecycle(
    channelType: string,
    credentials: Record<string, any>,
    adapterValidation: Record<string, any>,
    configuration: Record<string, any>,
    existingChannelId?: string,
  ): Promise<TelegramLifecycle> {
    if (channelType !== 'telegram') {
      return {
        rawCredentials: credentials,
        providerAccountId: null,
        configuration,
      };
    }

    if (!adapterValidation.valid) {
      return {
        rawCredentials: credentials,
        providerAccountId: null,
        connectionStatus: 'error',
        status: 'pending',
        errorMessage:
          adapterValidation.status ||
          adapterValidation.errors?.join(', ') ||
          'invalid_credentials',
        configuration: {
          ...configuration,
          provider: 'telegram',
          providerApiCheckStatus: adapterValidation.status || 'failed',
          lastSafeErrorCode: adapterValidation.status || 'invalid_credentials',
        },
      };
    }

    const identity = adapterValidation.verifiedIdentity || {};
    const botId =
      typeof identity.botId === 'string'
        ? identity.botId
        : typeof identity.id === 'string'
          ? identity.id
          : null;
    if (!botId) {
      return {
        rawCredentials: credentials,
        providerAccountId: null,
        connectionStatus: 'error',
        status: 'pending',
        errorMessage: 'telegram_identity_missing',
        configuration: {
          ...configuration,
          provider: 'telegram',
          providerApiCheckStatus: 'telegram_identity_missing',
          lastSafeErrorCode: 'telegram_identity_missing',
        },
      };
    }

    await this.assertTelegramBotAvailable(botId, existingChannelId);

    const rawCredentials = {
      ...credentials,
      secretToken:
        typeof credentials.secretToken === 'string' &&
        credentials.secretToken.trim()
          ? credentials.secretToken.trim()
          : this.generateTelegramWebhookSecret(),
      botUsername:
        typeof identity.username === 'string'
          ? identity.username
          : credentials.botUsername,
    };
    const verifiedAt = new Date();

    return {
      rawCredentials,
      providerAccountId: botId,
      verifiedIdentity: {
        botId,
        username: identity.username,
        firstName: identity.firstName,
        canJoinGroups: identity.canJoinGroups,
        canReadAllGroupMessages: identity.canReadAllGroupMessages,
        supportsInlineQueries: identity.supportsInlineQueries,
      },
      credentialsVerifiedAt: verifiedAt,
      connectionStatus: 'credentials_verified',
      status: 'pending',
      errorMessage: null,
      configuration: {
        ...configuration,
        provider: 'telegram',
        verifiedIdentity: {
          botId,
          username: identity.username,
          firstName: identity.firstName,
        },
        credentialsVerifiedAt: verifiedAt.toISOString(),
        providerApiCheckStatus: 'credentials_verified',
        nextRecommendedAction: 'register_webhook',
      },
    };
  }

  private async assertTelegramBotAvailable(
    botId: string,
    existingChannelId?: string,
  ) {
    const existing = await this.tenantChannelRepository
      .createQueryBuilder('channel')
      .where('channel.channel_type = :channelType', { channelType: 'telegram' })
      .andWhere('channel.provider_account_id = :botId', { botId })
      .andWhere("channel.status NOT IN ('inactive', 'disabled')")
      .andWhere(
        "channel.connection_status NOT IN ('disabled', 'locally_disabled_provider_cleanup_pending')",
      )
      .andWhere(
        existingChannelId ? 'channel.id != :existingChannelId' : '1=1',
        {
          existingChannelId,
        },
      )
      .getOne();

    if (existing) {
      throw new ConflictException(
        'This Telegram bot is already connected to a ZayOS workspace.',
      );
    }
  }

  private generateTelegramWebhookSecret() {
    return randomBytes(32).toString('base64url');
  }

  private async registerTelegramWebhook(
    channel: TenantChannel,
    rawCredentials: Record<string, any>,
  ) {
    if (!channel.webhookUrl) {
      channel.webhookUrl = this.buildChannelWebhookUrl(
        channel.channelType,
        channel.id,
      );
    }

    channel.connectionStatus = 'webhook_registering';
    channel.webhookRegistrationStatus = 'pending';
    channel.webhookRegistrationCheckedAt = new Date();

    const result = await this.callIntegrationTelegramWebhook('register', {
      credentials: rawCredentials,
      webhookUrl: channel.webhookUrl,
      secretToken: rawCredentials.secretToken,
      allowedUpdates: ['message'],
      dropPendingUpdates: false,
      maxConnections: Number(
        process.env.TELEGRAM_WEBHOOK_MAX_CONNECTIONS || 40,
      ),
    });
    const now = new Date();
    channel.webhookRegistrationCheckedAt = now;
    channel.configuration = {
      ...(channel.configuration || {}),
      telegramWebhook: {
        status: result.status,
        checkedAt: now.toISOString(),
        urlMatches: result.webhookInfo?.url === channel.webhookUrl,
        pendingUpdateCount: result.webhookInfo?.pendingUpdateCount,
        allowedUpdates: result.webhookInfo?.allowedUpdates,
      },
    };

    if (result.ok && result.webhookInfo?.url === channel.webhookUrl) {
      channel.webhookRegistrationStatus = 'registered';
      channel.webhookRegisteredAt = now;
      channel.webhookRegistrationErrorCode = null;
      channel.connectionStatus = 'connected';
      channel.status = 'active';
      channel.connectedAt = now;
      channel.errorMessage = null;
      return;
    }

    channel.webhookRegistrationStatus = 'failed';
    channel.webhookRegistrationErrorCode = String(
      result.status ||
        result.providerError?.code ||
        'webhook_registration_failed',
    ).slice(0, 120);
    channel.connectionStatus = 'error';
    channel.status = 'pending';
    channel.errorMessage = channel.webhookRegistrationErrorCode;
  }

  private async callIntegrationTelegramWebhook(
    operation: 'register' | 'info' | 'delete',
    body: Record<string, any>,
  ) {
    const integrationUrl = process.env.INTEGRATION_SERVICE_URL;
    if (!integrationUrl) {
      return {
        ok: false,
        status: 'integration_service_unavailable',
        providerError: { code: 'integration_service_unavailable' },
      };
    }

    const response = await fetch(
      `${integrationUrl.replace(/\/$/, '')}/providers/telegram/webhook/${operation}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...serviceAuthHeaders({
            audience: SERVICE_IDENTITIES.INTEGRATION,
            subject: SERVICE_IDENTITIES.CORE,
            scopes: [SERVICE_SCOPES.WEBHOOK_REGISTER],
          }),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(
          Number.isFinite(
            Number(process.env.TELEGRAM_WEBHOOK_REQUEST_TIMEOUT_MS),
          ) && Number(process.env.TELEGRAM_WEBHOOK_REQUEST_TIMEOUT_MS) > 0
            ? Number(process.env.TELEGRAM_WEBHOOK_REQUEST_TIMEOUT_MS)
            : 10_000,
        ),
      },
    );
    try {
      return await response.json();
    } catch {
      return {
        ok: false,
        status: `integration_http_${response.status}`,
        providerError: { code: `integration_http_${response.status}` },
      };
    }
  }

  private getCredentialStatus(
    credentials: Record<string, any>,
    isValid: boolean,
  ): string {
    if (!Object.keys(credentials || {}).length || !isValid)
      return 'missing_required';
    return 'encrypted';
  }

  private getConnectionStatus(
    credentialsValid: boolean,
    adapterValid: boolean,
  ): string {
    if (!credentialsValid) return 'pending_configuration';
    return adapterValid ? 'ready' : 'error';
  }

  private getCredentialSecret(): string {
    const secret =
      process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!secret) {
      throw new Error(
        'PROVIDER_CREDENTIAL_ENCRYPTION_KEY or JWT_SECRET is required',
      );
    }
    return secret;
  }

  private mergeCredentialUpdates(
    currentCredentials: Record<string, any>,
    credentialUpdates: Record<string, any>,
  ): Record<string, any> {
    const nextCredentials = { ...(currentCredentials || {}) };

    for (const [key, value] of Object.entries(credentialUpdates || {})) {
      if (value === null) {
        delete nextCredentials[key];
        continue;
      }

      if (value === undefined) {
        continue;
      }

      if (typeof value === 'string' && value.trim() === '') {
        continue;
      }

      nextCredentials[key] = value;
    }

    return nextCredentials;
  }

  private async refreshStaleMessengerWebhookUrls(channels: TenantChannel[]) {
    const dirty: TenantChannel[] = [];
    for (const channel of channels) {
      if (
        channel.channelType === 'messenger' &&
        this.isStaleMessengerWebhookUrl(channel.webhookUrl)
      ) {
        channel.webhookUrl = this.buildChannelWebhookUrl(
          channel.channelType,
          channel.id,
        );
        channel.configuration = {
          ...(channel.configuration || {}),
          webhookUrl: channel.webhookUrl,
        };
        dirty.push(channel);
      }
    }

    if (dirty.length) {
      await this.tenantChannelRepository.save(dirty);
    }
  }

  private isStaleMessengerWebhookUrl(url: string | null): boolean {
    if (!url || !url.includes('/webhooks/messenger/')) {
      return false;
    }

    const segment =
      url.split('/webhooks/messenger/')[1]?.split(/[?#]/)[0] || '';
    return UUID_PATTERN.test(segment);
  }

  private buildChannelWebhookUrl(channelType: string, channelId: string) {
    const baseUrl = this.getWebhookPublicBaseUrl();
    return buildProviderWebhookUrl({
      baseUrl,
      provider: channelType,
      channelId,
      nodeEnv: process.env.NODE_ENV,
    });
  }

  private normalizeWebhookRoute(provider: string, channelId: string) {
    try {
      return {
        normalizedProvider: normalizeWebhookProvider(provider),
        normalizedChannelId: normalizeWebhookChannelId(channelId),
      };
    } catch {
      throw new BadRequestException('Invalid webhook route');
    }
  }

  private normalizeWebhookRegistrationStatus(status: string | undefined) {
    const normalized = (status || '').trim().toLowerCase();
    if (
      [
        'pending',
        'registered',
        'failed',
        'requires_reregistration',
        'awaiting_first_event',
      ].includes(normalized)
    ) {
      return normalized;
    }
    throw new BadRequestException('Invalid webhook registration status');
  }

  private getWebhookPublicBaseUrl() {
    return resolvePublicBaseUrl(process.env, 'WEBHOOK_PUBLIC_BASE_URL', {
      fallbackEnvVarNames: [
        'WEBHOOK_HANDLER_PUBLIC_URL',
        'PUBLIC_WEBHOOK_BASE_URL',
      ],
    }) as string;
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

  private getProviderVerificationPayload(
    provider: string,
    credentials: Record<string, any>,
    configuration: Record<string, any>,
  ) {
    if (provider === 'telegram') {
      return {
        secretToken:
          credentials.secretToken || configuration.secretToken || null,
      };
    }

    if (provider === 'tiktok') {
      return {
        clientSecret: credentials.clientSecret || null,
      };
    }

    if (provider === 'viber') {
      return {
        authToken: credentials.authToken || null,
      };
    }

    return {};
  }

  private async resolveChannelCapacityForTenant(
    tenantId: string,
    manager?: EntityManager,
  ): Promise<{
    baseCapacity: number | null;
    topUpCapacity: number;
    effectiveCapacity: number | null;
    operationalCount: number;
    canCreate: boolean;
    originForNewChannel: 'base_plan' | 'top_up';
    periodEndAt: Date | null;
  }> {
    if (isPeriodScopedEnforcementEnabled()) {
      if (!this.subscriptionEntitlementService) {
        throw new ConflictException({
          code: 'SUBSCRIPTION_PERIOD_RESOLVER_UNAVAILABLE',
          message: 'Period-scoped channel capacity is not configured.',
        });
      }
      const entitlement =
        await this.subscriptionEntitlementService.resolveActiveSubscriptionEntitlement(
          tenantId,
          manager ? { manager } : undefined,
        );
      const channels = manager
        ? await manager
            .getRepository(TenantChannel)
            .find({ where: { tenantId } })
        : await this.tenantChannelRepository.find({ where: { tenantId } });
      const decision = resolveChannelCapacity({
        baseCapacity:
          entitlement.effectiveLimits.channel_slots === null
            ? null
            : entitlement.baseLimits.channel_slots,
        topUpCapacity: entitlement.activeTopUpComponentTotals.channel_slots,
        channels,
      });
      return { ...decision, periodEndAt: entitlement.periodEndAt };
    }

    const tenant = manager
      ? await manager.getRepository(Tenant).findOne({ where: { id: tenantId } })
      : await this.getTenantSettings(tenantId);
    const plan = tenant?.subscriptionPlanId
      ? manager
        ? await manager.getRepository(SubscriptionPlan).findOne({
            where: { id: tenant.subscriptionPlanId },
          })
        : await this.subscriptionPlanRepository.findOne({
            where: { id: tenant.subscriptionPlanId },
          })
      : null;
    const baseCapacity = this.effectiveLimit(
      tenant?.customChannelLimit,
      plan?.maxChannels,
    );
    const used = manager
      ? await manager
          .getRepository(TenantChannel)
          .count({ where: { tenantId } })
      : await this.tenantChannelRepository.count({ where: { tenantId } });
    const decision = resolveChannelCapacity({
      baseCapacity,
      topUpCapacity: 0,
      channels: Array.from({ length: used }, (_, index) => ({
        status: 'active',
        id: `legacy-${index}`,
        entitlementOrigin: 'base_plan' as const,
        createdAt: new Date(0),
      })),
    });
    return { ...decision, periodEndAt: null };
  }

  private async assertPlanLimitAvailable(
    tenantId: string,
    limitType: 'csrs' | 'channels',
  ) {
    const tenant = await this.getTenantSettings(tenantId);

    // The purchased-period ledger is authoritative for capacity limits. Read
    // the effective limit from the active period's frozen snapshot first and
    // fall back to the legacy tenant/plan fields only when no period exists
    // (trial/legacy tenants).
    let periodLimit: number | null | undefined;
    if (this.subscriptionEntitlementService && limitType === 'csrs') {
      try {
        const entitlement =
          await this.subscriptionEntitlementService.resolveActiveSubscriptionEntitlement(
            tenantId,
          );
        periodLimit = entitlement.effectiveLimits.team_members;
      } catch (error) {
        if (error instanceof MissingActivePeriodError) {
          periodLimit = undefined;
        } else {
          throw error;
        }
      }
    }
    const plan = tenant.subscriptionPlanId
      ? await this.subscriptionPlanRepository.findOne({
          where: { id: tenant.subscriptionPlanId },
        })
      : null;
    const limit =
      periodLimit !== undefined && periodLimit !== null
        ? periodLimit
        : limitType === 'csrs'
          ? this.effectiveLimit(tenant.customCsrLimit, plan?.maxCsrs)
          : this.effectiveLimit(tenant.customChannelLimit, plan?.maxChannels);

    if (limit === null) return;

    const used =
      limitType === 'csrs'
        ? await this.tenantUserRepository.count({ where: { tenantId } })
        : await this.tenantChannelRepository.count({ where: { tenantId } });

    if (used >= limit) {
      throw new ConflictException({
        code: `${limitType.toUpperCase()}_PLAN_LIMIT_REACHED`,
        message: `Tenant ${limitType} limit reached`,
        limitType,
        limit,
        used,
        planId: tenant.subscriptionPlanId,
      });
    }
  }

  private async assertProviderAllowed(
    tenantId: string,
    channelType: string,
  ): Promise<void> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Use subscription-period entitlement if available – source of truth
    if (this.subscriptionEntitlementService) {
      let entitlement: ResolvedSubscriptionEntitlement;
      try {
        entitlement =
          await this.subscriptionEntitlementService.resolveActiveSubscriptionEntitlement(
            tenantId,
          );
      } catch (error) {
        if (error instanceof MissingActivePeriodError) {
          throw new ConflictException({
            code: 'NO_ACTIVE_SUBSCRIPTION_PERIOD',
            message: 'No active subscription period – cannot create channel.',
          });
        }
        throw error;
      }
      const allowed = Array.isArray(entitlement.planSnapshot.allowedProviders)
        ? entitlement.planSnapshot.allowedProviders
        : [];
      // Empty list means unrestricted – same semantics as before
      if (allowed.length && !allowed.includes(channelType)) {
        throw new ConflictException({
          code: 'PROVIDER_NOT_ALLOWED_IN_PLAN',
          message: `Provider ${channelType} is not allowed in the tenant's plan (${entitlement.planId})`,
          channelType,
          allowedProviders: allowed,
          planId: entitlement.planId,
          // Plan name is catalog information; optional – omitted for brevity
        });
      }
      return; // allowed (or unrestricted)
    }

    // Legacy fallback (should rarely run in production)
    const entitlement =
      await this.entitlementService?.getTenantEntitlement(tenantId);
    const planId = entitlement?.planId || tenant.subscriptionPlanId;
    if (!planId) return;
    const plan = await this.subscriptionPlanRepository.findOne({
      where: { id: planId },
    });
    if (!plan) return;
    const allowed = Array.isArray(plan.allowedProviders)
      ? plan.allowedProviders
      : [];
    if (allowed.length && !allowed.includes(channelType)) {
      throw new ConflictException({
        code: 'PROVIDER_NOT_ALLOWED_IN_PLAN',
        message: `Provider ${channelType} is not allowed in the tenant's plan (${plan.name} allows: ${allowed.join(', ')})`,
        channelType,
        allowedProviders: allowed,
        planId: plan.id,
        planName: plan.name,
      });
    }
  }

  async getTenantAllowedProviders(tenantId: string): Promise<string[]> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) return [];

    if (this.subscriptionEntitlementService) {
      // Resolve entitlement – MissingActivePeriodError will propagate to controller
      const entitlement =
        await this.subscriptionEntitlementService.resolveActiveSubscriptionEntitlement(
          tenantId,
        );
      return Array.isArray(entitlement.planSnapshot.allowedProviders)
        ? entitlement.planSnapshot.allowedProviders
        : [];
    }

    // Legacy fallback (deprecated) – use legacy entitlement or tenant plan ID
    const entitlement =
      await this.entitlementService?.getTenantEntitlement(tenantId);
    const planId = entitlement?.planId || tenant.subscriptionPlanId;
    if (!planId) return [];
    const plan = await this.subscriptionPlanRepository.findOne({
      where: { id: planId },
    });
    if (!plan || !Array.isArray(plan.allowedProviders)) return [];
    return plan.allowedProviders;
  }

  private assertRoleManagementAllowed(
    actorRole?: string,
    nextRole?: string,
    currentRole?: string,
  ) {
    if (
      nextRole &&
      !tenantRoleValues.includes(nextRole as (typeof tenantRoleValues)[number])
    ) {
      throw new BadRequestException('Unsupported tenant role');
    }

    if (
      currentRole &&
      !tenantRoleValues.includes(
        currentRole as (typeof tenantRoleValues)[number],
      )
    ) {
      throw new BadRequestException('Unsupported tenant role');
    }

    if (actorRole !== 'supervisor') {
      return;
    }

    if (nextRole && ['owner', 'admin'].includes(nextRole)) {
      throw new ForbiddenException(
        'Managers cannot assign owner or admin access',
      );
    }

    if (currentRole && ['owner', 'admin'].includes(currentRole)) {
      throw new ForbiddenException(
        'Managers cannot modify or remove owner or admin accounts',
      );
    }
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

  // Canned Responses Management
  async getAllCannedResponses(
    tenantId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<CannedResponse>> {
    const { page = 1, limit = 10, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.cannedResponseRepository
      .createQueryBuilder('response')
      .where('response.tenant_id = :tenantId', { tenantId });

    if (search) {
      queryBuilder.andWhere(
        'response.title ILIKE :search OR response.content ILIKE :search',
        {
          search: `%${search}%`,
        },
      );
    }

    queryBuilder.orderBy(
      cannedResponseSortColumns[sortBy || 'createdAt'] || 'response.createdAt',
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

  async getCannedResponseById(
    tenantId: string,
    responseId: string,
  ): Promise<CannedResponse> {
    const response = await this.cannedResponseRepository.findOne({
      where: { id: responseId, tenantId },
    });

    if (!response) {
      throw new NotFoundException('Canned response not found');
    }

    return response;
  }

  async createCannedResponse(
    tenantId: string,
    createResponseDto: CreateCannedResponseDto,
    createdBy: string,
  ): Promise<CannedResponse> {
    // Check if shortcut already exists
    if (createResponseDto.shortcut) {
      const existingResponse = await this.cannedResponseRepository.findOne({
        where: { shortcut: createResponseDto.shortcut, tenantId },
      });

      if (existingResponse) {
        throw new ConflictException('Shortcut already exists');
      }
    }

    const response = this.cannedResponseRepository.create({
      ...createResponseDto,
      tenantId,
      createdBy,
      visibility: createResponseDto.visibility || 'public',
    });

    return this.cannedResponseRepository.save(response);
  }

  async updateCannedResponse(
    tenantId: string,
    responseId: string,
    updateResponseDto: Partial<CreateCannedResponseDto>,
  ): Promise<CannedResponse> {
    const response = await this.getCannedResponseById(tenantId, responseId);
    const shortcut = updateResponseDto.shortcut?.trim();
    if (shortcut) {
      const existingResponse = await this.cannedResponseRepository.findOne({
        where: { shortcut, tenantId },
      });
      if (existingResponse && existingResponse.id !== responseId) {
        throw new ConflictException('Shortcut already exists');
      }
    }
    Object.assign(response, { ...updateResponseDto, shortcut });
    return this.cannedResponseRepository.save(response);
  }

  async deleteCannedResponse(
    tenantId: string,
    responseId: string,
  ): Promise<void> {
    const response = await this.getCannedResponseById(tenantId, responseId);
    await this.cannedResponseRepository.remove(response);
  }

  // Product Management
  async getAllProductCategories(tenantId: string): Promise<ProductCategory[]> {
    return this.productCategoryRepository.find({
      where: { tenantId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async getAllProducts(
    tenantId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<Product>> {
    const { page = 1, limit = 100, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.tenant_id = :tenantId', { tenantId });

    if (search) {
      queryBuilder.andWhere(
        'product.name ILIKE :search OR product.sku ILIKE :search',
        {
          search: `%${search}%`,
        },
      );
    }

    queryBuilder.orderBy(
      productSortColumns[sortBy || 'createdAt'] || 'product.createdAt',
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

  async getProductById(tenantId: string, productId: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId, tenantId },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async logChannelAudit(
    tenantId: string,
    actorUserId: string | null | undefined,
    action: string,
    channel: TenantChannel,
    newValues: Record<string, any>,
    manager?: EntityManager,
  ) {
    await this.auditLogService.logTenantUserAction(
      tenantId,
      actorUserId || null,
      {
        action,
        resourceType: 'tenant_channel',
        resourceId: channel.id,
        newValues: {
          channelType: channel.channelType,
          channelName: channel.channelName,
          ...newValues,
        },
      },
      manager,
    );
  }
}
