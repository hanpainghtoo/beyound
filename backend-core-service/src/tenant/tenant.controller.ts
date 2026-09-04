/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- Legacy request contracts and synchronous role metadata are retained for compatibility. */
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
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { TenantService } from './tenant.service';
import { TelegramManagedBotService } from './telegram-managed-bot.service';
import { UsageLimitService } from '../usage/usage-limit.service';
import { ProviderAllowedResponseDto } from './dto/provider-allowed-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { MissingActivePeriodError } from '../subscription-period/subscription-entitlement.types';
import { AllowExpiredAccess } from '../common/decorators/allow-expired-access.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';

import { CreateCsrDto } from './dto/create-csr.dto';
import { CreateCsrInviteDto } from './dto/create-csr-invite.dto';
import { UpdateCsrDto } from './dto/update-csr.dto';
import { CreateTenantChannelDto } from './dto/create-channel.dto';
import { ValidateTelegramTokenDto } from './dto/validate-telegram-token.dto';
import { InitiateTelegramManagedBotDto } from './dto/telegram-managed-bot.dto';
import { CreateCannedResponseDto } from './dto/create-canned-response.dto';
import { TenantDashboardStatsDto } from './dto/tenant-dashboard-stats.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { SubmitPaymentProofDto } from './dto/submit-payment-proof.dto';
import { CreateSubscriptionPurchaseRequestDto } from './dto/create-subscription-purchase-request.dto';
import { RequestPlanChangeDto } from './dto/request-plan-change.dto';
import { TenantPlanChangeRequestDto } from './dto/tenant-plan-change-request.dto';
import {
  tenantBillingRoles,
  tenantManagementRoles,
} from '../common/constants/tenant-roles';

