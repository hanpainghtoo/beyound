import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { Order } from '../order/entities/order.entity';
import type { DeliveriesFilterDto } from './dto/deliveries-filter.dto';
import type { DeliveryDto } from './dto/delivery.dto';
import type { UpdateDeliveryDto } from './dto/update-delivery.dto';

const deliveryStatuses = [
  'preparing',
  'packed',
  'out_for_delivery',
  'delivered',
  'cod_collected',
  'failed_delivery',
  'returned',
  'cancelled',
];

const deliverySortColumns: Record<string, string> = {
  createdAt: 'order.createdAt',
  orderNumber: 'order.orderNumber',
  deliveryAssigneeName: 'order.deliveryAssigneeName',
  deliveryZone: 'order.deliveryZone',
  trackingNumber: 'order.trackingNumber',
  status: 'order.status',
};

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async getDeliveries(tenantId: string, filterDto: DeliveriesFilterDto) {
    const {
      search,
      status,
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
        'order.createdAt',
        'order.deliveryAssigneeName',
        'order.deliveryAssigneePhone',
        'order.deliveryZone',
        'order.trackingNumber',
        'order.statusHistory',
        'customer.id',
        'customer.fullName',
        'customer.phone',
      ])
      .where('order.tenant_id = :tenantId', { tenantId });

    qb.andWhere(
      `(order.status IN (:...deliveryStatuses)
        OR order.delivery_assignee_name IS NOT NULL
        OR order.delivery_assignee_phone IS NOT NULL
        OR order.delivery_zone IS NOT NULL
        OR order.tracking_number IS NOT NULL)`,
      { deliveryStatuses },
    );

    if (status && status !== 'all') {
      if (status === 'delivered') {
        qb.andWhere('order.status IN (:...deliveredStatuses)', {
          deliveredStatuses: ['delivered', 'cod_collected'],
        });
      } else {
        qb.andWhere('order.status = :status', { status });
      }
    }

    if (search) {
      qb.andWhere(
        `(order.order_number ILIKE :search
          OR customer.full_name ILIKE :search
          OR order.delivery_assignee_name ILIKE :search
          OR order.delivery_assignee_phone ILIKE :search
          OR order.delivery_zone ILIKE :search
          OR order.tracking_number ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    const sortColumn = deliverySortColumns[sortBy] || 'order.createdAt';
    qb.orderBy(sortColumn, sortOrder || 'DESC');

    const [rows, total] = await qb.skip(skip).take(limit).getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    const data: DeliveryDto[] = rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      createdAt: row.createdAt,
      deliveryAssigneeName: row.deliveryAssigneeName,
      deliveryAssigneePhone: row.deliveryAssigneePhone,
      deliveryZone: row.deliveryZone,
      trackingNumber: row.trackingNumber,
      customer: (row as any).customer
        ? {
            id: (row as any).customer.id,
            fullName: (row as any).customer.fullName,
            phone: (row as any).customer.phone,
          }
        : null,
      statusHistory: row.statusHistory || [],
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
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
        'order.createdAt',
        'order.deliveryAssigneeName',
        'order.deliveryAssigneePhone',
        'order.deliveryZone',
        'order.trackingNumber',
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

    return {
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      createdAt: row.createdAt,
      deliveryAssigneeName: row.deliveryAssigneeName,
      deliveryAssigneePhone: row.deliveryAssigneePhone,
      deliveryZone: row.deliveryZone,
      trackingNumber: row.trackingNumber,
      customer: (row as any).customer
        ? {
            id: (row as any).customer.id,
            fullName: (row as any).customer.fullName,
            phone: (row as any).customer.phone,
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

    const historyEntry = {
      status: updateDto.status || order.status,
      previousStatus: order.status,
      actorId,
      timestamp: new Date().toISOString(),
      source: 'api',
      note: updateDto.note || '',
    };

    if (updateDto.status) order.status = updateDto.status;
    if (updateDto.deliveryAssigneeName !== undefined)
      order.deliveryAssigneeName = updateDto.deliveryAssigneeName;
    if (updateDto.deliveryAssigneePhone !== undefined)
      order.deliveryAssigneePhone = updateDto.deliveryAssigneePhone;
    if (updateDto.deliveryZone !== undefined)
      order.deliveryZone = updateDto.deliveryZone;
    if (updateDto.trackingNumber !== undefined)
      order.trackingNumber = updateDto.trackingNumber;
    if (updateDto.deliveryDate)
      order.deliveryDate = new Date(updateDto.deliveryDate);

    order.statusHistory = [...(order.statusHistory || []), historyEntry];

    await this.orderRepository.save(order);

    return this.getDeliveryDetail(tenantId, orderId);
  }
}
