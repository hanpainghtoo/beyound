import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import type { OrderListItem } from './interfaces/order-list-item.interface';
import { Product } from '../product/entities/product.entity';
import { DomainEventService } from '../domain-event/domain-event.service';
import { UpdateOrderLifecycleDto } from './dto/update-order-lifecycle.dto';
import { UpdateOrderDetailsDto } from './dto/update-order-details.dto';
import type { PaginationDto } from '../common/dto/pagination.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import {
  attachmentFileIds,
  normalizeAttachmentLinks,
} from '../common/attachments/attachment-link.util';

export type { OrderListItem };

const orderSortColumns: Record<string, string> = {
  createdAt: 'order.createdAt',
  updatedAt: 'order.updatedAt',
  orderNumber: 'order.orderNumber',
  status: 'order.status',
  paymentStatus: 'order.paymentStatus',
  paymentMethod: 'order.paymentMethod',
  totalAmount: 'order.totalAmount',
  deliveryDate: 'order.deliveryDate',
};

const failedDeliveryStatuses = new Set([
  'failed_delivery',
  'returned',
  'cancelled',
]);
const activeDeliveryStatuses = new Set([
  'preparing',
  'packed',
  'out_for_delivery',
  'delivered',
]);

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    private domainEventService: DomainEventService,
  ) {}

  async getAllOrders(
    tenantId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<OrderListItem>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy,
      sortOrder,
      status,
      paymentStatus,
      customerId,
      channelId,
      dateFrom,
      dateTo,
    } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin('order.customer', 'customer')
      .leftJoin('order.conversation', 'conversation')
      .select([
        'order',
        'customer.id',
        'customer.fullName',
        'customer.phone',
        'customer.avatarUrl',
        'conversation.id',
        'conversation.channelId',
        'conversation.status',
        'conversation.subject',
        'conversation.priority',
      ])
      .where('order.tenant_id = :tenantId', { tenantId });

    if (search) {
      queryBuilder.andWhere(
        '(order.order_number ILIKE :search OR customer.full_name ILIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (status) {
      queryBuilder.andWhere('order.status = :status', { status });
    }

    if (paymentStatus) {
      queryBuilder.andWhere('order.payment_status = :paymentStatus', {
        paymentStatus,
      });
    }

    if (customerId) {
      queryBuilder.andWhere('order.customer_id = :customerId', { customerId });
    }

    if (channelId) {
      queryBuilder.andWhere('conversation.channel_id = :channelId', {
        channelId,
      });
    }

    if (dateFrom) {
      queryBuilder.andWhere('order.created_at >= :dateFrom', {
        dateFrom: new Date(dateFrom),
      });
    }

    if (dateTo) {
      const inclusiveEnd = new Date(dateTo);
      inclusiveEnd.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('order.created_at <= :dateTo', {
        dateTo: inclusiveEnd,
      });
    }

    console.log('[DEBUG SQL]', queryBuilder.getSql());

    const [data, total] = await queryBuilder
      .orderBy(
        orderSortColumns[sortBy || 'createdAt'] || 'order.createdAt',
        sortOrder || 'DESC',
      )
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPages = Math.ceil(total / limit);

    const mappedData = data.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount,
      currency: order.currency,
      conversationId: order.conversationId || order.conversation?.id || null,
      createdAt: order.createdAt,
      customer: order.customer
        ? {
            id: order.customer.id,
            fullName: order.customer.fullName,
            avatarUrl: order.customer.avatarUrl || null,
            tags: order.customer.tags || [],
          }
        : null,
    }));

    return {
      data: mappedData,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  mapOrderDetail(order: Order) {
    const statusHistory = Array.isArray(order.statusHistory)
      ? order.statusHistory
      : [];

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      discountAmount: order.discountAmount,
      shippingFee: order.shippingFee,
      totalAmount: order.totalAmount,
      paidAmount: order.paidAmount,
      balanceDue: order.balanceDue,
      codAmount: order.codAmount,
      currency: order.currency,
      notes: order.notes,
      paymentNotes: order.paymentNotes,
      conversationId: order.conversationId || order.conversation?.id || null,
      deliveryAssigneeName: order.deliveryAssigneeName,
      deliveryAssigneePhone: order.deliveryAssigneePhone,
      deliveryZone: order.deliveryZone,
      trackingNumber: order.trackingNumber,
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      deliveryDate: order.deliveryDate,
      attachments: order.attachments || [],
      createdAt: order.createdAt,
      customer: order.customer
        ? {
            id: order.customer.id,
            fullName: order.customer.fullName,
            phone: order.customer.phone || null,
            email: order.customer.email || null,
            avatarUrl: order.customer.avatarUrl || null,
          }
        : null,
      statusHistory: statusHistory.map((event: Record<string, unknown>) => ({
        status:
          typeof event.status === 'string'
            ? event.status
            : event.status != null
              ? `${event.status as string | number}`
              : '',
        previousStatus:
          typeof event.previousStatus === 'string'
            ? event.previousStatus
            : null,
        note: typeof event.note === 'string' ? event.note : null,
        source: typeof event.source === 'string' ? event.source : null,
        timestamp: typeof event.timestamp === 'string' ? event.timestamp : null,
        actorId: typeof event.actorId === 'string' ? event.actorId : null,
      })),
    };
  }

  async getOrderDetail(tenantId: string, orderId: string) {
    const order = await this.getOrderById(tenantId, orderId);
    return this.mapOrderDetail(order);
  }

  async getOrderById(tenantId: string, orderId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, tenantId },
      relations: ['customer', 'conversation'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async getOrderItems(tenantId: string, orderId: string): Promise<OrderItem[]> {
    // Verify order exists
    await this.getOrderById(tenantId, orderId);

    return this.orderItemRepository.find({
      where: { orderId },
      relations: ['product'],
    });
  }

  async updateOrderStatus(
    tenantId: string,
    orderId: string,
    status: string,
    note?: string,
    actorId?: string,
  ): Promise<Order> {
    return this.updateOrderLifecycle(
      tenantId,
      orderId,
      { status, note },
      actorId,
    );
  }

  async updateOrderDetails(
    tenantId: string,
    orderId: string,
    updateDto: UpdateOrderDetailsDto,
    actorId?: string,
  ): Promise<Order> {
    const order = await this.getOrderById(tenantId, orderId);
    const existingItems = await this.orderItemRepository.find({
      where: { orderId },
    });

    let subtotal = 0;
    const replacementItems: OrderItem[] = [];

    for (const item of updateDto.items) {
      const product = await this.productRepository.findOne({
        where: { id: item.productId, tenantId },
      });

      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const itemTotal = quantity * unitPrice;
      subtotal += itemTotal;

      replacementItems.push(
        this.orderItemRepository.create({
          orderId,
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          productSnapshot: {
            productId: product.id,
            name: product.name,
            sku: product.sku,
            type: product.type,
            price: product.price,
            status: product.status,
          },
          variationSnapshot: item.variation || {},
          quantity,
          unitPrice,
          totalPrice: itemTotal,
          notes: item.notes,
        }),
      );
    }

    order.paymentMethod =
      updateDto.paymentMethod || order.paymentMethod || 'cod';
    order.subtotal = subtotal;
    order.taxAmount = Number(updateDto.taxAmount ?? order.taxAmount ?? 0);
    order.discountAmount = Number(
      updateDto.discountAmount ?? order.discountAmount ?? 0,
    );
    order.shippingFee = Number(updateDto.shippingFee ?? order.shippingFee ?? 0);
    order.totalAmount = Math.max(
      subtotal +
        Number(order.taxAmount || 0) +
        Number(order.shippingFee || 0) -
        Number(order.discountAmount || 0),
      0,
    );
    order.notes = updateDto.notes !== undefined ? updateDto.notes : order.notes;
    if (updateDto.shippingAddress !== undefined)
      order.shippingAddress = updateDto.shippingAddress;
    if (updateDto.billingAddress !== undefined)
      order.billingAddress = updateDto.billingAddress;
    order.balanceDue = Math.max(
      Number(order.totalAmount || 0) - Number(order.paidAmount || 0),
      0,
    );
    order.codAmount = order.paymentMethod === 'cod' ? order.balanceDue : 0;

    if (Number(order.paidAmount || 0) >= Number(order.totalAmount || 0)) {
      order.paymentStatus =
        order.paymentMethod === 'cod' ? 'cod_collected' : 'paid';
    } else if (Number(order.paidAmount || 0) > 0) {
      order.paymentStatus = 'partially_paid';
    } else {
      order.paymentStatus =
        order.paymentMethod === 'cod' ? 'cod_pending' : 'pending';
    }

    order.statusHistory = [
      ...(order.statusHistory || []),
      {
        status: order.status,
        previousStatus: order.status,
        actorId,
        source: 'api',
        note: 'Order details updated',
        metadata: {
          previousItemCount: existingItems.length,
          nextItemCount: replacementItems.length,
        },
        timestamp: new Date().toISOString(),
      },
    ];

    await this.orderItemRepository.delete({ orderId });
    await this.orderRepository.save(order);
    if (replacementItems.length) {
      await this.orderItemRepository.save(replacementItems);
    }

    await this.domainEventService.append({
      tenantId,
      actorId,
      actorType: 'tenant_user',
      entityType: 'order',
      entityId: orderId,
      eventType: 'order.updated',
      payload: {
        customerId: order.customerId,
        conversationId: order.conversationId,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        previousItemCount: existingItems.length,
        nextItemCount: replacementItems.length,
      },
    });

    const loadedOrder = await this.orderRepository.findOne({
      where: { id: orderId, tenantId },
      relations: ['customer', 'conversation', 'creator'],
    });

    return loadedOrder || order;
  }

  async updateOrderLifecycle(
    tenantId: string,
    orderId: string,
    updateDto: UpdateOrderLifecycleDto,
    actorId?: string,
  ): Promise<Order> {
    const order = await this.getOrderById(tenantId, orderId);
    const previousStatus = order.status;
    const previousPaymentStatus = order.paymentStatus;
    const attachmentsUpdated = updateDto.attachments !== undefined;
    const trimmedNote = updateDto.note?.trim();
    const lifecycleChanged = [
      'status',
      'paymentStatus',
      'paidAmount',
      'deliveryAssigneeName',
      'deliveryAssigneePhone',
      'deliveryZone',
      'trackingNumber',
      'paymentNotes',
      'deliveryDate',
      'attachments',
    ].some(
      (field) =>
        updateDto[field as keyof UpdateOrderLifecycleDto] !== undefined,
    );

    if (
      updateDto.status &&
      failedDeliveryStatuses.has(updateDto.status) &&
      !trimmedNote
    ) {
      throw new BadRequestException(
        'A delivery or cancellation reason is required',
      );
    }

    if (updateDto.status) order.status = updateDto.status;
    if (updateDto.deliveryAssigneeName !== undefined)
      order.deliveryAssigneeName = updateDto.deliveryAssigneeName;
    if (updateDto.deliveryAssigneePhone !== undefined)
      order.deliveryAssigneePhone = updateDto.deliveryAssigneePhone;
    if (updateDto.deliveryZone !== undefined)
      order.deliveryZone = updateDto.deliveryZone;
    if (updateDto.trackingNumber !== undefined)
      order.trackingNumber = updateDto.trackingNumber;
    if (updateDto.paymentNotes !== undefined)
      order.paymentNotes = updateDto.paymentNotes;
    if (updateDto.paymentStatus) order.paymentStatus = updateDto.paymentStatus;
    if (updateDto.deliveryDate)
      order.deliveryDate = new Date(updateDto.deliveryDate);
    if (attachmentsUpdated) {
      order.attachments = normalizeAttachmentLinks(updateDto.attachments, {
        defaultRole: 'order_attachment',
        source: 'order_lifecycle',
      });
    }

    if (updateDto.paidAmount !== undefined) {
      order.paidAmount = updateDto.paidAmount;
      order.balanceDue = Math.max(
        Number(order.totalAmount || 0) - Number(updateDto.paidAmount || 0),
        0,
      );
      if (!updateDto.paymentStatus) {
        order.paymentStatus =
          order.balanceDue <= 0
            ? order.paymentMethod === 'cod'
              ? 'cod_collected'
              : 'paid'
            : updateDto.paidAmount > 0
              ? 'partially_paid'
              : order.paymentStatus;
      }
    }

    if (
      updateDto.status &&
      failedDeliveryStatuses.has(updateDto.status) &&
      order.paymentMethod === 'cod' &&
      order.paymentStatus !== 'cod_collected'
    ) {
      order.codAmount = 0;
      order.balanceDue = 0;
      order.paymentStatus = 'failed';
    } else if (
      updateDto.status &&
      activeDeliveryStatuses.has(updateDto.status) &&
      order.paymentMethod === 'cod' &&
      order.paymentStatus === 'failed'
    ) {
      order.balanceDue = Math.max(
        Number(order.totalAmount || 0) - Number(order.paidAmount || 0),
        0,
      );
      order.codAmount = order.balanceDue;
      if (order.balanceDue > 0) {
        order.paymentStatus = 'cod_pending';
      }
    }

    if (order.status === 'cod_collected' && !order.codCollectedAt) {
      order.codCollectedAt = new Date();
      order.paymentStatus = 'cod_collected';
      order.paidAmount = Number(order.totalAmount || 0);
      order.balanceDue = 0;
    }

    if (lifecycleChanged || updateDto.note) {
      order.statusHistory = [
        ...(order.statusHistory || []),
        {
          status: order.status,
          previousStatus,
          actorId,
          source: 'api',
          note: trimmedNote,
          metadata: {
            ...(updateDto.metadata || {}),
          },
          timestamp: new Date().toISOString(),
        },
      ];
    }

    const savedOrder = await this.orderRepository.save(order);

    if (updateDto.status && updateDto.status !== previousStatus) {
      await this.domainEventService.append({
        tenantId,
        actorId,
        actorType: 'tenant_user',
        entityType: 'order',
        entityId: orderId,
        eventType: 'order.status_changed',
        payload: {
          customerId: savedOrder.customerId,
          conversationId: savedOrder.conversationId,
          previousStatus,
          status: updateDto.status,
          note: trimmedNote,
        },
      });
    }

    if (
      savedOrder.paymentStatus !== previousPaymentStatus ||
      updateDto.paidAmount !== undefined
    ) {
      await this.domainEventService.append({
        tenantId,
        actorId,
        actorType: 'tenant_user',
        entityType: 'order',
        entityId: orderId,
        eventType: 'order.payment_updated',
        payload: {
          customerId: savedOrder.customerId,
          conversationId: savedOrder.conversationId,
          previousPaymentStatus,
          paymentStatus: savedOrder.paymentStatus,
          paidAmount: savedOrder.paidAmount,
          balanceDue: savedOrder.balanceDue,
        },
      });
    }

    if (attachmentsUpdated) {
      await this.domainEventService.append({
        tenantId,
        actorId,
        actorType: 'tenant_user',
        entityType: 'order',
        entityId: orderId,
        eventType: 'order.attachments_updated',
        payload: {
          customerId: savedOrder.customerId,
          conversationId: savedOrder.conversationId,
          attachmentFileIds: attachmentFileIds(savedOrder.attachments),
        },
      });
    }

    return savedOrder;
  }
}
