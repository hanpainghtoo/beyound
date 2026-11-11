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
import { CommerceTemplateGuard } from '../common/guards/commerce-template.guard';
import { TenantChannelSettingsService } from './tenant-channel-settings.service';
import { Roles } from '../common/decorators/roles.decorator';
import { MissingActivePeriodError } from '../subscription-period/subscription-entitlement.types';
import { AllowExpiredAccess } from '../common/decorators/allow-expired-access.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';
import { MetaAppResolver } from '../channel/meta-app-resolver.service';
import { MetaOAuthService } from './meta-oauth.service';

import { CreateAgentDto } from './dto/create-agent.dto';
import { CreateAgentInviteDto } from './dto/create-agent-invite.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { CreateTenantChannelDto } from './dto/create-channel.dto';
import { SetChannelTemplateDto } from '../bot-template/dto/bot-template.dto';
import { ExchangeMetaOAuthCodeDto } from './dto/meta-oauth.dto';
import { ValidateTelegramTokenDto } from './dto/validate-telegram-token.dto';
import { InitiateTelegramManagedBotDto } from './dto/telegram-managed-bot.dto';
import { CreateCannedResponseDto } from './dto/create-canned-response.dto';
import { TenantDashboardStatsDto } from './dto/tenant-dashboard-stats.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { SubmitPaymentProofDto } from './dto/submit-payment-proof.dto';
import { UpdateProfileImageDto } from './dto/update-profile-image.dto';
import { UpdateTelegramChannelDto } from './dto/update-telegram-channel.dto';
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
    private channelSettingsService: TenantChannelSettingsService,
    private metaAppResolver: MetaAppResolver,
    private metaOAuthService: MetaOAuthService,
  ) {}

  @Roles(...tenantManagementRoles)
  @AllowExpiredAccess()
  @Get('channel-settings/effective')
  async getEffectiveChannelSettings(@CurrentTenant() tenant: { id: string }) {
    const facebook = await this.channelSettingsService.getFacebookSettings(
      tenant.id,
    );
    let app: {
      appId: string;
      status: string;
      loginConfigId: string | null;
    } | null = null;
    try {
      const resolved = await this.metaAppResolver.getMetaApp(tenant.id);
      app = {
        appId: resolved.appId,
        status: resolved.status,
        loginConfigId: resolved.loginConfigId ?? null,
      };
    } catch {
      /* setup is intentionally represented as unavailable */
    }
    return {
      facebook: {
        mode: facebook.facebookMode,
        appId: app?.appId ?? null,
        status: app?.status ?? 'not_configured',
        loginConfigId: app?.loginConfigId ?? null,
      },
      telegram: {
        template: await this.channelSettingsService.getTelegramBotTemplate(
          tenant.id,
        ),
      },
    };
  }

  @ApiOperation({ summary: 'Issue a single-use Meta OAuth login state' })
  @ApiResponse({ status: 201, description: 'Login state issued' })
  @Roles('owner', 'admin')
  @Post('channels/meta/state')
  async createMetaOAuthState(
    @CurrentTenant() tenant: { id: string },
    @Request() req,
  ) {
    return this.metaOAuthService.issueState(tenant.id, req.user?.id);
  }

  @ApiOperation({ summary: 'Exchange a Meta authorization code for a channel' })
  @ApiResponse({ status: 201, description: 'Channel connected' })
  @Roles('owner', 'admin')
  @AuditLog({ action: 'channel_created', resourceType: 'tenant_channel' })
  @Post('channels/meta/exchange')
  async exchangeMetaOAuthCode(
    @CurrentTenant() tenant: { id: string },
    @Request() req,
    @Body() dto: ExchangeMetaOAuthCodeDto,
  ) {
    return this.metaOAuthService.exchangeCode(tenant.id, req.user?.id, dto);
  }

  /**
   * Plan 78: read-only view of the platform commerce switch so the workspace
   * can hide the Templates entry and block the templates page. Deliberately
   * unguarded — a merchant must be able to see that commerce is off in order
   * to understand why the feature disappeared.
   */
  @ApiOperation({ summary: 'Get commerce template settings for this tenant' })
  @Roles(...tenantManagementRoles)
  @Get('channel-settings')
  async getChannelSettings(@CurrentTenant() tenant: { id: string }) {
    return {
      telegramBotTemplate: await this.channelSettingsService.getTelegramBotTemplate(
        tenant.id,
      ),
    };
  }

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

  // =========================================================================
  // Task 1: Tenant user profile image store & edit
  // =========================================================================

  @ApiOperation({ summary: 'Update tenant user profile image' })
  @ApiResponse({
    status: 200,
    description: 'Profile image updated successfully',
  })
  @Roles('owner', 'admin')
  @AuditLog({
    action: 'tenant_user_profile_image_updated',
    resourceType: 'tenant_user',
  })
  @Put('users/:userId/profile-image')
  async updateProfileImage(
    @CurrentTenant() tenant: { id: string },
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateProfileImageDto,
  ) {
    return this.tenantService.updateProfileImage(tenant.id, userId, dto);
  }

  @ApiOperation({ summary: 'Get tenant user profile image download URL' })
  @ApiResponse({
    status: 200,
    description: 'Profile image download URL retrieved successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('users/:userId/profile-image/download-url')
  async getProfileImageDownloadUrl(
    @CurrentTenant() tenant: { id: string },
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.tenantService.getProfileImageDownloadUrl(tenant.id, userId);
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

  @ApiOperation({
    summary:
      'Get workspace-level usage summary for the active subscription period',
  })
  @ApiResponse({
    status: 200,
    description:
      'Period-scoped usage summary with per-dimension used/limit/remaining/limitReached',
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
          PERIOD_AWAITING_ADMIN_ACTIVATION:
            'SUBSCRIPTION_PERIOD_AWAITING_ACTIVATION',
          TRIAL_EXPIRED: 'TRIAL_EXPIRED',
        };
        const mappedCode =
          codeMap[error.code] ?? 'SUBSCRIPTION_PERIOD_NOT_ACTIVE';
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
    @CurrentUser() user?: { id: string },
  ) {
    return this.tenantService.createSubscriptionPurchaseRequest(
      tenant.id,
      // Session user wins over any client-sent value (anti-spoof); the DTO
      // field remains for non-session callers (scripts/tests).
      user?.id ? { ...input, requestedBy: user.id } : input,
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

  @ApiOperation({ summary: 'Cancel an open tenant invoice request' })
  @ApiResponse({
    status: 200,
    description: 'Invoice request cancelled successfully',
  })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @AuditLog({
    action: 'tenant_invoice_cancelled',
    resourceType: 'tenant_billing_record',
  })
  @Post('billing/:recordId/cancel')
  async cancelSubscriptionBillingRecord(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('recordId', ParseUUIDPipe) recordId: string,
  ) {
    return this.tenantService.cancelSubscriptionBillingRecord(
      tenant.id,
      recordId,
      user.id,
    );
  }

  @ApiOperation({ summary: 'Cancel a pending tenant upgrade request' })
  @ApiResponse({
    status: 200,
    description: 'Upgrade request cancelled successfully',
  })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @AuditLog({
    action: 'tenant_upgrade_request_cancelled',
    resourceType: 'tenant_billing_record',
  })
  @Post('billing/upgrade-revisions/:revisionId/cancel')
  async cancelUpgradeRevision(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ) {
    return this.tenantService.cancelUpgradeRevision(
      tenant.id,
      user.id,
      revisionId,
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

  // Agent Management
  @ApiOperation({ summary: 'Get all Agents' })
  @ApiResponse({ status: 200, description: 'Agents retrieved successfully' })
  @Roles(...tenantManagementRoles, 'agent')
  @Get(['agents', 'csrs'])
  async getAllAgents(
    @CurrentTenant() tenant: { id: string },
    @Query() paginationDto: PaginationDto,
  ) {
    return this.tenantService.getAllAgents(tenant.id, paginationDto);
  }

  @ApiOperation({ summary: 'Get Agent by ID' })
  @ApiResponse({ status: 200, description: 'Agent retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @Roles(...tenantManagementRoles)
  @Get(['agents/:id', 'csrs/:id'])
  async getAgentById(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) agentId: string,
  ) {
    return this.tenantService.getAgentById(tenant.id, agentId);
  }

  @ApiOperation({ summary: 'Create new Agent' })
  @ApiResponse({ status: 201, description: 'Agent created successfully' })
  @ApiResponse({ status: 409, description: 'Agent already exists' })
  @Roles(...tenantManagementRoles)
  @AuditLog({ action: 'agent_created', resourceType: 'tenant_user' })
  @Post(['agents', 'csrs'])
  async createAgent(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Body() createAgentDto: CreateAgentDto,
  ) {
    return this.tenantService.createAgent(
      tenant.id,
      createAgentDto,
      user.role,
      user.id,
    );
  }

  @ApiOperation({ summary: 'Invite a new team member' })
  @ApiResponse({
    status: 201,
    description: 'Team invitation created successfully',
  })
  @ApiResponse({ status: 409, description: 'Agent already exists' })
  @Roles(...tenantManagementRoles)
  @AuditLog({ action: 'agent_invited', resourceType: 'tenant_user' })
  @Post(['agents/invite', 'csrs/invite'])
  async inviteAgent(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Body() inviteAgentDto: CreateAgentInviteDto,
  ) {
    return this.tenantService.inviteAgent(
      tenant.id,
      inviteAgentDto,
      user.id,
      user.role,
    );
  }

  @ApiOperation({ summary: 'Resend invitation to an inactive team member' })
  @ApiResponse({
    status: 200,
    description: 'Invitation re-sent successfully',
  })
  @ApiResponse({ status: 404, description: 'Team member not found' })
  @ApiResponse({
    status: 409,
    description: 'User is not inactive; cannot resend invite',
  })
  @Roles(...tenantManagementRoles)
  @AuditLog({ action: 'agent_invite_resent', resourceType: 'tenant_user' })
  @Post(['agents/:id/resend-invite', 'csrs/:id/resend-invite'])
  async resendAgentInvite(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) agentId: string,
  ) {
    return this.tenantService.resendAgentInvite(
      tenant.id,
      agentId,
      user.id,
      user.role,
    );
  }

  @ApiOperation({ summary: 'Update Agent' })
  @ApiResponse({ status: 200, description: 'Agent updated successfully' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @Roles(...tenantManagementRoles, 'agent')
  @AuditLog({ action: 'agent_updated', resourceType: 'tenant_user' })
  @Put(['agents/:id', 'csrs/:id'])
  async updateAgent(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) agentId: string,
    @Body() updateAgentDto: UpdateAgentDto,
  ) {
    return this.tenantService.updateAgent(
      tenant.id,
      agentId,
      updateAgentDto,
      user.role,
      user.id,
    );
  }

  @ApiOperation({ summary: 'Update Agent permissions' })
  @ApiResponse({
    status: 200,
    description: 'Agent permissions updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @Roles('owner', 'admin')
  @AuditLog({
    action: 'agent_permissions_updated',
    resourceType: 'tenant_user',
  })
  @Put(['agents/:id/permissions', 'csrs/:id/permissions'])
  async updateAgentPermissions(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) agentId: string,
    @Body('permissions') permissions: Record<string, any>,
  ) {
    return this.tenantService.updateAgentPermissions(
      tenant.id,
      agentId,
      permissions || {},
    );
  }

  @ApiOperation({ summary: 'Delete Agent' })
  @ApiResponse({ status: 200, description: 'Agent deleted successfully' })
  @Roles('owner', 'admin', 'supervisor')
  @AuditLog({ action: 'agent_deleted', resourceType: 'tenant_user' })
  @Delete(['agents/:id', 'csrs/:id'])
  async deleteAgent(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) agentId: string,
  ) {
    await this.tenantService.deleteAgent(tenant.id, agentId, user.role);
    return { message: 'Agent deleted successfully' };
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
    return this.tenantService.validateTelegramToken(
      dto.botToken,
      dto.expectedUsername,
    );
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

  @ApiOperation({
    summary: 'Update Telegram channel bot name, display name, or bot token',
    description:
      'Updates channelName, displayName, and/or bot token. Bot token changes are verified via getMe before being applied, just like creating a new bot.',
  })
  @ApiResponse({
    status: 200,
    description: 'Telegram channel settings updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  @Roles('owner', 'admin')
  @AuditLog({
    action: 'telegram_channel_settings_updated',
    resourceType: 'tenant_channel',
  })
  @Put('channels/:id/telegram-settings')
  async updateTelegramChannelSettings(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body() dto: UpdateTelegramChannelDto,
  ) {
    return this.tenantService.updateTelegramChannelSettings(
      tenant.id,
      channelId,
      dto,
      user.id,
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

  @ApiOperation({ summary: 'Read Telegram webhook health' })
  @ApiResponse({
    status: 200,
    description: 'Telegram webhook health retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  @Roles('owner', 'admin', 'supervisor')
  @Get('channels/:id/telegram-health')
  async telegramChannelHealth(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) channelId: string,
  ) {
    return this.tenantService.telegramChannelHealth(tenant.id, channelId);
  }

  @ApiOperation({ summary: 'Apply bot template to channel' })
  @ApiResponse({
    status: 200,
    description: 'Bot template applied with fresh webhook registration',
  })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  @Roles('owner', 'admin')
  @UseGuards(CommerceTemplateGuard)
  @AuditLog({
    action: 'channel_bot_template_applied',
    resourceType: 'tenant_channel',
  })
  @Put('channels/:id/bot-template')
  async applyChannelTemplate(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body() body: SetChannelTemplateDto,
  ) {
    return this.tenantService.applyChannelTemplate(
      tenant.id,
      channelId,
      {
        templateId: body.templateId,
        useBotTemplate: body.useBotTemplate,
      },
      user.id,
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
  @Roles('owner', 'admin', 'supervisor', 'agent')
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
  @Roles('owner', 'admin', 'supervisor', 'agent')
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
  @Roles('owner', 'admin', 'supervisor', 'agent')
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
  @Roles('owner', 'admin', 'supervisor', 'agent')
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
  @Roles('owner', 'admin', 'supervisor', 'agent')
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
  @Roles('owner', 'admin', 'supervisor', 'agent')
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
