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

import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FeatureGuard } from '../common/guards/feature.guard';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';

import { OrderListQueryDto } from './dto/order-list-query.dto';
import { UpdateOrderPaymentStatusDto } from './dto/update-order-payment-status.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdateOrderDeliveryStatusDto } from './dto/update-order-delivery-status.dto';
import { OrderTransitionService } from './order-transition.service';
import { UpdateOrderDetailsDto } from './dto/update-order-details.dto';
import { LinkOrderAttachmentDto } from './dto/link-order-attachment.dto';
import {
  CreateOrderPaymentDto,
  MarkOrderUnpaidDto,
} from './dto/create-order-payment.dto';
import { tenantOrderReadRoles } from '../common/constants/tenant-roles';

@ApiTags('Order Management')
@ApiBearerAuth()
@UseGuards(
  JwtAuthGuard,
  TenantGuard,
  EntitlementGuard,
  FeatureGuard,
  RolesGuard,
)
@RequireFeature('orders')
@Controller('orders')
export class OrderController {
  constructor(
    private orderService: OrderService,
    private transitionService: OrderTransitionService,
  ) {}

  @ApiOperation({ summary: 'Get all orders' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  @Roles(...tenantOrderReadRoles)
  @Get()
  async getAllOrders(
    @CurrentTenant() tenant: { id: string },
    @Query() paginationDto: OrderListQueryDto,
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
  @Roles('owner', 'admin', 'supervisor', 'agent')
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
    return await this.orderService.mapOrderDetail(updated);
  }

  @Put(':id/attachments')
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({ action: 'order_attachment_linked', resourceType: 'order' })
  async linkAttachment(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() input: LinkOrderAttachmentDto,
  ) {
    return this.orderService.linkAttachment(tenant.id, orderId, input);
  }

  @ApiOperation({ summary: 'Update order status' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @AuditLog({ action: 'order_status_updated', resourceType: 'order' })
  @Put(':id/status')
  async updateOrderStatus(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() updateDto: UpdateOrderStatusDto,
  ) {
    const updated = await this.orderService.updateOrderStatus(
      tenant.id,
      orderId,
      updateDto.status,
      updateDto.reason,
      user.id,
    );
    return await this.orderService.mapOrderDetail(updated);
  }

  @ApiOperation({ summary: 'Update payment status' })
  @AuditLog({ action: 'order_payment_status_updated', resourceType: 'order' })
  @Roles('owner', 'admin', 'supervisor', 'agent', 'finance')
  @Put(':id/payment-status')
  async updatePaymentStatus(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() updateDto: UpdateOrderPaymentStatusDto,
  ) {
    const updated = await this.orderService.updatePaymentStatus(
      tenant.id,
      orderId,
      updateDto.status,
      user.id,
      updateDto.attachmentReference,
      updateDto.reason,
    );
    return await this.orderService.mapOrderDetail(updated);
  }

  @ApiOperation({ summary: 'List payment transactions for an order' })
  @Roles(...tenantOrderReadRoles)
  @Get(':id/payments')
  async listPaymentTransactions(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) orderId: string,
  ) {
    return this.orderService.listPaymentTransactions(tenant.id, orderId);
  }

  @ApiOperation({ summary: 'Submit a payment for an order' })
  @ApiResponse({ status: 201, description: 'Payment recorded successfully' })
  @Roles('owner', 'admin', 'supervisor', 'agent', 'finance')
  @AuditLog({ action: 'order_payment_recorded', resourceType: 'order' })
  @Post(':id/payments')
  async recordPayment(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() input: CreateOrderPaymentDto,
  ) {
    const updated = await this.orderService.recordPayment(
      tenant.id,
      orderId,
      input,
      user.id,
    );
    return await this.orderService.mapOrderDetail(updated);
  }

  @ApiOperation({ summary: 'Mark an order payment as unpaid' })
  @Roles('owner', 'admin', 'supervisor', 'agent', 'finance')
  @AuditLog({ action: 'order_payment_marked_unpaid', resourceType: 'order' })
  @Post(':id/payments/mark-unpaid')
  async markOrderUnpaid(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() input: MarkOrderUnpaidDto,
  ) {
    const updated = await this.orderService.markOrderUnpaid(
      tenant.id,
      orderId,
      input,
      user.id,
    );
    return await this.orderService.mapOrderDetail(updated);
  }

  @ApiOperation({ summary: 'Update delivery status' })
  @AuditLog({ action: 'order_delivery_status_updated', resourceType: 'order' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Put(':id/delivery-status')
  async updateDeliveryStatus(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() updateDto: UpdateOrderDeliveryStatusDto,
  ) {
    const updated = await this.transitionService.transitionDelivery(
      tenant.id,
      orderId,
      {
        to: updateDto.status,
        reason: updateDto.reason,
        actorId: user.id,
        actorType: 'tenant_user',
      },
    );
    return await this.orderService.mapOrderDetail(updated);
  }
}
