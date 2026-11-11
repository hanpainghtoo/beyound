import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLog } from '../logging/decorators/audit-log.decorator';
import { CreateLeadDto } from './dto/create-lead.dto';
import { ReviewPlanChangeRequestDto } from './dto/review-plan-change-request.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadService } from './lead.service';

@ApiTags('Public Leads')
@Controller('public/leads')
export class PublicLeadController {
  constructor(private readonly leadService: LeadService) {}

  @Post()
  @ApiOperation({ summary: 'Capture a public website lead' })
  createLead(@Body() input: CreateLeadDto) {
    return this.leadService.createLead(input);
  }
}

@ApiTags('Platform Leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform-admin/leads')
export class PlatformLeadController {
  constructor(private readonly leadService: LeadService) {}

  @Get()
  @Roles('super_admin', 'ops_admin')
  @ApiOperation({ summary: 'List captured public leads' })
  listLeads(@Query() query: Record<string, string | undefined>) {
    return this.leadService.listLeads(query);
  }

  @Put(':id')
  @Roles('super_admin', 'ops_admin')
  @AuditLog({ action: 'platform_lead_updated', resourceType: 'platform_lead' })
  @ApiOperation({ summary: 'Update public lead follow-up state' })
  updateLead(@Param('id') id: string, @Body() input: UpdateLeadDto) {
    return this.leadService.updateLead(id, input);
  }

  @Post(':id/approve-plan-change')
  @Roles('super_admin', 'ops_admin')
  @AuditLog({
    action: 'tenant_plan_change_request_approved',
    resourceType: 'platform_lead',
  })
  @ApiOperation({
    summary: 'Approve a workspace plan change request for operator follow-up',
  })
  approvePlanChangeRequest(
    @Param('id') id: string,
    @Body() input: ReviewPlanChangeRequestDto,
  ) {
    return this.leadService.approvePlanChangeRequest(id, input);
  }

  @Post(':id/reject-plan-change')
  @Roles('super_admin', 'ops_admin')
  @AuditLog({
    action: 'tenant_plan_change_request_rejected',
    resourceType: 'platform_lead',
  })
  @ApiOperation({ summary: 'Reject a workspace plan change request' })
  rejectPlanChangeRequest(
    @Param('id') id: string,
    @Body() input: ReviewPlanChangeRequestDto,
  ) {
    return this.leadService.rejectPlanChangeRequest(id, input);
  }
}