@ApiTags('Tenant Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
@Controller('tenant')
export class TenantController {
  constructor(
    private tenantService: TenantService,
    private telegramManagedBotService: TelegramManagedBotService,
    private usageLimitService: UsageLimitService,
  ) {}

  @ApiOperation({ summary: 'Get tenant dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard stats retrieved',
    type: TenantDashboardStatsDto,
  })
  @Roles(...tenantManagementRoles)
  @Get('dashboard/stats')
  async getDashboardStats(
    @CurrentTenant() tenant: { id: string },
  ): Promise<TenantDashboardStatsDto> {
    return this.tenantService.getDashboardStats(tenant.id);
  }

  // Tenant Settings
  @ApiOperation({ summary: 'Get tenant company profile/settings' })
  @ApiResponse({
    status: 200,
    description: 'Tenant settings retrieved successfully',
  })
  @Roles(...tenantManagementRoles)
  @AllowExpiredAccess()
  @Get('settings')
  async getTenantSettings(@CurrentTenant() tenant: { id: string }) {
    return this.tenantService.getTenantSettings(tenant.id);
  }

  @ApiOperation({ summary: 'Update tenant company profile/settings' })
  @ApiResponse({
    status: 200,
    description: 'Tenant settings updated successfully',
  })
  @Roles('owner', 'admin')
  @AuditLog({ action: 'tenant_settings_updated', resourceType: 'tenant' })
  @Put('settings')
  async updateTenantSettings(
    @CurrentTenant() tenant: { id: string },
    @Body() updateData: Record<string, any>,
  ) {
    return this.tenantService.updateTenantSettings(tenant.id, updateData);
  }

  @ApiOperation({ summary: 'Update tenant onboarding setup guide state' })
  @ApiResponse({
    status: 200,
    description: 'Tenant onboarding state updated successfully',
  })
  @Roles(...tenantManagementRoles)
  @AuditLog({
    action: 'tenant_onboarding_state_updated',
    resourceType: 'tenant',
  })
  @Put('onboarding-state')
  async updateOnboardingState(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body()
    updateData: { dismissedAt?: string | null; completedAt?: string | null },
  ) {
    return this.tenantService.updateOnboardingState(
      tenant.id,
      user.id,
      updateData,
    );
  }

  @ApiOperation({ summary: 'Get tenant billing overview and invoice history' })
  @ApiResponse({
    status: 200,
    description: 'Tenant billing overview retrieved successfully',
  })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @Get('billing')
  async getTenantBilling(@CurrentTenant() tenant: { id: string }) {
    return this.tenantService.getTenantBilling(tenant.id);
  }

  @ApiOperation({ summary: 'Get workspace-level usage summary for the active subscription period' })
  @ApiResponse({
    status: 200,
    description: 'Period-scoped usage summary with per-dimension used/limit/remaining/limitReached',
  })
  @ApiResponse({ status: 409, description: 'No active subscription period' })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @Get('usage-summary')
  async getUsageSummary(@CurrentTenant() tenant: { id: string }) {
    try {
      return await this.usageLimitService.getUsageSummary(tenant.id);
    } catch (error) {
      if (error instanceof MissingActivePeriodError) {
        const codeMap: Record<string, string> = {
          PERIOD_PAYMENT_NOT_CONFIRMED: 'SUBSCRIPTION_PAYMENT_REQUIRED',
          PERIOD_AWAITING_ADMIN_ACTIVATION: 'SUBSCRIPTION_PERIOD_AWAITING_ACTIVATION',
          TRIAL_EXPIRED: 'TRIAL_EXPIRED',
        };
        const mappedCode = codeMap[error.code] ?? 'SUBSCRIPTION_PERIOD_NOT_ACTIVE';
        throw new HttpException(
          { code: mappedCode, message: error.message, activePeriodId: null },
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  @ApiOperation({
    summary:
      'Request a subscription period purchase for the current or next month',
  })
  @ApiResponse({
    status: 201,
    description:
      'Subscription purchase request created for operator payment confirmation',
  })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @AuditLog({
    action: 'tenant_subscription_purchase_requested',
    resourceType: 'tenant_billing_record',
  })
  @Post('billing/purchase-requests')
  async createSubscriptionPurchaseRequest(
    @CurrentTenant() tenant: { id: string },
    @Body() input: CreateSubscriptionPurchaseRequestDto,
  ) {
    return this.tenantService.createSubscriptionPurchaseRequest(
      tenant.id,
      input,
    );
  }

  @ApiOperation({ summary: 'Submit payment proof for operator review' })
  @ApiResponse({
    status: 201,
    description: 'Payment proof submitted for review',
  })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @AuditLog({
    action: 'tenant_payment_proof_submitted',
    resourceType: 'tenant_billing_record',
  })
  @Post('billing/:recordId/payment-proof')
  async submitPaymentProof(
    @CurrentTenant() tenant: { id: string },
    @Request() req,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() proof: SubmitPaymentProofDto,
  ) {
    return this.tenantService.submitPaymentProof(
      tenant.id,
      recordId,
      req.user?.id,
      proof,
    );
  }

  @ApiOperation({ summary: 'Create a persisted tenant plan change request' })
  @ApiResponse({
    status: 201,
    description: 'Plan change request created successfully',
  })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @AuditLog({
    action: 'tenant_plan_change_requested',
    resourceType: 'platform_lead',
  })
  @Post('billing/plan-change-requests')
  async requestPlanChange(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Body() input: RequestPlanChangeDto,
  ) {
    return this.tenantService.requestPlanChange(
      tenant.id,
      user.id,
      user.role,
      input,
    );
  }

  @ApiOperation({ summary: 'List persisted tenant plan change requests' })
  @ApiResponse({
    status: 200,
    description: 'Plan change requests retrieved successfully',
    type: TenantPlanChangeRequestDto,
    isArray: true,
  })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @Get('billing/plan-change-requests')
  async listPlanChangeRequests(@CurrentTenant() tenant: { id: string }) {
    return this.tenantService.listPlanChangeRequests(tenant.id);
  }

  @ApiOperation({ summary: 'Request a tenant data export' })
  @ApiResponse({
    status: 201,
    description: 'Data export request queued successfully',
  })
  @Roles('owner', 'admin')
  @AllowExpiredAccess()
  @AuditLog({
    action: 'tenant_data_export_requested',
    resourceType: 'platform_lead',
  })
  @Post('data-export-requests')
  async requestDataExport(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Body() body: { note?: string },
  ) {
    return this.tenantService.requestDataExport(
      tenant.id,
      user.id,
      user.role,
      body?.note,
    );
  }

  @ApiOperation({ summary: 'Cancel an open tenant plan change request' })
  @ApiResponse({
    status: 200,
    description: 'Plan change request cancelled successfully',
    type: TenantPlanChangeRequestDto,
  })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @AuditLog({
    action: 'tenant_plan_change_request_cancelled',
    resourceType: 'platform_lead',
  })
  @Post('billing/plan-change-requests/:requestId/cancel')
  async cancelPlanChangeRequest(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.tenantService.cancelPlanChangeRequest(
      tenant.id,
      user.id,
      requestId,
    );
  }

  @ApiOperation({
    summary: 'Get available tenant roles and default permissions',
  })
  @ApiResponse({ status: 200, description: 'Roles retrieved successfully' })
  @Roles(...tenantManagementRoles)
  @Get('roles')
  async getAvailableRoles() {
    return this.tenantService.getAvailableRoles();
  }

  // CSR Management
  @ApiOperation({ summary: 'Get all CSRs' })
  @ApiResponse({ status: 200, description: 'CSRs retrieved successfully' })
  @Roles(...tenantManagementRoles)
  @Get('csrs')
  async getAllCsrs(
    @CurrentTenant() tenant: { id: string },
    @Query() paginationDto: PaginationDto,
  ) {
    return this.tenantService.getAllCsrs(tenant.id, paginationDto);
  }

  @ApiOperation({ summary: 'Get CSR by ID' })
  @ApiResponse({ status: 200, description: 'CSR retrieved successfully' })
  @ApiResponse({ status: 404, description: 'CSR not found' })
  @Roles(...tenantManagementRoles)
  @Get('csrs/:id')
  async getCsrById(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) csrId: string,
  ) {
    return this.tenantService.getCsrById(tenant.id, csrId);
  }

  @ApiOperation({ summary: 'Create new CSR' })
  @ApiResponse({ status: 201, description: 'CSR created successfully' })
  @ApiResponse({ status: 409, description: 'CSR already exists' })
  @Roles(...tenantManagementRoles)
  @AuditLog({ action: 'csr_created', resourceType: 'tenant_user' })
  @Post('csrs')
  async createCsr(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Body() createCsrDto: CreateCsrDto,
  ) {
    return this.tenantService.createCsr(tenant.id, createCsrDto, user.role);
  }

  @ApiOperation({ summary: 'Invite a new team member' })
  @ApiResponse({
    status: 201,
    description: 'Team invitation created successfully',
  })
  @ApiResponse({ status: 409, description: 'CSR already exists' })
  @Roles(...tenantManagementRoles)
  @AuditLog({ action: 'csr_invited', resourceType: 'tenant_user' })
  @Post('csrs/invite')
  async inviteCsr(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Body() inviteCsrDto: CreateCsrInviteDto,
  ) {
    return this.tenantService.inviteCsr(
      tenant.id,
      inviteCsrDto,
      user.id,
      user.role,
    );
  }

  @ApiOperation({ summary: 'Update CSR' })
  @ApiResponse({ status: 200, description: 'CSR updated successfully' })
  @ApiResponse({ status: 404, description: 'CSR not found' })
  @Roles(...tenantManagementRoles)
  @AuditLog({ action: 'csr_updated', resourceType: 'tenant_user' })
  @Put('csrs/:id')
  async updateCsr(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) csrId: string,
    @Body() updateCsrDto: UpdateCsrDto,
  ) {
    return this.tenantService.updateCsr(
      tenant.id,
      csrId,
      updateCsrDto,
      user.role,
    );
  }

  @ApiOperation({ summary: 'Update CSR permissions' })
  @ApiResponse({
    status: 200,
    description: 'CSR permissions updated successfully',
  })
  @ApiResponse({ status: 404, description: 'CSR not found' })
  @Roles('owner', 'admin')
  @AuditLog({
    action: 'csr_permissions_updated',
    resourceType: 'tenant_user',
  })
  @Put('csrs/:id/permissions')
  async updateCsrPermissions(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) csrId: string,
    @Body('permissions') permissions: Record<string, any>,
  ) {
    return this.tenantService.updateCsrPermissions(
      tenant.id,
      csrId,
      permissions || {},
    );
  }

  @ApiOperation({ summary: 'Delete CSR' })
  @ApiResponse({ status: 200, description: 'CSR deleted successfully' })
  @Roles('owner', 'admin')
  @AuditLog({ action: 'csr_deleted', resourceType: 'tenant_user' })
  @Delete('csrs/:id')
  async deleteCsr(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) csrId: string,
  ) {
    await this.tenantService.deleteCsr(tenant.id, csrId, user.role);
    return { message: 'CSR deleted successfully' };
  }

  // Channel Management
  @ApiOperation({ summary: 'Get all channels' })
  @ApiResponse({ status: 200, description: 'Channels retrieved successfully' })
  @Roles(...tenantManagementRoles)
  @Get('channels')
  async getAllChannels(@CurrentTenant() tenant: { id: string }) {
    return this.tenantService.getAllChannels(tenant.id);
  }

  @ApiOperation({ summary: 'Get channel by ID' })
  @ApiResponse({ status: 200, description: 'Channel retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  @Roles(...tenantManagementRoles)
  @Get('channels/:id')
  async getChannelById(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) channelId: string,
  ) {
    return this.tenantService.getChannelById(tenant.id, channelId);
  }

  @ApiOperation({ summary: 'Create new channel' })
  @ApiResponse({ status: 201, description: 'Channel created successfully' })
  @Roles(...tenantManagementRoles)
  @AuditLog({ action: 'channel_created', resourceType: 'tenant_channel' })
  @Post('channels')
  async createChannel(
    @CurrentTenant() tenant: { id: string },
    @Request() req,
    @Body() createChannelDto: CreateTenantChannelDto,
  ) {
    return this.tenantService.createChannel(
      tenant.id,
      createChannelDto,
      req.user?.id,
    );
  }

  @ApiOperation({ summary: 'Validate a Telegram bot token via getMe' })
  @ApiResponse({
    status: 200,
    description: 'Token validation result with bot identity if valid',
  })
  @Roles(...tenantManagementRoles)
  @Post('channels/validate-telegram-token')
  async validateTelegramToken(@Body() dto: ValidateTelegramTokenDto) {
    return this.tenantService.validateTelegramToken(dto.botToken);
  }

  @ApiOperation({
    summary: 'Initiate Telegram managed merchant bot onboarding',
  })
  @ApiResponse({
    status: 201,
    description: 'Telegram onboarding request created',
  })
  @Roles('owner', 'admin')
  @Post('channel-connections/telegram/managed/initiate')
  async initiateTelegramManagedBot(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body() dto: InitiateTelegramManagedBotDto,
  ) {
    return this.telegramManagedBotService.initiate(tenant.id, user.id, dto);
  }

  @ApiOperation({
    summary: 'Get Telegram managed merchant bot onboarding request',
  })
  @ApiResponse({
    status: 200,
    description: 'Telegram onboarding request status',
  })
  @Roles('owner', 'admin')
  @Get('channel-connections/telegram/managed/requests/:requestId')
  async getTelegramManagedBotRequest(
    @CurrentTenant() tenant: { id: string },
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.telegramManagedBotService.getRequestStatus(
      tenant.id,
      requestId,
    );
  }

  @ApiOperation({
    summary: 'Cancel Telegram managed merchant bot onboarding request',
  })
  @ApiResponse({
    status: 200,
    description: 'Telegram onboarding request cancelled',
  })
  @Roles('owner', 'admin')
  @Post('channel-connections/telegram/managed/requests/:requestId/cancel')
  async cancelTelegramManagedBotRequest(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.telegramManagedBotService.cancel(tenant.id, user.id, requestId);
  }

  @ApiOperation({ summary: 'Update channel' })
  @ApiResponse({ status: 200, description: 'Channel updated successfully' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  @Roles(...tenantManagementRoles)
  @AuditLog({ action: 'channel_updated', resourceType: 'tenant_channel' })
  @Put('channels/:id')
  async updateChannel(
    @CurrentTenant() tenant: { id: string },
    @Request() req,
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body() updateChannelDto: Partial<CreateTenantChannelDto>,
  ) {
    return this.tenantService.updateChannel(
      tenant.id,
      channelId,
      updateChannelDto,
      req.user?.id,
    );
  }

  @ApiOperation({ summary: 'Test channel provider connection' })
  @ApiResponse({
    status: 200,
    description: 'Channel connection tested successfully',
  })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  @Roles('owner', 'admin', 'supervisor')
  @AuditLog({
    action: 'channel_connection_tested',
    resourceType: 'tenant_channel',
  })
  @Post('channels/:id/test-connection')
  async testChannelConnection(
    @CurrentTenant() tenant: { id: string },
    @Request() req,
    @Param('id', ParseUUIDPipe) channelId: string,
  ) {
    return this.tenantService.testChannelConnection(
      tenant.id,
      channelId,
      req.user?.id,
    );
  }

  @ApiOperation({
    summary: 'Disconnect channel while retaining its saved record',
  })
  @ApiResponse({
    status: 200,
    description: 'Channel disconnected successfully',
  })
  @Roles('owner', 'admin')
  @AuditLog({ action: 'channel_disconnected', resourceType: 'tenant_channel' })
  @Post('channels/:id/disconnect')
  async disconnectChannel(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) channelId: string,
  ) {
    return this.tenantService.disconnectChannel(tenant.id, channelId, user.id);
  }

  @ApiOperation({ summary: 'Select or clear a channel for capacity retention' })
  @ApiResponse({
    status: 200,
    description: 'Channel retention preference updated',
  })
  @Roles('owner', 'admin')
  @AuditLog({
    action: 'channel_retention_selection_updated',
    resourceType: 'tenant_channel',
  })
  @Put('channels/:id/retention')
  async setChannelRetentionSelection(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body('selected') selected: boolean,
  ) {
    return this.tenantService.setChannelRetentionSelection(
      tenant.id,
      channelId,
      selected === true,
    );
  }

  @ApiOperation({ summary: 'Reactivate a capacity-disabled channel' })
  @ApiResponse({ status: 200, description: 'Channel reactivated successfully' })
  @Roles('owner', 'admin')
  @AuditLog({ action: 'channel_reactivated', resourceType: 'tenant_channel' })
  @Post('channels/:id/reactivate')
  async reactivateChannel(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) channelId: string,
  ) {
    return this.tenantService.reactivateChannel(tenant.id, channelId);
  }

  @ApiOperation({ summary: 'Delete channel' })
  @ApiResponse({ status: 200, description: 'Channel deleted successfully' })
  @Roles('owner', 'admin')
  @AuditLog({ action: 'channel_deleted', resourceType: 'tenant_channel' })
  @Delete('channels/:id')
  async deleteChannel(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) channelId: string,
  ) {
    await this.tenantService.deleteChannel(tenant.id, channelId, user.id);
    return { message: 'Channel deleted successfully' };
  }

  // Canned Responses Management
  @ApiOperation({ summary: 'Get all canned responses' })
  @ApiResponse({
    status: 200,
    description: 'Canned responses retrieved successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('canned-responses')
  async getAllCannedResponses(
    @CurrentTenant() tenant: { id: string },
    @Query() paginationDto: PaginationDto,
  ) {
    return this.tenantService.getAllCannedResponses(tenant.id, paginationDto);
  }

  @ApiOperation({ summary: 'Get canned response by ID' })
  @ApiResponse({
    status: 200,
    description: 'Canned response retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Canned response not found' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('canned-responses/:id')
  async getCannedResponseById(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) responseId: string,
  ) {
    return this.tenantService.getCannedResponseById(tenant.id, responseId);
  }

  @ApiOperation({ summary: 'Create new canned response' })
  @ApiResponse({
    status: 201,
    description: 'Canned response created successfully',
  })
  @ApiResponse({ status: 409, description: 'Shortcut already exists' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({
    action: 'canned_response_created',
    resourceType: 'canned_response',
  })
  @Post('canned-responses')
  async createCannedResponse(
    @CurrentTenant() tenant: { id: string },
    @Body() createResponseDto: CreateCannedResponseDto,
    @Request() req,
  ) {
    return this.tenantService.createCannedResponse(
      tenant.id,
      createResponseDto,
      req.user.id,
    );
  }

  @ApiOperation({ summary: 'Update canned response' })
  @ApiResponse({
    status: 200,
    description: 'Canned response updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Canned response not found' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({
    action: 'canned_response_updated',
    resourceType: 'canned_response',
  })
  @Put('canned-responses/:id')
  async updateCannedResponse(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) responseId: string,
    @Body() updateResponseDto: Partial<CreateCannedResponseDto>,
  ) {
    return this.tenantService.updateCannedResponse(
      tenant.id,
      responseId,
      updateResponseDto,
    );
  }

  @ApiOperation({ summary: 'Get allowed providers for the tenant plan' })
  @ApiResponse({
    status: 200,
    description: 'Allowed providers retrieved successfully',
    type: ProviderAllowedResponseDto,
  })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('providers/allowed')
  async getTenantAllowedProviders(
    @CurrentTenant() tenant: { id: string },
  ): Promise<ProviderAllowedResponseDto> {
    try {
      const allowedProviders =
        await this.tenantService.getTenantAllowedProviders(tenant.id);
      return { hasActivePeriod: true, allowedProviders };
    } catch (error) {
      if (error instanceof MissingActivePeriodError) {
        // No operational period (paid or trial) – cannot reliably resolve providers.
        return { hasActivePeriod: false, allowedProviders: [] };
      }
      throw error;
    }
  }

  @ApiOperation({ summary: 'Delete canned response' })
  @ApiResponse({
    status: 200,
    description: 'Canned response deleted successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({
    action: 'canned_response_deleted',
    resourceType: 'canned_response',
  })
  @Delete('canned-responses/:id')
  async deleteCannedResponse(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) responseId: string,
  ) {
    await this.tenantService.deleteCannedResponse(tenant.id, responseId);
    return { message: 'Canned response deleted successfully' };
  }
}
