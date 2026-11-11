import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
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

import { ConversationNoteService } from './conversation-note.service';
import {
  CreateConversationNoteDto,
  UpdateConversationNoteDto,
} from './dto/conversation-note.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Conversation Notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
// Same `agent` primary + `csr` alias convention as AgentController.
@Controller(['agent/conversations', 'csr/conversations'])
export class ConversationNoteController {
  constructor(private readonly noteService: ConversationNoteService) {}

  @ApiOperation({ summary: 'List notes for a conversation' })
  @ApiResponse({ status: 200, description: 'Notes retrieved successfully' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get(':id/notes')
  async listNotes(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Query() query: PaginationDto,
  ) {
    return this.noteService.listNotes(tenant.id, conversationId, {
      page: query.page,
      limit: query.limit,
    });
  }

  @ApiOperation({ summary: 'Add a note to a conversation' })
  @ApiResponse({ status: 201, description: 'Note created successfully' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({
    action: 'conversation_note_created',
    resourceType: 'conversation_note',
  })
  @Post(':id/notes')
  async createNote(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: CreateConversationNoteDto,
  ) {
    return this.noteService.createNote(tenant.id, conversationId, user.id, dto);
  }

  @ApiOperation({ summary: 'Update a conversation note' })
  @ApiResponse({ status: 200, description: 'Note updated successfully' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({
    action: 'conversation_note_updated',
    resourceType: 'conversation_note',
  })
  @Put('notes/:noteId')
  async updateNote(
    @CurrentTenant() tenant: { id: string },
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: UpdateConversationNoteDto,
  ) {
    return this.noteService.updateNote(tenant.id, noteId, dto);
  }

  @ApiOperation({ summary: 'Delete a conversation note' })
  @ApiResponse({ status: 204, description: 'Note deleted successfully' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({
    action: 'conversation_note_deleted',
    resourceType: 'conversation_note',
  })
  @Delete('notes/:noteId')
  @HttpCode(204)
  async deleteNote(
    @CurrentTenant() tenant: { id: string },
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    await this.noteService.deleteNote(tenant.id, noteId);
  }
}
