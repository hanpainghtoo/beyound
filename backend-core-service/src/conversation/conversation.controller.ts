import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { ConversationService } from './conversation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('conversations')
export class ConversationController {
  constructor(private conversationService: ConversationService) {}

  @ApiOperation({ summary: 'Create new conversation' })
  @ApiResponse({
    status: 201,
    description: 'Conversation created successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({ action: 'conversation_created', resourceType: 'conversation' })
  @Post()
  async createConversation(
    @CurrentTenant() tenant: { id: string },
    @Body()
    body: { customerId: string; channelId: string; initialMessage?: string },
  ) {
    return this.conversationService.createConversation(
      tenant.id,
      body.customerId,
      body.channelId,
      body.initialMessage,
    );
  }

  @ApiOperation({ summary: 'Get customer conversation history' })
  @ApiResponse({ status: 200, description: 'Conversation history retrieved' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @Get('customer/:customerId/history')
  async getConversationHistory(
    @CurrentTenant() tenant: { id: string },
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.conversationService.getConversationHistory(
      tenant.id,
      customerId,
    );
  }

  @ApiOperation({ summary: 'Mark messages as read' })
  @ApiResponse({ status: 200, description: 'Messages marked as read' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({
    action: 'conversation_messages_marked_read',
    resourceType: 'conversation',
  })
  @Post(':id/mark-read')
  async markMessagesAsRead(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    await this.conversationService.markMessagesAsRead(
      tenant.id,
      conversationId,
    );
    return { message: 'Messages marked as read' };
  }
}
