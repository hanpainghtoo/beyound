import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import type { OrderListItem } from './interfaces/order-list-item.interface';
import { Product } from '../product/entities/product.entity';
import {
  OrderTransitionService,
  type PaymentStatus,
} from './order-transition.service';
import { DomainEventService } from '../domain-event/domain-event.service';
import { UpdateOrderLifecycleDto } from './dto/update-order-lifecycle.dto';
import { UpdateOrderDetailsDto } from './dto/update-order-details.dto';
import type { OrderListQueryDto } from './dto/order-list-query.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { buildPaginatedResult } from '../common/pagination/paginated-result.dto';
import { resolveSortColumn } from '../common/pagination/paginate';
import { MediaLibraryService } from '../media/media-library.service';
import type { LinkOrderAttachmentDto } from './dto/link-order-attachment.dto';
import type {
  CreateOrderPaymentDto,
  MarkOrderUnpaidDto,
} from './dto/create-order-payment.dto';
import { OrderPaymentTransaction } from './entities/order-payment-transaction.entity';
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
const managedLifecycleStatuses = new Set([
  'pending_payment',
  'payment_submitted',
  'confirmed',
  'rejected',
  'processing',
  'delivered',
  'cancelled',
]);
const compatibilityLifecycleStatuses = new Set([
  'new',
  'confirmed',
  'preparing',
  'packed',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'cod_collected',
  'cancelled',
  'returned',
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
    private readonly transitionService: OrderTransitionService,
    @Optional() private readonly mediaLibraryService?: MediaLibraryService,
  ) {}

  async linkAttachment(
    tenantId: string,
    orderId: string,
    input: LinkOrderAttachmentDto,
  ) {
    if (!this.mediaLibraryService)
      throw new BadRequestException('Media storage is unavailable');
    const { file } = (await this.mediaLibraryService.getDownloadUrl(
      tenantId,
      input.fileId,
    )) as {
      file?: {
        purpose?: string;
        id?: string;
        uploadedAt?: string;
        contentType?: string;
        sizeBytes?: number;
      };
    };
    if (
      !file ||
      file.id !== input.fileId ||
      !file.uploadedAt ||
      file.purpose !== 'order-payment-proof'
    ) {
      throw new BadRequestException(
        'The media file is not an order payment proof',
      );
    }
    if (
      !(
        file.contentType?.startsWith('image/') ||
        file.contentType === 'application/pdf'
      ) ||
      Number(file.sizeBytes) > 10 * 1024 * 1024
    ) {
      throw new BadRequestException(
        'The payment proof file type or size is not allowed',
      );
    }
    return this.orderRepository.manager.transaction(async (manager) => {
      const order = await manager.getRepository(Order).findOne({
        where: { id: orderId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (!['pending', 'confirmed'].includes(order.status))
        throw new BadRequestException(
          'Payment proof can only be linked to pending or confirmed orders',
        );
      const attachments = order.attachments || [];
      const existing = attachments.find(
        (attachment) =>
          attachment.fileId === input.fileId && attachment.role === input.role,
      );
      if (existing) return await this.mapOrderDetail(order);
      if (attachments.length >= 10)
        throw new BadRequestException(
          'An order can have at most 10 attachments',
        );
      order.attachments = normalizeAttachmentLinks(
        [
          ...attachments,
          {
            fileId: input.fileId,
            role: input.role,
            contentType: file.contentType,
            sizeBytes: file.sizeBytes,
          },
        ],
        { defaultRole: input.role },
      );
      return await this.mapOrderDetail(
        await manager.getRepository(Order).save(order),
      );
    });
  }

  async getAllOrders(
    tenantId: string,
    paginationDto: OrderListQueryDto,
  ): Promise<PaginatedResult<OrderListItem>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy,
      sortOrder,
      status,
      paymentStatus,
      deliveryStatus,
      proofSubmitted,
      customerId,
      conversationId,
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

    if (deliveryStatus) {
      queryBuilder.andWhere('order.delivery_status = :deliveryStatus', {
        deliveryStatus,
      });
    }

    if (proofSubmitted === 'true') {
      queryBuilder.andWhere('order.payment_submitted_at IS NOT NULL');
    } else if (proofSubmitted === 'false') {
      queryBuilder.andWhere('order.payment_submitted_at IS NULL');
    }

    if (customerId) {
      queryBuilder.andWhere('order.customer_id = :customerId', { customerId });
    }

    if (channelId) {
      queryBuilder.andWhere('conversation.channel_id = :channelId', {
        channelId,
      });
    }

    if (conversationId) {
      queryBuilder.andWhere('order.conversation_id = :conversationId', {
        conversationId,
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

    const [data, total] = await queryBuilder
      .orderBy(
        resolveSortColumn(sortBy, orderSortColumns, 'order.createdAt'),
        sortOrder || 'DESC',
      )
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const mappedData = data.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      deliveryStatus: order.deliveryStatus,
      paymentMethod: order.paymentMethod,
      paymentSubmittedAt: order.paymentSubmittedAt,
      paymentProofSubmitted: Boolean(order.paymentSubmittedAt),
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

    return buildPaginatedResult(mappedData, total, page, limit);
  }

  async mapOrderDetail(order: Order) {
    const statusHistory = Array.isArray(order.statusHistory)
      ? order.statusHistory
      : [];
    let paymentTransactions: OrderPaymentTransaction[] = [];
    try {
      const transactionRepository =
        this.orderRepository.manager.getRepository(OrderPaymentTransaction);
      if (transactionRepository) {
        paymentTransactions = await transactionRepository.find({
          where: { tenantId: order.tenantId, orderId: order.id },
          order: { createdAt: 'ASC' },
        });
      }
    } catch {
      // The ledger table may not exist yet on a partially migrated database;
      // the order detail must still render.
    }

    const actorIds = Array.from(
      new Set(
        [
          ...statusHistory.map((e: Record<string, unknown>) =>
            typeof e.actorId === 'string' ? e.actorId : null,
          ),
          ...paymentTransactions.map((transaction) => transaction.actorId),
        ].filter((id): id is string => Boolean(id)),
      ),
    );
    const actorMap = new Map<string, { fullName: string; avatarUrl: string | null }>();
    if (actorIds.length) {
      try {
        const users = await this.orderRepository.manager
          .getRepository('TenantUser')
          .find({ where: { id: In(actorIds) } as any, select: ['id', 'fullName', 'avatarUrl'] as any });
        for (const u of users as Array<{ id: string; fullName: string; avatarUrl: string | null }>) {
          actorMap.set(u.id, { fullName: u.fullName, avatarUrl: u.avatarUrl || null });
        }
      } catch {
        // best-effort
      }
    }

    // The payment ledger is authoritative when it has entries. Legacy rows
    // that predate the ledger (or were seeded without it) keep their stored
    // paid amount, so no order silently loses its recorded payment.
    const hasLedger = paymentTransactions.length > 0;
    const ledgerPaid = hasLedger
      ? this.roundAmount(
          paymentTransactions.reduce(
            (sum, transaction) =>
              transaction.type === 'payment' || transaction.type === 'reversal'
                ? sum + Number(transaction.amount || 0)
                : sum,
            0,
          ),
        )
      : 0;
    const paidAmount = hasLedger
      ? Math.max(ledgerPaid, 0)
      : Number(order.paidAmount || 0);
    const totalAmount = Number(order.totalAmount || 0);
    const remainingAmount = Math.max(
      this.roundAmount(totalAmount - paidAmount),
      0,
    );

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: this.resolvePaymentStatus(
        order,
        paymentTransactions,
        paidAmount,
        totalAmount,
      ),
      deliveryStatus: order.deliveryStatus,
      paymentMethod: order.paymentMethod,
      paymentSubmittedAt: order.paymentSubmittedAt,
      paymentProofSubmitted: Boolean(order.paymentSubmittedAt),
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      discountAmount: order.discountAmount,
      shippingFee: order.shippingFee,
      totalAmount: order.totalAmount,
      paidAmount,
      remainingAmount,
      currency: order.currency,
      notes: order.notes,
      paymentNotes: order.paymentNotes,
      conversationId: order.conversationId || order.conversation?.id || null,
      deliveryAssigneeName: order.deliveryAssigneeName,
      deliveryAssigneePhone: order.deliveryAssigneePhone,
      shippingAddress: order.shippingAddress,
      deliveryDate: order.deliveryDate,
      attachments: order.attachments || [],
      paymentTransactions: paymentTransactions.map((transaction) => {
        const actorId = transaction.actorId;
        const actor = actorId ? actorMap.get(actorId) : undefined;
        return {
          id: transaction.id,
          type: transaction.type,
          amount: Number(transaction.amount || 0),
          currency: order.currency,
          proofFileId: transaction.proofFileId,
          proofContentType: transaction.proofContentType,
          proofSizeBytes: transaction.proofSizeBytes,
          previousPaymentStatus: transaction.previousPaymentStatus,
          newPaymentStatus: transaction.newPaymentStatus,
          reason: transaction.reason,
          actorId,
          actorType: transaction.actorType,
          actorName: actor?.fullName ?? null,
          actorAvatarUrl: actor?.avatarUrl ?? null,
          orderId: order.id,
          orderNumber: order.orderNumber,
          idempotencyKey: transaction.idempotencyKey,
          metadata: transaction.metadata || {},
          createdAt:
            transaction.createdAt instanceof Date
              ? transaction.createdAt.toISOString()
              : transaction.createdAt,
          timestamp:
            transaction.createdAt instanceof Date
              ? transaction.createdAt.toISOString()
              : transaction.createdAt,
        };
      }),
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
      statusHistory: statusHistory.map((event: Record<string, unknown>) => {
        const actorId = typeof event.actorId === 'string' ? event.actorId : null;
        const actor = actorId ? actorMap.get(actorId) : undefined;
        return {
          type: typeof event.type === 'string' ? event.type : (typeof event.field === 'string' ? event.field : 'status_change'),
          field: typeof event.field === 'string' ? event.field : null,
          status:
            typeof event.status === 'string'
              ? event.status
              : event.status != null
                ? `${event.status as string | number}`
                : '',
          previousStatus:
            typeof event.previousStatus === 'string'
              ? event.previousStatus
              : event.previousStatus != null
                ? `${event.previousStatus as string | number}`
                : null,
          note: typeof event.note === 'string' ? event.note : null,
          reason: typeof event.reason === 'string' ? event.reason : null,
          source: typeof event.source === 'string' ? event.source : null,
          timestamp: typeof event.timestamp === 'string' ? event.timestamp : null,
          actorId,
          actorType: typeof event.actorType === 'string' ? event.actorType : null,
          actorName: (typeof event.actorName === 'string' ? event.actorName : null) ?? (actor ? actor.fullName : null),
          actorAvatarUrl: (typeof event.actorAvatarUrl === 'string' ? event.actorAvatarUrl : null) ?? (actor ? actor.avatarUrl : null),
          customerName: typeof event.customerName === 'string' ? event.customerName : (order.customer ? order.customer.fullName : null),
          customerAvatarUrl: typeof event.customerAvatarUrl === 'string' ? event.customerAvatarUrl : (order.customer ? order.customer.avatarUrl || null : null),
          messageText: typeof event.messageText === 'string' ? event.messageText : null,
          products: Array.isArray(event.products) ? event.products : null,
          metadata: typeof event.metadata === 'object' && event.metadata !== null ? event.metadata : null,
          attachmentReference: typeof event.attachmentReference === 'string' ? event.attachmentReference : null,
          event: typeof event.event === 'string' ? event.event : null,
        };
      }),
    };
  }

  async getOrderDetail(tenantId: string, orderId: string) {
    const order = await this.getOrderById(tenantId, orderId);
    return await this.mapOrderDetail(order);
  }

  async getOrderById(tenantId: string, orderId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, tenantId },
      relations: ['customer', 'conversation', 'creator'],
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
    status: 'pending' | 'confirmed' | 'rejected' | 'cancelled',
    note?: string,
    actorId?: string,
  ): Promise<Order> {
    if (!this.transitionService)
      throw new BadRequestException('Order transitions are unavailable');
    return this.transitionService.transition(tenantId, orderId, {
      to: status,
      actorId,
      actorType: 'tenant_user',
      reason: note,
    });
  }

  async updateOrderDetails(
    tenantId: string,
    orderId: string,
    updateDto: UpdateOrderDetailsDto,
    actorId?: string,
  ): Promise<Order> {
    const updated = await this.orderRepository.manager.transaction(
      async (manager) => {
        const orderRepository = manager.getRepository(Order);
        const itemRepository = manager.getRepository(OrderItem);
        const productRepository = manager.getRepository(Product);
        const order = await orderRepository.findOne({
          where: { id: orderId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!order) throw new NotFoundException('Order not found');
        const existingItems = await itemRepository.find({ where: { orderId } });
        const itemSignature = (item: {
          productId: string;
          quantity: number;
          unitPrice: number;
          notes?: string;
          variation?: Record<string, unknown>;
        }) =>
          JSON.stringify({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            notes: item.notes || null,
            variation: item.variation || {},
          });
        const existingSignatures = existingItems
          .map((item) =>
            itemSignature({
              productId: item.productId,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
              notes: item.notes,
              variation: item.variationSnapshot,
            }),
          )
          .sort();
        const requestedSignatures = updateDto.items
          ? updateDto.items.map(itemSignature).sort()
          : existingSignatures;
        const itemsChanged = updateDto.items
          ? JSON.stringify(requestedSignatures) !==
            JSON.stringify(existingSignatures)
          : false;
        if (order.status !== 'pending' && itemsChanged) {
          throw new BadRequestException(
            'Order items can only be edited while the order is pending',
          );
        }
        const replacementItems: OrderItem[] = [];
        let subtotal = Number(order.subtotal || 0);
        if (updateDto.items) {
        subtotal = 0;
        for (const item of updateDto.items) {
          const product = await productRepository.findOne({
            where: { id: item.productId, tenantId },
          });
          if (!product)
            throw new NotFoundException(`Product ${item.productId} not found`);
          const quantity = Number(item.quantity || 0);
          const unitPrice = Number(item.unitPrice || 0);
          const itemTotal = quantity * unitPrice;
          subtotal += itemTotal;
          replacementItems.push(
            itemRepository.create({
              orderId,
              productId: product.id,
              productName: product.name,
              productSku: product.sku,
              productSnapshot: {
                productId: product.id,
                name: product.name,
                sku: product.sku,
                barcode: product.barcode,
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
        }

        order.paymentMethod = updateDto.paymentMethod || order.paymentMethod;
        order.subtotal = subtotal;
        order.taxAmount = Number(updateDto.taxAmount ?? order.taxAmount ?? 0);
        order.discountAmount = Number(
          updateDto.discountAmount ?? order.discountAmount ?? 0,
        );
        order.shippingFee = Number(
          updateDto.shippingFee ?? order.shippingFee ?? 0,
        );
        order.totalAmount = Math.max(
          subtotal +
            Number(order.taxAmount || 0) +
            Number(order.shippingFee || 0) -
            Number(order.discountAmount || 0),
          0,
        );
        if (updateDto.notes !== undefined) order.notes = updateDto.notes;
        if (updateDto.shippingAddress !== undefined)
          order.shippingAddress = updateDto.shippingAddress;
        order.statusHistory = [
          ...(order.statusHistory || []),
          {
            type: 'order_updated',
            field: 'order',
            status: order.status,
            previousStatus: order.status,
            actorId,
            actorType: 'tenant_user',
            actorName: order.creator?.fullName ?? null,
            actorAvatarUrl: order.creator?.avatarUrl ?? null,
            reason: 'Order details updated',
            metadata: {
              previousItemCount: existingItems.length,
              nextItemCount: replacementItems.length,
            },
            timestamp: new Date().toISOString(),
          },
        ];

        if (order.status === 'pending' && itemsChanged)
          await itemRepository.delete({ orderId });
        await orderRepository.save(order);
        if (
          order.status === 'pending' &&
          itemsChanged &&
          replacementItems.length
        )
          await itemRepository.save(replacementItems);
        await this.domainEventService.appendInManager(manager, {
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
          source: 'dashboard',
        });
        return order;
      },
    );

    return (
      (await this.orderRepository.findOne({
        where: { id: updated.id, tenantId },
        relations: ['customer', 'conversation', 'creator'],
      })) || updated
    );
  }

  async updateOrderLifecycle(
    tenantId: string,
    orderId: string,
    updateDto: UpdateOrderLifecycleDto,
    actorId?: string,
  ): Promise<Order> {
    const order = await this.getOrderById(tenantId, orderId);
    if (
      updateDto.status &&
      this.transitionService &&
      typeof this.transitionService.transition === 'function' &&
      ((compatibilityLifecycleStatuses.has(order.status) &&
        compatibilityLifecycleStatuses.has(updateDto.status) &&
        Object.keys(updateDto).every((key) =>
          ['status', 'note', 'metadata'].includes(key),
        )) ||
        managedLifecycleStatuses.has(updateDto.status))
    ) {
      return this.transitionService.transition(tenantId, orderId, {
        to: updateDto.status as
          | 'pending'
          | 'confirmed'
          | 'rejected'
          | 'cancelled',
        actorId,
        actorType: 'tenant_user',
        reason: updateDto.note,
      });
    }
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
      if (!updateDto.paymentStatus) {
        order.paymentStatus =
          Number(order.totalAmount || 0) - Number(updateDto.paidAmount || 0) <=
          0
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
      order.paymentStatus = 'failed';
    } else if (
      updateDto.status &&
      activeDeliveryStatuses.has(updateDto.status) &&
      order.paymentMethod === 'cod' &&
      order.paymentStatus === 'failed'
    ) {
      if (Number(order.totalAmount || 0) - Number(order.paidAmount || 0) > 0) {
        order.paymentStatus = 'cod_pending';
      }
    }

    if (order.status === 'cod_collected') {
      order.paymentStatus = 'cod_collected';
      order.paidAmount = Number(order.totalAmount || 0);
    }

    if (lifecycleChanged || updateDto.note) {
      order.statusHistory = [
        ...(order.statusHistory || []),
        {
          type: 'status_change',
          field: 'order',
          status: order.status,
          previousStatus,
          actorId,
          actorType: 'tenant_user',
          actorName: order.creator?.fullName ?? null,
          actorAvatarUrl: order.creator?.avatarUrl ?? null,
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

  async updatePaymentStatus(
    tenantId: string,
    orderId: string,
    status: PaymentStatus,
    actorId: string,
    attachmentReference?: string,
    reason?: string,
  ): Promise<Order> {
    return this.transitionService.transitionPayment(tenantId, orderId, {
      to: status,
      actorId,
      actorType: 'tenant_user',
      reason,
      attachmentReference,
    });
  }

  async listPaymentTransactions(tenantId: string, orderId: string) {
    const order = await this.getOrderById(tenantId, orderId);
    const detail = await this.mapOrderDetail(order);
    return detail.paymentTransactions;
  }

  async recordPayment(
    tenantId: string,
    orderId: string,
    input: CreateOrderPaymentDto,
    actorId: string,
  ): Promise<Order> {
    const proof = await this.resolvePaymentProof(tenantId, input.proofFileId);
    return this.transitionService.recordPayment(tenantId, orderId, {
      amount: input.amount,
      proofFileId: input.proofFileId,
      proofContentType: proof?.contentType,
      proofSizeBytes: proof?.sizeBytes,
      reason: input.reason,
      actorId,
      actorType: 'tenant_user',
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
  }

  async markOrderUnpaid(
    tenantId: string,
    orderId: string,
    input: MarkOrderUnpaidDto,
    actorId: string,
  ): Promise<Order> {
    return this.transitionService.markOrderUnpaid(tenantId, orderId, {
      reason: input.reason,
      actorId,
      actorType: 'tenant_user',
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
  }

  private roundAmount(value: number) {
    return Math.round(Number(value) * 100) / 100;
  }

  /**
   * Payment status is derived from the ledger and the payable total whenever
   * ledger entries exist, so an order can never show a balance that disagrees
   * with its recorded transactions. Terminal non-ledger states (failed COD,
   * refunded, COD collected) stay as persisted.
   */
  private resolvePaymentStatus(
    order: Order,
    transactions: OrderPaymentTransaction[],
    paidAmount: number,
    totalAmount: number,
  ) {
    if (
      !['unpaid', 'partially_paid', 'paid'].includes(order.paymentStatus) ||
      transactions.length === 0
    ) {
      return order.paymentStatus;
    }
    if (totalAmount <= 0 || paidAmount <= 0) return 'unpaid';
    if (paidAmount >= totalAmount) return 'paid';
    return 'partially_paid';
  }

  private async resolvePaymentProof(tenantId: string, fileId?: string) {
    if (!fileId) return null;
    if (!this.mediaLibraryService)
      throw new BadRequestException('Media storage is unavailable');
    const { file } = (await this.mediaLibraryService.getDownloadUrl(
      tenantId,
      fileId,
    )) as {
      file?: {
        purpose?: string;
        id?: string;
        uploadedAt?: string;
        contentType?: string;
        sizeBytes?: number;
      };
    };
    if (
      !file ||
      file.id !== fileId ||
      !file.uploadedAt ||
      file.purpose !== 'order-payment-proof'
    ) {
      throw new BadRequestException(
        'The media file is not an order payment proof',
      );
    }
    if (
      !(
        file.contentType?.startsWith('image/') ||
        file.contentType === 'application/pdf'
      ) ||
      Number(file.sizeBytes) > 10 * 1024 * 1024
    ) {
      throw new BadRequestException(
        'The payment proof file type or size is not allowed',
      );
    }
    return file;
  }
}
