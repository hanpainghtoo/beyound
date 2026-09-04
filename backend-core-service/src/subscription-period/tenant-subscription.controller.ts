import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Repository } from 'typeorm';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AllowExpiredAccess } from '../common/decorators/allow-expired-access.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { tenantBillingRoles } from '../common/constants/tenant-roles';
import { isUsageCountedChannel } from '../channel/channel-capacity.util';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { isPeriodScopedEnforcementEnabled } from './subscription-entitlement-flag.util';
import { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';
import {
  MissingActivePeriodError,
  type ResolvedSubscriptionEntitlement,
} from './subscription-entitlement.types';

@ApiTags('Tenant - Subscription Periods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
@Controller('tenant/subscription')
export class TenantSubscriptionController {
  constructor(
    @InjectRepository(TenantSubscriptionPeriod)
    private readonly periodRepository: Repository<TenantSubscriptionPeriod>,
    @InjectRepository(TenantUsageEvent)
    private readonly usageRepository: Repository<TenantUsageEvent>,
    @InjectRepository(TenantChannel)
    private readonly channelRepository: Repository<TenantChannel>,
    @InjectRepository(TenantUser)
    private readonly userRepository: Repository<TenantUser>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly entitlementService: SubscriptionEntitlementService,
  ) {}

  @ApiOperation({
    summary: 'Read the tenant subscription period queue and active entitlement',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription queue returned without payment secrets',
  })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @Get('periods')
  async getPeriods(@CurrentTenant() currentTenant: { id: string }) {
    const periods = await this.periodRepository.find({
      where: { tenantId: currentTenant.id },
      order: { sequenceNumber: 'ASC' },
    });

    let entitlement: ResolvedSubscriptionEntitlement | null = null;
    let entitlementError: { code: string; message: string } | null = null;
    try {
      entitlement =
        await this.entitlementService.resolveActiveSubscriptionEntitlement(
          currentTenant.id,
        );
    } catch (error) {
      if (error instanceof MissingActivePeriodError) {
        entitlementError = { code: error.code, message: error.message };
      } else {
        throw error;
      }
    }

    const activePeriod = entitlement
      ? periods.find((period) => period.id === entitlement.activePeriodId)
      : null;
    const periodStart =
      activePeriod?.monthStartAt || activePeriod?.periodStartAt || null;
    const periodEnd =
      activePeriod?.monthEndAt || activePeriod?.periodEndAt || null;
    const [usageRows, activeChannels, activeTeamMembers, tenant] =
      await Promise.all([
        entitlement
          ? this.usageRepository
              .createQueryBuilder('usage')
              .select('usage.direction', 'direction')
              .addSelect('COALESCE(SUM(usage.quantity), 0)', 'total')
              .where('usage.tenant_id = :tenantId', {
                tenantId: currentTenant.id,
              })
              .andWhere('usage.subscription_period_id = :periodId', {
                periodId: entitlement.activePeriodId,
              })
              .andWhere('usage.usage_type IN (:...usageTypes)', {
                usageTypes: ['api_request', 'provider_message'],
              })
              .andWhere("usage.direction IN ('inbound', 'outbound', 'request')")
              .andWhere(
                "COALESCE(usage.metadata ->> 'billable', 'true') <> 'false'",
              )
              .groupBy('usage.direction')
              .getRawMany<{ direction: string; total: string }>()
          : Promise.resolve([]),
        this.channelRepository
          .find({ where: { tenantId: currentTenant.id } })
          .then((channels) => channels.filter(isUsageCountedChannel).length),
        this.userRepository.count({
          where: { tenantId: currentTenant.id, status: 'active' },
        }),
        this.tenantRepository.findOne({ where: { id: currentTenant.id } }),
      ]);
    const usageByDirection = new Map(
      usageRows.map((row) => [row.direction, Number(row.total || 0)]),
    );
    const storageState = (tenant?.storageCapacityState || {}) as {
      usedBytes?: number | null;
      effectiveCapacityGb?: number | null;
      overStorageLimit?: boolean;
      expiresAt?: string | null;
    };
    const periodUsage = {
      usageSource: isPeriodScopedEnforcementEnabled()
        ? 'period_scoped'
        : 'not_attributed',
      periodStart,
      periodEnd,
      inboundMessages: usageByDirection.get('inbound') || 0,
      outboundMessages: usageByDirection.get('outbound') || 0,
      apiRequests: usageByDirection.get('request') || 0,
      activeChannels,
      activeTeamMembers,
      storage: {
        usedBytes: storageState.usedBytes ?? null,
        effectiveCapacityGb: storageState.effectiveCapacityGb ?? null,
        overStorageLimit: storageState.overStorageLimit ?? false,
        expiresAt: storageState.expiresAt ?? periodEnd,
      },
    };

    return {
      tenantId: currentTenant.id,
      activePeriodId: entitlement?.activePeriodId ?? null,
      entitlement,
      entitlementError,
      periodUsage,
      periods: periods.map((period) => ({
        id: period.id,
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
      })),
    };
  }
}
