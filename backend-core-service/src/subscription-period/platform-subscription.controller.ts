import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { SubscriptionEntitlementService } from './subscription-entitlement.service';
import { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import { SubscriptionPeriodEvent } from './entities/subscription-period-event.entity';
import { SubscriptionEntitlementReconciliationService } from './subscription-entitlement-reconciliation.service';
import {
  MissingActivePeriodError,
  type ResolvedSubscriptionEntitlement,
} from './subscription-entitlement.types';

const subscriptionReaderRoles = [
  'super_admin',
  'ops_admin',
  'it_admin',
  'finance_viewer',
  'support_viewer',
  'read_only',
] as const;

/**
 * Operator read-only views over the purchased-period entitlement ledger
 * (Plan 9 Phase 5, tasks 5.9/5.10). Both routes are shadow/debugging aids for
 * the enforcement cutover: the resolved effective entitlement and the
 * legacy-vs-period-scoped reconciliation report. Neither route mutates data.
 */
@ApiTags('Platform Admin - Subscription Entitlement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform-admin/subscription')
export class PlatformSubscriptionController {
  constructor(
    private readonly entitlementService: SubscriptionEntitlementService,
    private readonly reconciliationService: SubscriptionEntitlementReconciliationService,
    @InjectRepository(TenantSubscriptionPeriod)
    private readonly periodRepository: Repository<TenantSubscriptionPeriod>,
    @InjectRepository(SubscriptionPeriodEvent)
    private readonly periodEventRepository: Repository<SubscriptionPeriodEvent>,
  ) {}

  @ApiOperation({
    summary:
      'Resolve a tenant effective entitlement (base + active top-up limits) for the active paid period',
  })
  @ApiResponse({
    status: 200,
    description:
      'Resolved entitlement, or a stable MissingActivePeriodError code when no operational paid period exists.',
  })
  @Roles(...subscriptionReaderRoles)
  @Get('entitlement')
  async getEntitlement(@Query('tenantId', ParseUUIDPipe) tenantId: string) {
    // The resolver throws a domain error with a stable code; map it to a
    // structured 409 so operators (and future billing consumers) receive the
    // machine-readable `code` instead of a bare 500.
    try {
      return await this.entitlementService.resolveActiveSubscriptionEntitlement(
        tenantId,
      );
    } catch (error) {
      if (error instanceof MissingActivePeriodError) {
        throw new HttpException(
          { code: error.code, message: error.message },
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Read a tenant subscription period queue for operators',
  })
  @Roles(...subscriptionReaderRoles)
  @Get('periods')
  async getPeriods(@Query('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.getPeriodsInternal(tenantId);
  }

  private async getPeriodsInternal(tenantId: string) {
    const periods = await this.periodRepository.find({
      where: { tenantId },
      order: { sequenceNumber: 'ASC' },
    });
    let entitlement: ResolvedSubscriptionEntitlement | null = null;
    let entitlementError: { code: string; message: string } | null = null;
    try {
      entitlement =
        await this.entitlementService.resolveActiveSubscriptionEntitlement(
          tenantId,
        );
    } catch (error) {
      if (error instanceof MissingActivePeriodError) {
        entitlementError = { code: error.code, message: error.message };
      } else {
        throw error;
      }
    }
    return this.toPeriodsResponse(
      tenantId,
      periods,
      entitlement,
      entitlementError,
    );
  }
  private toPeriodsResponse(
    tenantId: string,
    periods: TenantSubscriptionPeriod[],
    entitlement: ResolvedSubscriptionEntitlement | null,
    entitlementError: { code: string; message: string } | null,
  ) {
    return {
      tenantId,
      activePeriodId: entitlement?.activePeriodId ?? null,
      entitlement,
      entitlementError,
      periods: periods.map((period) => ({
        id: period.id,
        tenantId: period.tenantId,
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

  @ApiOperation({
    summary: 'Read the audit/event trail for one tenant subscription period',
  })
  @ApiResponse({
    status: 200,
    description:
      'Ordered period events (activation, expiry, admin approval, upgrades) without payment secrets.',
  })
  @Roles(...subscriptionReaderRoles)
  @Get('periods/:periodId/events')
  async getPeriodEvents(
    @Query('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ) {
    const period = await this.periodRepository.findOne({
      where: { id: periodId, tenantId },
    });
    if (!period) {
      throw new HttpException(
        { code: 'PERIOD_NOT_FOUND', message: 'Subscription period not found.' },
        HttpStatus.NOT_FOUND,
      );
    }
    const events = await this.periodEventRepository.find({
      where: { subscriptionPeriodId: periodId, tenantId },
      order: { createdAt: 'ASC' },
    });
    return {
      periodId,
      tenantId,
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        actorType: event.actorType,
        actorId: event.actorId,
        source: event.source,
        reason: event.reason,
        createdAt: event.createdAt,
      })),
    };
  }

  @ApiOperation({
    summary:
      'Shadow/reconciliation report comparing legacy calendar-month totals with period-scoped totals',
  })
  @ApiResponse({
    status: 200,
    description:
      'Legacy vs period-scoped usage totals and any mismatching dimensions.',
  })
  @Roles(...subscriptionReaderRoles)
  @Get('reconciliation')
  async getReconciliation(@Query('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.reconciliationService.generate(tenantId);
  }
}
