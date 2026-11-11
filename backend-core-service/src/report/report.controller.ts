import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportService } from './report.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { TenantGuard } from '../common/guards/tenant.guard';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  private getTenantId(req: any): string {
    const tenantId = req.tenant?.id;
    if (!tenantId) throw new ForbiddenException('Tenant ID required');
    return tenantId;
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue report' })
  async getRevenue(@Req() req: any, @Query() query: ReportQueryDto) {
    return this.reportService.getRevenueReport(
      this.getTenantId(req),
      query.period!,
      query.startDate,
      query.endDate,
    );
  }

  @Get('team-performance')
  @ApiOperation({ summary: 'Team performance report (Agent only)' })
  async getTeamPerformance(@Req() req: any, @Query() query: ReportQueryDto) {
    return this.reportService.getTeamPerformanceReport(
      this.getTenantId(req),
      query.period!,
      query.startDate,
      query.endDate,
    );
  }

  @Get('customers')
  @ApiOperation({ summary: 'Customer report' })
  async getCustomers(@Req() req: any, @Query() query: ReportQueryDto) {
    return this.reportService.getCustomerReport(
      this.getTenantId(req),
      query.period!,
      query.startDate,
      query.endDate,
    );
  }

  @Get('products')
  @ApiOperation({ summary: 'Product report' })
  async getProducts(@Req() req: any, @Query() query: ReportQueryDto) {
    return this.reportService.getProductReport(
      this.getTenantId(req),
      query.period!,
      query.startDate,
      query.endDate,
    );
  }

  @Get('channels')
  @ApiOperation({ summary: 'Channel report' })
  async getChannels(@Req() req: any, @Query() query: ReportQueryDto) {
    return this.reportService.getChannelReport(
      this.getTenantId(req),
      query.period!,
      query.startDate,
      query.endDate,
    );
  }
}
