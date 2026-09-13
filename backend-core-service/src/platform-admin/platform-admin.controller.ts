import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { PlatformAdminService } from './platform-admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';

import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { TenantApprovalDto } from './dto/tenant-approval.dto';
import { PlatformAdminStatsDto } from './dto/platform-admin-stats.dto';
import {
  ChangeTenantSubscriptionPlanDto,
  CreateTenantBillingRecordDto,
  ReviewPaymentProofDto,
  SendTenantBillingReminderDto,
  UpdateTenantBillingRecordDto,
} from './dto/tenant-billing-record.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ChangeTenantStatusDto } from './dto/change-tenant-status.dto';
import { ManagerWebhookRegistrationDto } from './dto/manager-webhook-registration.dto';
import { TelegramManagedBotService } from '../tenant/telegram-managed-bot.service';

const platformViewerRoles = [
  'super_admin',
  'ops_admin',
  'it_admin',
  'finance_viewer',
  'support_viewer',
  'read_only',
] as const;
const platformSupportReadRoles = [
  'super_admin',
  'ops_admin',
  'it_admin',
  'support_viewer',
  'read_only',
] as const;
const platformFinanceReadRoles = [
  'super_admin',
  'ops_admin',
  'finance_viewer',
  'read_only',
] as const;

@ApiTags('Public Catalog')
@Controller('public')
export class PublicCatalogController {
  constructor(private platformAdminService: PlatformAdminService) {}

  @ApiOperation({ summary: 'Get public subscription plans' })
  @ApiResponse({
    status: 200,
    description: 'Public subscription plans retrieved successfully',
  })
  @Get('subscription-plans')
  async getPublicSubscriptionPlans() {
    return this.platformAdminService.getPublicSubscriptionPlans();
  }
}

