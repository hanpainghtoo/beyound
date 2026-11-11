import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { Order } from '../order/entities/order.entity';
import type { DeliveriesFilterDto } from './dto/deliveries-filter.dto';
import type { DeliveryDto } from './dto/delivery.dto';
import type { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { buildPaginatedResult } from '../common/pagination/paginated-result.dto';
import { resolveSortColumn } from '../common/pagination/paginate';
import { OrderTransitionService } from '../order/order-transition.service';
const deliveryStatuses = [
  'packed',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'returned',
];

const deliverySortColumns: Record<string, string> = {
  createdAt: 'order.createdAt',
  orderNumber: 'order.orderNumber',
  deliveryAssigneeName: 'order.deliveryAssigneeName',
  status: 'order.deliveryStatus',
};

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private readonly transitionService: OrderTransitionService,
  ) {}

  async getDeliveries(tenantId: string, filterDto: DeliveriesFilterDto) {
    const {
      search,
      status,
      assignee,
      conversationId,
      customerId,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      page = 1,
      limit = 50,
    } = filterDto;

    const skip = (page - 1) * limit;

    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin('order.customer', 'customer')
      .select([
        'order.id',
        'order.orderNumber',
        'order.status',
        'order.deliveryStatus',
        'order.createdAt',
        'order.deliveryDate',
        'order.deliveryAssigneeName',
        'order.deliveryAssigneePhone',
        'order.statusHistory',
        'customer.id',
        'customer.fullName',
        'customer.phone',
      ])
      .where('order.tenant_id = :tenantId', { tenantId });

    qb.andWhere(
      `order.status = 'confirmed' AND order.delivery_status IN (:...deliveryStatuses)`,
      { deliveryStatuses },
    );

    if (status && status !== 'all') {
      qb.andWhere('order.delivery_status = :status', { status });
    }

    if (search) {
      qb.andWhere(
        `(order.order_number ILIKE :search
          OR customer.full_name ILIKE :search
          OR order.delivery_assignee_name ILIKE :search
          OR order.delivery_assignee_phone ILIKE :search
          )`,
        { search: `%${search}%` },
      );
    }

    if (assignee) {
      qb.andWhere(
        `(order.delivery_assignee_name ILIKE :assignee
          OR order.delivery_assignee_phone ILIKE :assignee)`,
        { assignee: `%${assignee}%` },
      );
    }

    if (conversationId) {
      qb.andWhere('order.conversation_id = :conversationId', {
        conversationId,
      });
    }

    if (customerId) {
      qb.andWhere('order.customer_id = :customerId', { customerId });
    }

    const sortColumn = resolveSortColumn(
      sortBy,
      deliverySortColumns,
      'order.createdAt',
    );
    qb.orderBy(sortColumn, sortOrder || 'DESC');

    const [rows, total] = await qb.skip(skip).take(limit).getManyAndCount();
    const statusCounts = await this.orderRepository
      .createQueryBuilder('deliveryStats')
      .select('deliveryStats.delivery_status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('deliveryStats.tenant_id = :tenantId', { tenantId })
      .andWhere("deliveryStats.status = 'confirmed'")
      .andWhere('deliveryStats.delivery_status IN (:...deliveryStatuses)', {
        deliveryStatuses,
      })
      .groupBy('deliveryStats.delivery_status')
      .getRawMany<{ status: string; count: string }>();
    const counts = Object.fromEntries(
      deliveryStatuses.map((value) => [
        value,
        Number(
          statusCounts.find((entry) => entry.status === value)?.count || 0,
        ),
      ]),
    );

    const data: DeliveryDto[] = rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.deliveryStatus,
      createdAt: row.createdAt,
      deliveryDate: row.deliveryDate,
      deliveryAssigneeName: row.deliveryAssigneeName,
      deliveryAssigneePhone: row.deliveryAssigneePhone,
      customer: row.customer
        ? {
            id: row.customer.id,
            fullName: row.customer.fullName,
            phone: row.customer.phone,
          }
        : null,
      statusHistory: row.statusHistory || [],
    }));

    return { ...buildPaginatedResult(data, total, page, limit), counts };
  }

  async getDeliveryDetail(
    tenantId: string,
    orderId: string,
  ): Promise<DeliveryDto> {
    const row = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoin('order.customer', 'customer')
      .select([
        'order.id',
        'order.orderNumber',
        'order.status',
        'order.deliveryStatus',
        'order.createdAt',
        'order.deliveryDate',
        'order.deliveryAssigneeName',
        'order.deliveryAssigneePhone',
        'order.statusHistory',
        'customer.id',
        'customer.fullName',
        'customer.phone',
      ])
      .where('order.id = :orderId', { orderId })
      .andWhere('order.tenant_id = :tenantId', { tenantId })
      .getOne();

    if (!row) {
      throw new NotFoundException('Delivery not found');
    }

    if (row.status !== 'confirmed') {
      throw new NotFoundException('Delivery not found');
    }

    return {
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.deliveryStatus,
      createdAt: row.createdAt,
      deliveryDate: row.deliveryDate,
      deliveryAssigneeName: row.deliveryAssigneeName,
      deliveryAssigneePhone: row.deliveryAssigneePhone,
      customer: row.customer
        ? {
            id: row.customer.id,
            fullName: row.customer.fullName,
            phone: row.customer.phone,
          }
        : null,
      statusHistory: row.statusHistory || [],
    };
  }

  async updateDelivery(
    tenantId: string,
    orderId: string,
    updateDto: UpdateDeliveryDto,
    actorId: string,
  ): Promise<DeliveryDto> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, tenantId },
    });

    if (!order) {
      throw new NotFoundException('Delivery not found');
    }

    const hasFields =
      updateDto.deliveryAssigneeName !== undefined ||
      updateDto.deliveryAssigneePhone !== undefined ||
      updateDto.deliveryDate !== undefined;
    const statusChanged =
      updateDto.status !== undefined &&
      updateDto.status !== order.deliveryStatus;
    const input = {
      to: updateDto.status,
      actorId,
      actorType: 'tenant_user',
      reason: updateDto.reason,
      deliveryAssigneeName: updateDto.deliveryAssigneeName,
      deliveryAssigneePhone: updateDto.deliveryAssigneePhone,
      deliveryDate: updateDto.deliveryDate
        ? new Date(updateDto.deliveryDate)
        : undefined,
    };
    if (hasFields) {
      await this.transitionService.updateDelivery(tenantId, orderId, input);
    } else if (statusChanged) {
      await this.transitionService.transitionDelivery(tenantId, orderId, input);
    }

    return this.getDeliveryDetail(tenantId, orderId);
  }
}
