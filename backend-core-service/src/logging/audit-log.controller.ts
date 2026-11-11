import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantAuditLogsQueryDto } from './dto/tenant-audit-logs-query.dto';
import { TenantAuditSummaryQueryDto } from './dto/tenant-audit-summary-query.dto';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @ApiOperation({ summary: 'Get platform audit logs' })
  @ApiResponse({
    status: 200,
    description: 'Platform audit logs retrieved successfully',
  })
  @Roles('super_admin', 'ops_admin', 'it_admin')
  @Get('platform')
  async getPlatformAuditLogs(@Query() paginationDto: PaginationDto) {
    return this.auditLogService.getPlatformAuditLogs(paginationDto);
  }
}

@ApiTags('Tenant Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('tenant/audit-logs')
export class TenantAuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @ApiOperation({ summary: 'Get tenant audit logs' })
  @ApiResponse({
    status: 200,
    description: 'Tenant audit logs retrieved successfully',
  })
  @Roles('owner', 'admin', 'supervisor')
  @Get()
  async getTenantAuditLogs(
    @CurrentTenant() tenant: { id: string },
    @Query() query: TenantAuditLogsQueryDto,
  ) {
    return this.auditLogService.getTenantAuditLogs(
      tenant.id,
      query,
      query.userId,
    );
  }

  @ApiOperation({
    summary: 'Get per-member audit rollup with exact event counts',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant audit member rollup retrieved successfully',
  })
  @Roles('owner', 'admin', 'supervisor')
  @Get('summary')
  async getTenantAuditSummary(
    @CurrentTenant() tenant: { id: string },
    @Query() query: TenantAuditSummaryQueryDto,
  ) {
    return this.auditLogService.getTenantAuditSummary(tenant.id, query);
  }
}