@ApiTags('Platform Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(
    private platformAdminService: PlatformAdminService,
    private telegramManagedBotService: TelegramManagedBotService,
  ) {}

  @ApiOperation({ summary: 'Get Platform Admin statistics' })
  @ApiResponse({
    status: 200,
    description: 'Platform Admin stats retrieved',
    type: PlatformAdminStatsDto,
  })
  @Roles(...platformViewerRoles)
  @Get('dashboard/stats')
  async getDashboardStats(): Promise<PlatformAdminStatsDto> {
    return this.platformAdminService.getDashboardStats();
  }

  // Platform Settings
  @ApiOperation({ summary: 'Get platform settings' })
  @ApiResponse({
    status: 200,
    description: 'Platform settings retrieved successfully',
  })
  @Roles('super_admin', 'ops_admin', 'it_admin')
  @Get('settings')
  async getPlatformSettings() {
    return this.platformAdminService.getPlatformSettings();
  }

  @ApiOperation({ summary: 'Update platform settings' })
  @ApiResponse({
    status: 200,
    description: 'Platform settings updated successfully',
  })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({
    action: 'platform_settings_updated',
    resourceType: 'platform_settings',
  })
  @Put('settings')
  async updatePlatformSettings(@Body() settings: Record<string, any>) {
    return this.platformAdminService.updatePlatformSettings(settings);
  }

  @ApiOperation({ summary: 'Get platform feature toggles' })
  @ApiResponse({
    status: 200,
    description: 'Feature toggles retrieved successfully',
  })
  @Roles('super_admin', 'ops_admin', 'it_admin')
  @Get('feature-toggles')
  async getFeatureToggles() {
    return this.platformAdminService.getFeatureToggles();
  }

  @ApiOperation({ summary: 'Update platform feature toggles' })
  @ApiResponse({
    status: 200,
    description: 'Feature toggles updated successfully',
  })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({
    action: 'feature_toggles_updated',
    resourceType: 'feature_toggles',
  })
  @Put('feature-toggles')
  async updateFeatureToggles(@Body() features: Record<string, any>) {
    return this.platformAdminService.updateFeatureToggles(features);
  }

  // Telegram Manager Bot Webhook
  @ApiOperation({
    summary: 'Register or re-register the Telegram manager bot webhook',
  })
  @ApiResponse({
    status: 200,
    description: 'Manager bot webhook registered successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid webhook URL or missing configuration',
  })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({
    action: 'manager_bot_webhook_registered',
    resourceType: 'telegram_manager',
  })
  @Put('telegram/manager-bot/webhook')
  async registerManagerBotWebhook(@Body() dto: ManagerWebhookRegistrationDto) {
    return this.telegramManagedBotService.registerManagerWebhook(dto);
  }

  @ApiOperation({
    summary: 'Get the Telegram manager bot webhook status from Telegram',
  })
  @ApiResponse({
    status: 200,
    description: 'Manager bot webhook info retrieved',
  })
  @Roles('super_admin', 'ops_admin', 'it_admin')
  @Get('telegram/manager-bot/webhook')
  async getManagerBotWebhook() {
    return this.telegramManagedBotService.getManagerWebhookInfo();
  }

  // Tenant Management
  @ApiOperation({ summary: 'Get all tenants with pagination' })
  @ApiResponse({ status: 200, description: 'Tenants retrieved successfully' })
  @Roles('super_admin', 'ops_admin', 'it_admin', 'support_viewer', 'read_only')
  @Get('tenants')
  async getAllTenants(@Query() paginationDto: PaginationDto) {
    return this.platformAdminService.getAllTenants(paginationDto);
  }

  @ApiOperation({ summary: 'Get tenant rate limit settings' })
  @ApiResponse({
    status: 200,
    description: 'Tenant rate limit settings retrieved successfully',
  })
  @Roles('super_admin', 'ops_admin', 'it_admin', 'support_viewer', 'read_only')
  @Get('tenants/:id/rate-limit')
  async getTenantRateLimit(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAdminService.getTenantRateLimit(id);
  }

  @ApiOperation({ summary: 'Update tenant rate limit settings' })
  @ApiResponse({
    status: 200,
    description: 'Tenant rate limit settings updated successfully',
  })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({
    action: 'tenant_rate_limit_updated',
    resourceType: 'tenant_rate_limit',
  })
  @Put('tenants/:id/rate-limit')
  async updateTenantRateLimit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateData: Record<string, any>,
  ) {
    return this.platformAdminService.updateTenantRateLimit(id, updateData);
  }

  @ApiOperation({ summary: 'Get recent tenant billing records' })
  @ApiResponse({
    status: 200,
    description: 'Recent tenant billing records retrieved successfully',
  })
  @Roles(...platformFinanceReadRoles)
  @Get('billing-records')
  async getAllTenantBillingRecords() {
    return this.platformAdminService.getAllTenantBillingRecords();
  }

  @ApiOperation({ summary: 'Get tenant billing reconciliation report' })
  @ApiResponse({
    status: 200,
    description: 'Tenant billing reconciliation report retrieved successfully',
  })
  @Roles(...platformFinanceReadRoles)
  @Get('tenants/:id/billing-reconciliation')
  async getTenantBillingReconciliation(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAdminService.getTenantBillingReconciliation(id);
  }

  @ApiOperation({ summary: 'Get tenant usage and plan limits' })
  @ApiResponse({
    status: 200,
    description: 'Tenant usage and limits retrieved successfully',
  })
  @Roles(...platformViewerRoles)
  @Get('tenants/:id/usage')
  async getTenantUsageAndLimits(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAdminService.getTenantUsageAndLimits(id);
  }

  @ApiOperation({ summary: 'Get tenant channel visibility' })
  @ApiResponse({
    status: 200,
    description: 'Tenant channels retrieved successfully',
  })
  @Roles(
    'super_admin',
    'ops_admin',
    'it_admin',
    'support_viewer',
    'read_only',
    'finance_viewer',
  )
  @Get('tenants/:id/channels')
  async getTenantChannels(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAdminService.getTenantChannels(id);
  }

  @ApiOperation({ summary: 'Get platform-wide channel visibility' })
  @ApiResponse({
    status: 200,
    description: 'Platform channels retrieved successfully',
  })
  @Roles(...platformViewerRoles)
  @Get('channels')
  async getPlatformChannels() {
    return this.platformAdminService.getPlatformChannels();
  }

  @ApiOperation({ summary: 'Get tenant support note' })
  @ApiResponse({
    status: 200,
    description: 'Tenant support note retrieved successfully',
  })
  @Roles('super_admin', 'ops_admin', 'it_admin', 'support_viewer', 'read_only')
  @Get('tenants/:id/support-note')
  async getTenantSupportNote(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAdminService.getTenantSupportNote(id);
  }

  @ApiOperation({ summary: 'Update tenant support note' })
  @ApiResponse({
    status: 200,
    description: 'Tenant support note updated successfully',
  })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({ action: 'tenant_support_note_updated', resourceType: 'tenant' })
  @Put('tenants/:id/support-note')
  async updateTenantSupportNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('note') note: string,
  ) {
    return this.platformAdminService.updateTenantSupportNote(
      id,
      typeof note === 'string' ? note : '',
    );
  }

  @ApiOperation({
    summary: 'Get platform-wide orders with merchant visibility',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform orders retrieved successfully',
  })
  @Roles(...platformViewerRoles)
  @Get('orders')
  async getPlatformOrders(
    @Query() paginationDto: PaginationDto,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('channelType') channelType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.platformAdminService.getPlatformOrders(paginationDto, {
      tenantId,
      status,
      paymentStatus,
      channelType,
      dateFrom,
      dateTo,
    });
  }

  @ApiOperation({ summary: 'Get platform-wide order payment and COD summary' })
  @ApiResponse({
    status: 200,
    description: 'Platform payment summary retrieved successfully',
  })
  @Roles(...platformViewerRoles)
  @Get('orders/payment-summary')
  async getPlatformOrderPaymentSummary(@Query('tenantId') tenantId?: string) {
    return this.platformAdminService.getPlatformOrderPaymentSummary(tenantId);
  }

  @ApiOperation({ summary: 'Get platform-wide conversation visibility' })
  @ApiResponse({
    status: 200,
    description: 'Platform conversations retrieved successfully',
  })
  @Roles(...platformSupportReadRoles)
  @Get('conversations')
  async getPlatformConversations(
    @Query() paginationDto: PaginationDto,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Query('channelType') channelType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.platformAdminService.getPlatformConversations(paginationDto, {
      tenantId,
      status,
      channelType,
      dateFrom,
      dateTo,
    });
  }

  @ApiOperation({
    summary:
      'Get platform-wide delivery visibility derived from merchant orders',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform deliveries retrieved successfully',
  })
  @Roles(...platformSupportReadRoles)
  @Get('deliveries')
  async getPlatformDeliveries(
    @Query() paginationDto: PaginationDto,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.platformAdminService.getPlatformDeliveries(paginationDto, {
      tenantId,
      status,
      paymentStatus,
      dateFrom,
      dateTo,
    });
  }

  @ApiOperation({ summary: 'Get platform-wide product visibility by merchant' })
  @ApiResponse({
    status: 200,
    description: 'Platform products retrieved successfully',
  })
  @Roles(...platformSupportReadRoles)
  @Get('products')
  async getPlatformProducts(
    @Query() paginationDto: PaginationDto,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
  ) {
    return this.platformAdminService.getPlatformProducts(paginationDto, {
      tenantId,
      status,
    });
  }

  @ApiOperation({
    summary: 'Get platform-wide merchant product catalog summaries',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform product summaries retrieved successfully',
  })
  @Roles(...platformSupportReadRoles)
  @Get('products/catalog-summary')
  async getPlatformProductCatalogSummary(@Query('search') search?: string) {
    return this.platformAdminService.getPlatformProductCatalogSummary(search);
  }

  @ApiOperation({ summary: 'Get tenant usage limit warning overview' })
  @ApiResponse({
    status: 200,
    description: 'Tenant usage warnings retrieved successfully',
  })
  @Roles(...platformViewerRoles)
  @Get('usage/tenant-limits')
  async getTenantUsageWarnings() {
    return this.platformAdminService.getTenantUsageWarnings();
  }

  @ApiOperation({ summary: 'Get platform-wide tenant rate limit settings' })
  @ApiResponse({
    status: 200,
    description: 'Platform tenant rate limits retrieved successfully',
  })
  @Roles(...platformViewerRoles)
  @Get('rate-limits')
  async getPlatformRateLimits() {
    return this.platformAdminService.getPlatformRateLimits();
  }

  @ApiOperation({ summary: 'Get tenant billing records' })
  @ApiResponse({
    status: 200,
    description: 'Tenant billing records retrieved successfully',
  })
  @Roles(...platformFinanceReadRoles)
  @Get('tenants/:id/billing-records')
  async getTenantBillingRecords(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAdminService.getTenantBillingRecords(id);
  }

  @ApiOperation({ summary: 'Create tenant billing record' })
  @ApiResponse({
    status: 201,
    description: 'Tenant billing record created successfully',
  })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({
    action: 'tenant_billing_record_created',
    resourceType: 'tenant_billing_record',
  })
  @Post('tenants/:id/billing-records')
  async createTenantBillingRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() createBillingDto: CreateTenantBillingRecordDto,
  ) {
    return this.platformAdminService.createTenantBillingRecord(
      id,
      createBillingDto,
    );
  }

  @ApiOperation({ summary: 'Update tenant billing record' })
  @ApiResponse({
    status: 200,
    description: 'Tenant billing record updated successfully',
  })
  @Roles('super_admin', 'ops_admin', 'finance_viewer')
  @AuditLog({
    action: 'tenant_billing_record_updated',
    resourceType: 'tenant_billing_record',
  })
  @Put('tenants/:id/billing-records/:recordId')
  async updateTenantBillingRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() updateBillingDto: UpdateTenantBillingRecordDto,
  ) {
    return this.platformAdminService.updateTenantBillingRecord(
      id,
      recordId,
      updateBillingDto,
    );
  }

  @ApiOperation({ summary: 'Get submitted tenant payment proof receipt URL' })
  @ApiResponse({
    status: 200,
    description: 'Tenant payment proof receipt URL retrieved successfully',
  })
  @Roles(...platformFinanceReadRoles)
  @Get('tenants/:id/billing-records/:recordId/payment-proof-download')
  async getPaymentProofDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
  ) {
    return this.platformAdminService.getTenantPaymentProofDownloadUrl(
      id,
      recordId,
    );
  }

  @ApiOperation({ summary: 'Review submitted tenant payment proof' })
  @ApiResponse({
    status: 200,
    description: 'Tenant payment proof reviewed successfully',
  })
  @Roles('super_admin', 'ops_admin', 'finance_viewer')
  @AuditLog({
    action: 'tenant_payment_proof_reviewed',
    resourceType: 'tenant_billing_record',
  })
  @Post('tenants/:id/billing-records/:recordId/payment-proof-review')
  async reviewPaymentProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Request() req,
    @Body() reviewDto: ReviewPaymentProofDto,
  ) {
    return this.platformAdminService.reviewTenantPaymentProof(
      id,
      recordId,
      req.user?.id,
      reviewDto,
    );
  }

  @ApiOperation({ summary: 'Reverse a confirmed tenant billing payment' })
  @ApiResponse({
    status: 200,
    description: 'Tenant billing payment reversed successfully',
  })
  @Roles('super_admin')
  @AuditLog({
    action: 'tenant_billing_payment_reversed',
    resourceType: 'tenant_billing_record',
  })
  @Post('tenants/:id/billing-records/:recordId/reverse-payment')
  async reverseTenantBillingPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Request() req,
    @Body() body: { reason?: string },
  ) {
    return this.platformAdminService.reverseTenantBillingPayment(
      id,
      recordId,
      req.user?.id,
      body?.reason,
    );
  }

  @ApiOperation({
    summary:
      'Send a tenant billing reminder and optionally mark overdue or suspend the tenant',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant billing reminder sent successfully',
  })
  @Roles('super_admin', 'ops_admin', 'finance_viewer')
  @AuditLog({
    action: 'tenant_billing_reminder_sent',
    resourceType: 'tenant_billing_record',
  })
  @Post('tenants/:id/billing-records/:recordId/send-reminder')
  async sendTenantBillingReminder(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() reminderDto: SendTenantBillingReminderDto,
  ) {
    return this.platformAdminService.sendTenantBillingReminder(
      id,
      recordId,
      reminderDto,
    );
  }

  @ApiOperation({ summary: 'Change tenant subscription plan' })
  @ApiResponse({
    status: 200,
    description: 'Tenant subscription plan changed successfully',
  })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({
    action: 'tenant_subscription_plan_changed',
    resourceType: 'tenant',
  })
  @Put('tenants/:id/subscription-plan')
  async changeTenantSubscriptionPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changePlanDto: ChangeTenantSubscriptionPlanDto,
  ) {
    return this.platformAdminService.changeTenantSubscriptionPlan(
      id,
      changePlanDto,
    );
  }

  @ApiOperation({
    summary:
      'Activate (current month) or approve (future month) a paid subscription period',
  })
  @ApiResponse({
    status: 200,
    description:
      'Period admin-activated; current-month periods become operational, future periods remain queued',
  })
  @Roles('super_admin', 'ops_admin', 'finance_viewer')
  @AuditLog({
    action: 'tenant_subscription_period_admin_activated',
    resourceType: 'tenant_subscription_period',
  })
  @Post('tenants/:id/subscription-periods/:periodId/admin-activate')
  async adminActivatePeriod(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Request() req,
    @Body() body: { reason?: string },
  ) {
    return this.platformAdminService.adminActivatePeriod(
      id,
      periodId,
      req.user?.id,
      body?.reason,
    );
  }

  @ApiOperation({
    summary: 'Approve a payment-confirmed current-month upgrade revision',
  })
  @ApiResponse({
    status: 200,
    description:
      'Upgrade approved with computed carryover before period expiry',
  })
  @Roles('super_admin', 'ops_admin', 'finance_viewer')
  @AuditLog({
    action: 'tenant_subscription_upgrade_approved',
    resourceType: 'tenant_subscription_period',
  })
  @Post(
    'tenants/:id/subscription-periods/:periodId/upgrade-revisions/:revisionId/approve',
  )
  async approveUpgradeRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Request() req,
    @Body() body: { reason?: string },
  ) {
    return this.platformAdminService.approveUpgradeRevision(
      id,
      periodId,
      revisionId,
      req.user?.id,
      body?.reason,
    );
  }

  @ApiOperation({
    summary: 'Reject a pending upgrade revision before approval',
  })
  @ApiResponse({
    status: 200,
    description: 'Upgrade rejected with an operator reason',
  })
  @Roles('super_admin', 'ops_admin', 'finance_viewer')
  @AuditLog({
    action: 'tenant_subscription_upgrade_rejected',
    resourceType: 'tenant_subscription_period',
  })
  @Post(
    'tenants/:id/subscription-periods/:periodId/upgrade-revisions/:revisionId/reject',
  )
  async rejectUpgradeRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Request() req,
    @Body() body: { reason?: string },
  ) {
    return this.platformAdminService.rejectUpgradeRevision(
      id,
      periodId,
      revisionId,
      req.user?.id,
      body?.reason,
    );
  }

  @ApiOperation({
    summary: 'List upgrade and trial-conversion revisions for a tenant',
  })
  @Roles(...platformViewerRoles)
  @Get('tenants/:id/upgrade-revisions')
  async getTenantUpgradeRevisions(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAdminService.getTenantUpgradeRevisions(id);
  }

  @ApiOperation({ summary: 'Get tenant by ID' })
  @ApiResponse({ status: 200, description: 'Tenant retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @Roles(...platformViewerRoles)
  @Get('tenants/:id')
  async getTenantById(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAdminService.getTenantById(id);
  }

  @ApiOperation({ summary: 'Create new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created successfully' })
  @ApiResponse({ status: 409, description: 'Tenant code already exists' })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({ action: 'tenant_created', resourceType: 'tenant' })
  @Post('tenants')
  async createTenant(@Body() createTenantDto: CreateTenantDto) {
    return this.platformAdminService.createTenant(createTenantDto);
  }

  @ApiOperation({ summary: 'Update tenant' })
  @ApiResponse({ status: 200, description: 'Tenant updated successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({ action: 'tenant_updated', resourceType: 'tenant' })
  @Put('tenants/:id')
  async updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTenantDto: UpdateTenantDto,
  ) {
    return this.platformAdminService.updateTenant(id, updateTenantDto);
  }

  @ApiOperation({ summary: 'Approve or reject tenant' })
  @ApiResponse({ status: 200, description: 'Tenant approval status updated' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({ action: 'tenant_approval_updated', resourceType: 'tenant' })
  @Post('tenants/:id/approve')
  async approveTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() approvalDto: TenantApprovalDto,
    @Request() req,
  ) {
    return this.platformAdminService.approveTenant(
      id,
      approvalDto,
      req.user.id,
    );
  }

  @ApiOperation({ summary: 'Suspend tenant' })
  @ApiResponse({ status: 200, description: 'Tenant suspended successfully' })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({ action: 'tenant_suspended', resourceType: 'tenant' })
  @Post('tenants/:id/suspend')
  async suspendTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() statusDto: ChangeTenantStatusDto,
  ) {
    return this.platformAdminService.suspendTenant(id, statusDto.reason);
  }

  @ApiOperation({ summary: 'Reactivate tenant' })
  @ApiResponse({ status: 200, description: 'Tenant reactivated successfully' })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({ action: 'tenant_reactivated', resourceType: 'tenant' })
  @Post('tenants/:id/reactivate')
  async reactivateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() statusDto: ChangeTenantStatusDto,
  ) {
    return this.platformAdminService.reactivateTenant(id, statusDto.reason);
  }

  @ApiOperation({ summary: 'Delete tenant' })
  @ApiResponse({ status: 200, description: 'Tenant deleted successfully' })
  @Roles('super_admin')
  @AuditLog({ action: 'tenant_deleted', resourceType: 'tenant' })
  @Delete('tenants/:id')
  async deleteTenant(@Param('id', ParseUUIDPipe) id: string) {
    await this.platformAdminService.deleteTenant(id);
    return { message: 'Tenant deleted successfully' };
  }

  // Tenant User Management
  @ApiOperation({ summary: 'List tenant users' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @Roles('super_admin', 'ops_admin', 'support_viewer', 'read_only')
  @Get('tenants/:id/users')
  async listTenantUsers(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAdminService.listTenantUsers(id);
  }

  @ApiOperation({ summary: 'Invite a user to a tenant workspace' })
  @ApiResponse({ status: 201, description: 'User invited successfully' })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({ action: 'tenant_user_invited', resourceType: 'tenant_user' })
  @Post('tenants/:id/users/invite')
  async inviteTenantUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { fullName: string; email: string; role?: string },
  ) {
    return this.platformAdminService.inviteTenantUser(id, dto);
  }

  @ApiOperation({ summary: 'Resend invite to an inactive tenant user' })
  @ApiResponse({ status: 200, description: 'Invite re-sent successfully' })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({
    action: 'tenant_user_invite_resend',
    resourceType: 'tenant_user',
  })
  @Post('tenants/:id/users/:userId/resend-invite')
  async resendTenantUserInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.platformAdminService.resendTenantUserInvite(id, userId);
  }

  // Subscription Plan Management
  @ApiOperation({ summary: 'Get all subscription plans' })
  @ApiResponse({
    status: 200,
    description: 'Subscription plans retrieved successfully',
  })
  @Roles(
    'super_admin',
    'ops_admin',
    'finance_viewer',
    'support_viewer',
    'read_only',
  )
  @Get('subscription-plans')
  async getAllSubscriptionPlans() {
    return this.platformAdminService.getAllSubscriptionPlans();
  }

  @ApiOperation({ summary: 'Get subscription plan by ID' })
  @ApiResponse({
    status: 200,
    description: 'Subscription plan retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Subscription plan not found' })
  @Roles(
    'super_admin',
    'ops_admin',
    'finance_viewer',
    'support_viewer',
    'read_only',
  )
  @Get('subscription-plans/:id')
  async getSubscriptionPlanById(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAdminService.getSubscriptionPlanById(id);
  }

  @ApiOperation({ summary: 'Create new subscription plan' })
  @ApiResponse({
    status: 201,
    description: 'Subscription plan created successfully',
  })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({
    action: 'subscription_plan_created',
    resourceType: 'subscription_plan',
  })
  @Post('subscription-plans')
  async createSubscriptionPlan(
    @Body() createPlanDto: CreateSubscriptionPlanDto,
  ) {
    return this.platformAdminService.createSubscriptionPlan(createPlanDto);
  }

  @ApiOperation({ summary: 'Update subscription plan' })
  @ApiResponse({
    status: 200,
    description: 'Subscription plan updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Subscription plan not found' })
  @Roles('super_admin', 'ops_admin')
  @AuditLog({
    action: 'subscription_plan_updated',
    resourceType: 'subscription_plan',
  })
  @Put('subscription-plans/:id')
  async updateSubscriptionPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePlanDto: Partial<CreateSubscriptionPlanDto>,
  ) {
    return this.platformAdminService.updateSubscriptionPlan(id, updatePlanDto);
  }

  @ApiOperation({ summary: 'Delete subscription plan' })
  @ApiResponse({
    status: 200,
    description: 'Subscription plan deleted successfully',
  })
  @ApiResponse({ status: 409, description: 'Cannot delete plan in use' })
  @Roles('super_admin')
  @AuditLog({
    action: 'subscription_plan_deleted',
    resourceType: 'subscription_plan',
  })
  @Delete('subscription-plans/:id')
  async deleteSubscriptionPlan(@Param('id', ParseUUIDPipe) id: string) {
    await this.platformAdminService.deleteSubscriptionPlan(id);
    return { message: 'Subscription plan deleted successfully' };
  }

  // Platform Admin Management
  @ApiOperation({ summary: 'Get all platform admins' })
  @ApiResponse({
    status: 200,
    description: 'Platform admins retrieved successfully',
  })
  @Roles('super_admin')
  @Get('admins')
  async getAllPlatformAdmins() {
    return this.platformAdminService.getAllPlatformAdmins();
  }

  @ApiOperation({ summary: 'Get platform admin by ID' })
  @ApiResponse({
    status: 200,
    description: 'Platform admin retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Platform admin not found' })
  @Roles('super_admin')
  @Get('admins/:id')
  async getPlatformAdminById(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAdminService.getPlatformAdminById(id);
  }

  @ApiOperation({ summary: 'Update platform admin status' })
  @ApiResponse({
    status: 200,
    description: 'Platform admin status updated successfully',
  })
  @Roles('super_admin')
  @AuditLog({
    action: 'platform_admin_status_updated',
    resourceType: 'platform_admin',
  })
  @Put('admins/:id/status')
  async updatePlatformAdminStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: string,
  ) {
    return this.platformAdminService.updatePlatformAdminStatus(id, status);
  }
}
