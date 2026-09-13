import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AllowExpiredAccess } from '../common/decorators/allow-expired-access.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';
import { tenantBillingRoles } from '../common/constants/tenant-roles';
import { SubscriptionAddOnPurchaseService } from './subscription-add-on-purchase.service';
import { CreateAddOnPurchaseDto } from './dto/create-add-on-purchase.dto';
import { AddOnPurchaseResponseDto } from './dto/add-on-purchase-response.dto';

/**
 * Tenant-facing top-up purchases (Plan 9 Phase 4, task 4.9).
 *
 * A workspace billing user can create a purchase request, list their own
 * purchases, and read one purchase. Every purchase targets the server-resolved
 * active paid period; tenant ownership is enforced by TenantGuard + service
 * scoping. Payment confirmation and cancellation are operator-side only.
 */
@ApiTags('Tenant - Top-Up Purchases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
@Controller('tenant/add-on-purchases')
export class TenantAddOnPurchaseController {
  constructor(private purchaseService: SubscriptionAddOnPurchaseService) {}

  @ApiOperation({
    summary:
      'Create a pending top-up bundle purchase against the active paid period',
  })
  @ApiResponse({ status: 201, type: AddOnPurchaseResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Trial, no active paid period, or inactive product',
  })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @AuditLog({
    action: 'add_on_purchase_created',
    resourceType: 'subscription_add_on_purchase',
  })
  @Post()
  async createPurchase(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAddOnPurchaseDto,
  ): Promise<AddOnPurchaseResponseDto> {
    return this.purchaseService.createPurchase(
      tenant.id,
      {
        productId: dto.productId,
        requestedPeriodId: dto.subscriptionPeriodId,
        billingRecordId: dto.billingRecordId,
        idempotencyKey: dto.idempotencyKey,
      },
      {
        actor: { type: 'tenant_user', id: user.id },
        source: 'workspace',
        idempotencyKey: dto.idempotencyKey,
      },
    );
  }

  @ApiOperation({ summary: 'List the tenant\u2019s top-up purchases' })
  @ApiResponse({ status: 200, type: AddOnPurchaseResponseDto, isArray: true })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @Get()
  async listPurchases(
    @CurrentTenant() tenant: { id: string },
    @Query('activeOnly') activeOnly?: string,
  ): Promise<AddOnPurchaseResponseDto[]> {
    return this.purchaseService.listPurchasesForTenant(
      tenant.id,
      activeOnly === 'true',
    );
  }

  @ApiOperation({ summary: 'Get one of the tenant\u2019s top-up purchases' })
  @ApiResponse({ status: 200, type: AddOnPurchaseResponseDto })
  @ApiResponse({ status: 404, description: 'Purchase not found' })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @Get(':id')
  async getPurchase(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) purchaseId: string,
  ): Promise<AddOnPurchaseResponseDto> {
    return this.purchaseService.getPurchaseForTenant(tenant.id, purchaseId);
  }
}
