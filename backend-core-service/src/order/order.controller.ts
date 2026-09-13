import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';

import { PaginationDto } from '../common/dto/pagination.dto';
import { UpdateOrderLifecycleDto } from './dto/update-order-lifecycle.dto';
import { UpdateOrderDetailsDto } from './dto/update-order-details.dto';
import {
  isTenantDeliveryRole,
  isTenantManagementRole,
  isTenantPaymentRole,
  tenantOrderReadRoles,
} from '../common/constants/tenant-roles';

@ApiTags('Order Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
@Controller('orders')
export class OrderController {
  constructor(private orderService: OrderService) {}

  @ApiOperation({ summary: 'Get all orders' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  @Roles(...tenantOrderReadRoles)
  @Get()
  async getAllOrders(
    @CurrentTenant() tenant: { id: string },
    @Query() paginationDto: PaginationDto,
  ) {
    return this.orderService.getAllOrders(tenant.id, paginationDto);
  }

  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @Roles(...tenantOrderReadRoles)
  @Get(':id')
  async getOrderById(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) orderId: string,
  ) {
    return this.orderService.getOrderDetail(tenant.id, orderId);
  }

  @ApiOperation({ summary: 'Get order items' })
  @ApiResponse({
    status: 200,
    description: 'Order items retrieved successfully',
  })
  @Roles(...tenantOrderReadRoles)
  @Get(':id/items')
  async getOrderItems(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) orderId: string,
  ) {
    return this.orderService.getOrderItems(tenant.id, orderId);
  }

  @ApiOperation({ summary: 'Update order items, totals, and notes' })
  @ApiResponse({ status: 200, description: 'Order updated successfully' })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({ action: 'order_details_updated', resourceType: 'order' })
  @Put(':id')
  async updateOrderDetails(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() updateDto: UpdateOrderDetailsDto,
  ) {
    const updated = await this.orderService.updateOrderDetails(
      tenant.id,
      orderId,
      updateDto,
      user.id,
    );
    return this.orderService.mapOrderDetail(updated);
  }

  @ApiOperation({ summary: 'Update order status' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({ action: 'order_status_updated', resourceType: 'order' })
  @Put(':id/status')
  async updateOrderStatus(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body('status') status: string,
    @Body('note') note?: string,
  ) {
    const updated = await this.orderService.updateOrderStatus(
      tenant.id,
      orderId,
      status,
      note,
      user.id,
    );
    return this.orderService.mapOrderDetail(updated);
  }

  @ApiOperation({
    summary: 'Update order lifecycle, payment, and delivery fields',
  })
  @ApiResponse({
    status: 200,
    description: 'Order lifecycle updated successfully',
  })
  @Roles(...tenantOrderReadRoles)
  @AuditLog({ action: 'order_lifecycle_updated', resourceType: 'order' })
  @Put(':id/lifecycle')
  async updateOrderLifecycle(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() updateDto: UpdateOrderLifecycleDto,
  ) {
    const isManager = isTenantManagementRole(user.role);
    const canManagePayments = isTenantPaymentRole(user.role);
    const canManageDelivery = isTenantDeliveryRole(user.role);
    const changesPayment =
      updateDto.paidAmount !== undefined ||
      updateDto.paymentStatus !== undefined ||
      updateDto.paymentNotes !== undefined;
    const changesDeliveryDetails =
      updateDto.deliveryAssigneeName !== undefined ||
      updateDto.deliveryAssigneePhone !== undefined ||
      updateDto.deliveryZone !== undefined ||
      updateDto.trackingNumber !== undefined ||
      updateDto.deliveryDate !== undefined;
    const changesStatus = updateDto.status !== undefined;
    const nextStatus = updateDto.status;
    const changesNonDeliveryStatus =
      nextStatus !== undefined &&
      ![
        'preparing',
        'packed',
        'out_for_delivery',
        'delivered',
        'cod_collected',
        'failed_delivery',
        'returned',
        'cancelled',
      ].includes(nextStatus);

    if (changesPayment && !(isManager || canManagePayments)) {
      throw new ForbiddenException(
        'Only workspace finance users, admins, and managers can update payment details',
      );
    }
    if (changesDeliveryDetails && !(isManager || canManageDelivery)) {
      throw new ForbiddenException(
        'Only workspace delivery users, admins, and managers can update delivery details',
      );
    }
    if (changesStatus && !(isManager || canManageDelivery)) {
      throw new ForbiddenException(
        'Only workspace delivery users, owners, admins, and managers can update order statuses',
      );
    }
    if (changesNonDeliveryStatus && canManageDelivery && !isManager) {
      throw new ForbiddenException(
        'Delivery users can only update delivery-stage statuses',
      );
    }
    if (
      (changesDeliveryDetails || changesStatus) &&
      canManagePayments &&
      !isManager
    ) {
      throw new ForbiddenException(
        'Finance users cannot update delivery workflow fields',
      );
    }
    if (changesPayment && canManageDelivery && !isManager) {
      throw new ForbiddenException(
        'Delivery users cannot update payment details',
      );
    }
    const updated = await this.orderService.updateOrderLifecycle(
      tenant.id,
      orderId,
      updateDto,
      user.id,
    );
    return this.orderService.mapOrderDetail(updated);
  }
}
