import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { AgentService } from './agent.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';

import { CommerceWorkspaceStatsDto } from './dto/commerce-workspace-stats.dto';
import { ConversationFilterDto } from './dto/conversation-filter.dto';
import { ConversationMessagesQueryDto } from './dto/conversation-messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { CreateOrderFromChatDto } from './dto/create-order.dto';
import { CustomerListQueryDto } from './dto/customer-list-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { tenantOrderReadRoles } from '../common/constants/tenant-roles';

@ApiTags('Commerce Workspace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
// Plan 35: `agent` is primary; `csr` is a deprecated alias kept for one
// release so pre-rename clients keep working. Remove `csr` next release.
@Controller(['agent', 'csr'])
export class AgentController {
  constructor(private agentService: AgentService) {}

  @ApiOperation({ summary: 'Get Commerce Workspace statistics' })
  @ApiResponse({
    status: 200,
    description: 'Commerce Workspace stats retrieved',
    type: CommerceWorkspaceStatsDto,
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('dashboard/stats')
  async getDashboardStats(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
  ): Promise<CommerceWorkspaceStatsDto> {
    return this.agentService.getCommerceWorkspaceStats(tenant.id, user.id);
  }

  @ApiOperation({
    summary: 'Get authenticated Agent performance for a date range',
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('performance')
  getPerformance(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Query('days') days = '7',
  ) {
    return this.agentService.getAgentPerformance(
      tenant.id,
      user.id,
      Number(days),
    );
  }

  @ApiOperation({
    summary: 'Get tenant team performance for managers and admins',
  })
  @Roles('owner', 'admin', 'supervisor')
  @Get('performance/team')
  getTeamPerformance(
    @CurrentTenant() tenant: { id: string },
    @Query('days') days = '7',
  ) {
    return this.agentService.getTeamPerformance(tenant.id, Number(days));
  }

  // Conversation Management
  @ApiOperation({ summary: 'Get conversations with filters' })
  @ApiResponse({
    status: 200,
    description: 'Conversations retrieved successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('conversations')
  async getConversations(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Query() filterDto: ConversationFilterDto,
  ) {
    return this.agentService.getConversations(tenant.id, user.id, filterDto);
  }

  @ApiOperation({ summary: 'Get conversation by ID' })
  @ApiResponse({
    status: 200,
    description: 'Conversation retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('conversations/:id')
  async getConversationById(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    return this.agentService.getConversationById(tenant.id, conversationId);
  }

  @ApiOperation({
    summary:
      'Fetch a conversation sender avatar for a media-capable provider (bytes, never stored in media)',
  })
  @ApiResponse({ status: 200, description: 'Avatar bytes' })
  @ApiResponse({ status: 404, description: 'No avatar available' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('conversations/:id/sender-avatar')
  async getSenderAvatar(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Res() res: Response,
  ) {
    const result = await this.agentService.getSenderAvatar(
      tenant.id,
      conversationId,
    );
    if (!result) {
      res.status(404).json({ code: 'NO_AVATAR' });
      return;
    }
    res
      .status(200)
      .setHeader('Content-Type', result.contentType || 'image/jpeg')
      .setHeader('Cache-Control', 'private, max-age=3600')
      .send(result.bytes);
  }

  @ApiOperation({ summary: 'Get conversation messages (newest page first)' })
  @ApiResponse({ status: 200, description: 'Messages retrieved successfully' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('conversations/:id/messages')
  async getConversationMessages(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Query() query: ConversationMessagesQueryDto,
  ) {
    return this.agentService.getConversationMessages(
      tenant.id,
      conversationId,
      { limit: query.limit, before: query.before },
    );
  }

  @ApiOperation({ summary: 'Retry a failed agent message as the same message' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Post('messages/:messageId/retry')
  async retryMessage(
    @CurrentTenant() tenant: { id: string },
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.agentService.retryMessage(tenant.id, messageId);
  }

  @ApiOperation({
    summary: 'Download one message attachment (bytes stream or redirect)',
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('messages/:messageId/attachments/:index/content')
  async getMessageAttachmentContent(
    @CurrentTenant() tenant: { id: string },
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('index', ParseIntPipe) index: number,
    @Res() res: Response,
  ) {
    const result = await this.agentService.getMessageAttachmentContent(
      tenant.id,
      messageId,
      index,
    );
    if (result.kind === 'redirect') {
      return res.redirect(result.url);
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${result.fileName.replace(/"/g, '')}"`,
    );
    res.setHeader('Content-Length', String(result.bytes.length));
    return res.send(result.bytes);
  }

  @ApiOperation({
    summary: 'Mark a conversation read or unread in the Commerce Workspace',
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({
    action: 'conversation_read_state_updated',
    resourceType: 'conversation',
  })
  @Put('conversations/:id/read-state')
  async setConversationReadState(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body('unread') unread: boolean,
  ) {
    return this.agentService.setConversationReadState(
      tenant.id,
      conversationId,
      Boolean(unread),
      user.id,
    );
  }

  @ApiOperation({ summary: 'Send message in conversation' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({ action: 'conversation_message_sent', resourceType: 'message' })
  @Post('conversations/messages')
  async sendMessage(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body() sendMessageDto: SendMessageDto,
  ) {
    return this.agentService.sendMessage(tenant.id, user.id, sendMessageDto);
  }

  @ApiOperation({ summary: 'Update conversation' })
  @ApiResponse({
    status: 200,
    description: 'Conversation updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({ action: 'conversation_updated', resourceType: 'conversation' })
  @Put('conversations/:id')
  async updateConversation(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() updateDto: UpdateConversationDto,
  ) {
    return this.agentService.updateConversation(
      tenant.id,
      conversationId,
      updateDto,
      user.id,
      user.role,
    );
  }

  @ApiOperation({ summary: 'Assign conversation to agent' })
  @ApiResponse({
    status: 200,
    description: 'Conversation assigned successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({ action: 'conversation_assigned', resourceType: 'conversation' })
  @Post('conversations/:id/assign')
  async assignConversation(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() body: { agentId?: string | null; csrId?: string },
  ) {
    // Explicit null clears the assignment (back to the pool). Absent/empty
    // is still rejected so a malformed call cannot silently unassign.
    // Plan 35 shim: accept legacy `csrId` alongside `agentId`.
    if (body.agentId === null) {
      return this.agentService.unassignConversation(
        tenant.id,
        conversationId,
        user.id,
        user.role,
      );
    }
    const agentId = body.agentId ?? body.csrId;
    if (!agentId) {
      throw new BadRequestException('agentId is required');
    }
    return this.agentService.assignConversation(
      tenant.id,
      conversationId,
      agentId,
      user.id,
      user.role,
    );
  }

  @ApiOperation({
    summary: 'Create a manual order or an order from a chat conversation',
  })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({ action: 'order_created', resourceType: 'order' })
  @Post('orders')
  async createOrderFromChat(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body() createOrderDto: CreateOrderFromChatDto,
  ) {
    return this.agentService.createOrderFromChat(
      tenant.id,
      user.id,
      createOrderDto,
    );
  }

  // Search and Customer Management
  @ApiOperation({ summary: 'Get customers with pagination' })
  @ApiResponse({ status: 200, description: 'Customers retrieved successfully' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('customers')
  async getCustomers(
    @CurrentTenant() tenant: { id: string },
    @Query() paginationDto: CustomerListQueryDto,
  ) {
    return this.agentService.getCustomers(tenant.id, paginationDto);
  }

  @ApiOperation({ summary: 'Search conversations' })
  @ApiResponse({ status: 200, description: 'Search results retrieved' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('search/conversations')
  async searchConversations(
    @CurrentTenant() tenant: { id: string },
    @Query('q') query: string,
  ) {
    return this.agentService.searchConversations(tenant.id, query);
  }

  @ApiOperation({ summary: 'Get customer profile' })
  @ApiResponse({ status: 200, description: 'Customer profile retrieved' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('customers/:id')
  async getCustomerProfile(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) customerId: string,
  ) {
    return this.agentService.getCustomerProfile(tenant.id, customerId);
  }

  @ApiOperation({ summary: 'Create customer profile' })
  @ApiResponse({ status: 201, description: 'Customer profile created' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({ action: 'customer_profile_created', resourceType: 'customer' })
  @Post('customers')
  async createCustomerProfile(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body() createData: CreateCustomerDto,
  ) {
    return this.agentService.createCustomerProfile(
      tenant.id,
      createData,
      user.id,
    );
  }

  @ApiOperation({ summary: 'Update customer profile' })
  @ApiResponse({ status: 200, description: 'Customer profile updated' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({ action: 'customer_profile_updated', resourceType: 'customer' })
  @Put('customers/:id')
  async updateCustomerProfile(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) customerId: string,
    @Body() updateData: UpdateCustomerDto,
  ) {
    return this.agentService.updateCustomerProfile(
      tenant.id,
      customerId,
      updateData,
      user.id,
    );
  }
}
