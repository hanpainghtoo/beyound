import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  Request,
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
import { AuditLog } from '../logging/decorators/audit-log.decorator';
import { SubscriptionAddOnPurchaseService } from './subscription-add-on-purchase.service';
import { AddOnPurchaseResponseDto } from './dto/add-on-purchase-response.dto';
import {
  CancelAddOnPurchaseDto,
  ConfirmAddOnPurchaseDto,
} from './dto/confirm-add-on-purchase.dto';

const purchaseReaderRoles = [
  'super_admin',
  'ops_admin',
  'it_admin',
  'finance_viewer',
  'support_viewer',
  'read_only',
] as const;
// Payment confirmation reuses the existing payment-proof review permission
// set (task 4.6): the same roles that confirm a billing payment confirm a
// top-up purchase. No refund/cancel-of-paid action is exposed.
const purchaseConfirmRoles = [
  'super_admin',
  'ops_admin',
  'finance_viewer',
] as const;
const purchaseAdminRoles = ['super_admin', 'ops_admin'] as const;

/**
 * Operator-facing top-up purchase ledger (Plan 9 Phase 4, tasks 4.6/4.9).
 *
 * Operators can list/detail purchases across tenants, confirm a pending
 * purchase's payment (which grants the bundle exactly once and never activates
 * a prepaid subscription period), and cancel *pending* purchases only. Refund
 * actions are intentionally absent in this release.
 */
@ApiTags('Platform Admin - Top-Up Purchases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform-admin/add-on-purchases')
export class PlatformAddOnPurchaseController {
  constructor(private purchaseService: SubscriptionAddOnPurchaseService) {}

  @ApiOperation({
    summary:
      'List top-up purchases (optionally filtered by tenantId for operators)',
  })
  @ApiResponse({ status: 200, type: AddOnPurchaseResponseDto, isArray: true })
  @Roles(...purchaseReaderRoles)
  @Get()
  async listPurchases(
    @Query('tenantId') tenantId?: string,
  ): Promise<AddOnPurchaseResponseDto[]> {
    return this.purchaseService.listPurchasesForOperator(tenantId || undefined);
  }

  @ApiOperation({ summary: 'Get a top-up purchase by id' })
  @ApiResponse({ status: 200, type: AddOnPurchaseResponseDto })
  @ApiResponse({ status: 404, description: 'Purchase not found' })
  @Roles(...purchaseReaderRoles)
  @Get(':id')
  async getPurchase(
    @Param('id', ParseUUIDPipe) purchaseId: string,
  ): Promise<AddOnPurchaseResponseDto> {
    return this.purchaseService.getPurchaseById(purchaseId);
  }

  @ApiOperation({
    summary:
      'Confirm a pending purchase payment (grants the bundle once; never activates prepaid periods early)',
  })
  @ApiResponse({ status: 200, type: AddOnPurchaseResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Not pending or invalid payment evidence',
  })
  @Roles(...purchaseConfirmRoles)
  @AuditLog({
    action: 'add_on_purchase_payment_confirmed',
    resourceType: 'subscription_add_on_purchase',
  })
  @Post(':id/confirm-payment')
  async confirmPayment(
    @Request() req,
    @Param('id', ParseUUIDPipe) purchaseId: string,
    @Body() dto: ConfirmAddOnPurchaseDto,
  ): Promise<AddOnPurchaseResponseDto> {
    const purchase = await this.purchaseService.getPurchaseById(purchaseId);
    return this.purchaseService.confirmPurchasePayment(
      purchase.tenantId,
      purchaseId,
      {
        actor: { type: 'platform_admin', id: req.user?.id },
        source: 'platform_admin',
        reason: dto.note || 'Top-up payment confirmed by operator',
        idempotencyKey: dto.idempotencyKey,
      },
    );
  }

  @ApiOperation({
    summary: 'Cancel a pending (unpaid) top-up purchase — no refunds',
  })
  @ApiResponse({ status: 200, type: AddOnPurchaseResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Paid purchases cannot be cancelled',
  })
  @Roles(...purchaseAdminRoles)
  @AuditLog({
    action: 'add_on_purchase_cancelled',
    resourceType: 'subscription_add_on_purchase',
  })
  @Post(':id/cancel')
  async cancelPurchase(
    @Request() req,
    @Param('id', ParseUUIDPipe) purchaseId: string,
    @Body() dto: CancelAddOnPurchaseDto,
  ): Promise<AddOnPurchaseResponseDto> {
    const purchase = await this.purchaseService.getPurchaseById(purchaseId);
    return this.purchaseService.cancelPurchase(purchase.tenantId, purchaseId, {
      actor: { type: 'platform_admin', id: req.user?.id },
      source: 'platform_admin',
      reason: dto.reason || 'Pending top-up purchase cancelled by operator',
    });
  }
}
