import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { ChannelTemplateService } from './channel-template.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';

import {
  CreateChannelTemplateDto,
  UpdateChannelTemplateDto,
} from './dto/channel-template.dto';

@ApiTags('Platform Admin - Channel Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform-admin/channel-templates')
export class ChannelTemplateController {
  constructor(private channelTemplateService: ChannelTemplateService) {}

  @ApiOperation({ summary: 'Get all channel templates' })
  @ApiResponse({
    status: 200,
    description: 'Channel templates retrieved successfully',
  })
  @Roles('super_admin', 'ops_admin', 'it_admin')
  @Get()
  async getAllChannelTemplates() {
    return this.channelTemplateService.getAllChannelTemplates();
  }

  @ApiOperation({ summary: 'Get channel template by ID' })
  @ApiResponse({
    status: 200,
    description: 'Channel template retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Channel template not found' })
  @Roles('super_admin', 'ops_admin', 'it_admin')
  @Get(':id')
  async getChannelTemplateById(@Param('id') id: string) {
    return this.channelTemplateService.getChannelTemplateById(id);
  }

  @ApiOperation({ summary: 'Get channel templates by type' })
  @ApiResponse({
    status: 200,
    description: 'Channel templates retrieved successfully',
  })
  @Roles('super_admin', 'ops_admin', 'it_admin')
  @Get('type/:channelType')
  async getChannelTemplatesByType(@Param('channelType') channelType: string) {
    return this.channelTemplateService.getChannelTemplatesByType(channelType);
  }

  @ApiOperation({ summary: 'Create new channel template' })
  @ApiResponse({
    status: 201,
    description: 'Channel template created successfully',
  })
  @Roles('super_admin', 'ops_admin', 'it_admin')
  @AuditLog({
    action: 'channel_template_created',
    resourceType: 'channel_template',
  })
  @Post()
  async createChannelTemplate(
    @Body() createTemplateDto: CreateChannelTemplateDto,
  ) {
    return this.channelTemplateService.createChannelTemplate(createTemplateDto);
  }

  @ApiOperation({ summary: 'Update channel template' })
  @ApiResponse({
    status: 200,
    description: 'Channel template updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Channel template not found' })
  @Roles('super_admin', 'ops_admin', 'it_admin')
  @AuditLog({
    action: 'channel_template_updated',
    resourceType: 'channel_template',
  })
  @Put(':id')
  async updateChannelTemplate(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateChannelTemplateDto,
  ) {
    return this.channelTemplateService.updateChannelTemplate(
      id,
      updateTemplateDto,
    );
  }

  @ApiOperation({ summary: 'Delete channel template' })
  @ApiResponse({
    status: 200,
    description: 'Channel template deleted successfully',
  })
  @Roles('super_admin', 'it_admin')
  @AuditLog({
    action: 'channel_template_deleted',
    resourceType: 'channel_template',
  })
  @Delete(':id')
  async deleteChannelTemplate(@Param('id') id: string) {
    await this.channelTemplateService.deleteChannelTemplate(id);
    return { message: 'Channel template deleted successfully' };
  }
}
