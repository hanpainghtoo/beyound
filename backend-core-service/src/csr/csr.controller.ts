import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CsrService } from './csr.service';
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
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { CreateOrderFromChatDto } from './dto/create-order.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { tenantOrderReadRoles } from '../common/constants/tenant-roles';

@ApiTags('Commerce Workspace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
@Controller('csr')
export class CsrController {
  constructor(private csrService: CsrService) {}

  @ApiOperation({ summary: 'Get Commerce Workspace statistics' })
  @ApiResponse({
    status: 200,
    description: 'Commerce Workspace stats retrieved',
    type: CommerceWorkspaceStatsDto,
  })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('dashboard/stats')
  async getDashboardStats(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
  ): Promise<CommerceWorkspaceStatsDto> {
    return this.csrService.getCommerceWorkspaceStats(tenant.id, user.id);
  }

  @ApiOperation({
    summary: 'Get authenticated CSR performance for a date range',
  })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('performance')
  getPerformance(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Query('days') days = '7',
  ) {
    return this.csrService.getCsrPerformance(tenant.id, user.id, Number(days));
  }

  @ApiOperation({
    summary: 'Get tenant team performance for supervisors and admins',
  })
  @Roles('owner', 'admin', 'supervisor')
  @Get('performance/team')
  getTeamPerformance(
    @CurrentTenant() tenant: { id: string },
    @Query('days') days = '7',
  ) {
    return this.csrService.getTeamPerformance(tenant.id, Number(days));
  }

  // Conversation Management
  @ApiOperation({ summary: 'Get conversations with filters' })
  @ApiResponse({
    status: 200,
    description: 'Conversations retrieved successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('conversations')
  async getConversations(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Query() filterDto: ConversationFilterDto,
  ) {
    return this.csrService.getConversations(tenant.id, user.id, filterDto);
  }

  @ApiOperation({ summary: 'Get conversation by ID' })
  @ApiResponse({
    status: 200,
    description: 'Conversation retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('conversations/:id')
  async getConversationById(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    return this.csrService.getConversationById(tenant.id, conversationId);
  }

  @ApiOperation({ summary: 'Get conversation messages' })
  @ApiResponse({ status: 200, description: 'Messages retrieved successfully' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('conversations/:id/messages')
  async getConversationMessages(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    return this.csrService.getConversationMessages(tenant.id, conversationId);
  }

  @ApiOperation({
    summary: 'Mark a conversation read or unread in the Commerce Workspace',
  })
  @Roles('owner', 'admin', 'supervisor', 'csr')
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
    return this.csrService.setConversationReadState(
      tenant.id,
      conversationId,
      Boolean(unread),
      user.id,
    );
  }

  @ApiOperation({ summary: 'Send message in conversation' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({ action: 'conversation_message_sent', resourceType: 'message' })
  @Post('conversations/messages')
  async sendMessage(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body() sendMessageDto: SendMessageDto,
  ) {
    return this.csrService.sendMessage(tenant.id, user.id, sendMessageDto);
  }

  @ApiOperation({ summary: 'Update conversation' })
  @ApiResponse({
    status: 200,
    description: 'Conversation updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({ action: 'conversation_updated', resourceType: 'conversation' })
  @Put('conversations/:id')
  async updateConversation(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() updateDto: UpdateConversationDto,
  ) {
    return this.csrService.updateConversation(
      tenant.id,
      conversationId,
      updateDto,
      user.id,
      user.role,
    );
  }

  @ApiOperation({ summary: 'Assign conversation to csr' })
  @ApiResponse({
    status: 200,
    description: 'Conversation assigned successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({ action: 'conversation_assigned', resourceType: 'conversation' })
  @Post('conversations/:id/assign')
  async assignConversation(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body('csrId') csrId: string,
  ) {
    return this.csrService.assignConversation(
      tenant.id,
      conversationId,
      csrId,
      user.id,
      user.role,
    );
  }


  @ApiOperation({
    summary: 'Create a manual order or an order from a chat conversation',
  })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({ action: 'order_created', resourceType: 'order' })
  @Post('orders')
  async createOrderFromChat(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body() createOrderDto: CreateOrderFromChatDto,
  ) {
    return this.csrService.createOrderFromChat(
      tenant.id,
      user.id,
      createOrderDto,
    );
  }

  // Search and Customer Management
  @ApiOperation({ summary: 'Get customers with pagination' })
  @ApiResponse({ status: 200, description: 'Customers retrieved successfully' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('customers')
  async getCustomers(
    @CurrentTenant() tenant: { id: string },
    @Query() paginationDto: PaginationDto,
  ) {
    return this.csrService.getCustomers(tenant.id, paginationDto);
  }

  @ApiOperation({ summary: 'Search conversations' })
  @ApiResponse({ status: 200, description: 'Search results retrieved' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('search/conversations')
  async searchConversations(
    @CurrentTenant() tenant: { id: string },
    @Query('q') query: string,
  ) {
    return this.csrService.searchConversations(tenant.id, query);
  }

  @ApiOperation({ summary: 'Get customer profile' })
  @ApiResponse({ status: 200, description: 'Customer profile retrieved' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('customers/:id')
  async getCustomerProfile(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) customerId: string,
  ) {
    return this.csrService.getCustomerProfile(tenant.id, customerId);
  }

  @ApiOperation({ summary: 'Create customer profile' })
  @ApiResponse({ status: 201, description: 'Customer profile created' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({ action: 'customer_profile_created', resourceType: 'customer' })
  @Post('customers')
  async createCustomerProfile(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body() createData: CreateCustomerDto,
  ) {
    return this.csrService.createCustomerProfile(
      tenant.id,
      createData,
      user.id,
    );
  }

  @ApiOperation({ summary: 'Update customer profile' })
  @ApiResponse({ status: 200, description: 'Customer profile updated' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({ action: 'customer_profile_updated', resourceType: 'customer' })
  @Put('customers/:id')
  async updateCustomerProfile(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) customerId: string,
    @Body() updateData: UpdateCustomerDto,
  ) {
    return this.csrService.updateCustomerProfile(
      tenant.id,
      customerId,
      updateData,
      user.id,
    );
  }
}
