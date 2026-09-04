import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { DeliveryService } from './delivery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import {
  tenantOrderReadRoles,
  tenantDeliveryRoles,
} from '../common/constants/tenant-roles';
import { DeliveriesFilterDto } from './dto/deliveries-filter.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';

@ApiTags('Deliveries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
@Controller('deliveriesApi')
export class DeliveryController {
  constructor(private deliveryService: DeliveryService) {}

  @Get('deliveries-list')
  @ApiOperation({
    summary: 'List deliveries for the workspace deliveries page',
  })
  @ApiResponse({
    status: 200,
    description: 'Deliveries retrieved successfully',
  })
  @Roles(...tenantOrderReadRoles)
  async listDeliveries(
    @CurrentTenant() tenant: { id: string },
    @Query() filterDto: DeliveriesFilterDto,
  ) {
    return this.deliveryService.getDeliveries(tenant.id, filterDto);
  }

  @Get('deliveries-detail/:id')
  @ApiOperation({ summary: 'Get delivery detail by order ID' })
  @ApiResponse({ status: 200, description: 'Delivery retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Delivery not found' })
  @Roles(...tenantOrderReadRoles)
  async getDeliveryDetail(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) orderId: string,
  ) {
    return this.deliveryService.getDeliveryDetail(tenant.id, orderId);
  }

  @Patch('deliveries-update/:id')
  @ApiOperation({ summary: 'Update delivery status and fields' })
  @ApiResponse({ status: 200, description: 'Delivery updated successfully' })
  @ApiResponse({ status: 404, description: 'Delivery not found' })
  @Roles(...tenantDeliveryRoles)
  async updateDelivery(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() updateDto: UpdateDeliveryDto,
  ) {
    return this.deliveryService.updateDelivery(
      tenant.id,
      orderId,
      updateDto,
      user.id,
    );
  }
}
