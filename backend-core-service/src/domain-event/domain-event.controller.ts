import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { DomainEventService } from './domain-event.service';

@ApiTags('Domain Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('domain-events')
export class DomainEventController {
  constructor(private domainEventService: DomainEventService) {}

  @ApiOperation({ summary: 'Get customer timeline events' })
  @ApiResponse({
    status: 200,
    description: 'Customer timeline events retrieved successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('customers/:id/timeline')
  async getCustomerTimeline(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) customerId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.domainEventService.getCustomerTimeline(tenant.id, customerId, {
      page,
      limit,
    });
  }

  @ApiOperation({ summary: 'Get domain events for an entity' })
  @ApiResponse({
    status: 200,
    description: 'Domain events retrieved successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get(':entityType/:id')
  async getEntityEvents(
    @CurrentTenant() tenant: { id: string },
    @Param('entityType') entityType: string,
    @Param('id', ParseUUIDPipe) entityId: string,
  ) {
    return this.domainEventService.getEntityEvents(
      tenant.id,
      entityType,
      entityId,
    );
  }
}
