import { BadRequestException, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderItemReservation } from './entities/order-item-reservation.entity';
import { Product } from '../product/entities/product.entity';
import { StockMovement } from './entities/stock-movement.entity';

@Injectable()
export class OrderReservationService {
  async reserve(
    manager: EntityManager,
    order: Order,
    item: OrderItem,
    options: { allowOvercommit?: boolean } = {},
  ) {
    if (!item.productId) return null;
    const product = await this.lockProduct(
      manager,
      item.productId,
      order.tenantId,
    );
    if (!product.trackInventory) return null;

    const active = await this.activeQuantity(
      manager,
      product.id,
      order.tenantId,
    );
    if (
      !options.allowOvercommit &&
      active + item.quantity > Number(product.stockQuantity || 0)
    ) {
      throw new BadRequestException('Insufficient inventory for reservation');
    }

    const reservation = manager.getRepository(OrderItemReservation).create({
      tenantId: order.tenantId,
      orderId: order.id,
      orderItemId: item.id,
      productId: product.id,
      quantity: item.quantity,
      kind: 'inventory',
      state: 'active',
    });
    return manager.getRepository(OrderItemReservation).save(reservation);
  }

  async release(
    manager: EntityManager,
    orderId: string,
    tenantId: string,
    reason: string,
  ) {
    const reservations = await manager
      .getRepository(OrderItemReservation)
      .createQueryBuilder('reservation')
      .where('reservation.order_id = :orderId', { orderId })
      .andWhere('reservation.tenant_id = :tenantId', { tenantId })
      .andWhere("reservation.state = 'active'")
      .orderBy('reservation.product_id', 'ASC')
      .getMany();
    let released = 0;
    for (const reservation of reservations) {
      await this.lockProduct(manager, reservation.productId, tenantId);
      const result = await manager
        .getRepository(OrderItemReservation)
        .createQueryBuilder()
        .update()
        .set({
          state: 'released',
          releaseReason: reason,
          releasedAt: new Date(),
        })
        .where('id = :id AND state = :state', {
          id: reservation.id,
          state: 'active',
        })
        .execute();
      released += result.affected || 0;
    }
    return released;
  }

  async convert(manager: EntityManager, order: Order, actorId?: string) {
    const reservations = await manager
      .getRepository(OrderItemReservation)
      .createQueryBuilder('reservation')
      .where('reservation.order_id = :orderId', { orderId: order.id })
      .andWhere('reservation.tenant_id = :tenantId', {
        tenantId: order.tenantId,
      })
      .andWhere("reservation.state = 'active'")
      .orderBy('reservation.product_id', 'ASC')
      .getMany();
    let converted = 0;
    for (const reservation of reservations) {
      const product = await this.lockProduct(
        manager,
        reservation.productId,
        order.tenantId,
      );
      const result = await manager
        .getRepository(OrderItemReservation)
        .createQueryBuilder()
        .update()
        .set({
          state: 'converted',
          convertedAt: new Date(),
        })
        .where('id = :id AND state = :state', {
          id: reservation.id,
          state: 'active',
        })
        .execute();
      if (!result.affected) continue;

      if (Number(product.stockQuantity || 0) < reservation.quantity) {
        throw new BadRequestException('Stock cannot become negative');
      }

      product.stockQuantity =
        Number(product.stockQuantity || 0) - reservation.quantity;
      await manager.getRepository(Product).save(product);
      await manager.getRepository(StockMovement).save({
        tenantId: order.tenantId,
        productId: product.id,
        orderId: order.id,
        orderItemId: reservation.orderItemId,
        delta: -reservation.quantity,
        reason: 'reservation_converted',
        actorId: actorId || null,
      });
      converted += 1;
    }
    return converted;
  }

  async restoreConverted(
    manager: EntityManager,
    order: Order,
    actorId?: string,
  ) {
    const movements = await manager.getRepository(StockMovement).find({
      where: { orderId: order.id, tenantId: order.tenantId },
    });
    if (!movements.some((movement) => movement.delta < 0)) return 0;
    if (
      movements.some(
        (movement) => movement.reason === 'confirmed_order_cancelled_restocked',
      )
    )
      return 0;

    const reservations = await manager
      .getRepository(OrderItemReservation)
      .find({
        where: {
          orderId: order.id,
          tenantId: order.tenantId,
          state: 'converted',
        },
        order: { productId: 'ASC' },
      });
    let restored = 0;
    for (const reservation of reservations) {
      const product = await this.lockProduct(
        manager,
        reservation.productId,
        order.tenantId,
      );
      product.stockQuantity =
        Number(product.stockQuantity || 0) + reservation.quantity;
      await manager.getRepository(Product).save(product);
      await manager.getRepository(StockMovement).save({
        tenantId: order.tenantId,
        productId: product.id,
        orderId: order.id,
        orderItemId: reservation.orderItemId,
        delta: reservation.quantity,
        reason: 'confirmed_order_cancelled_restocked',
        actorId: actorId || null,
      });
      restored += reservation.quantity;
    }
    return restored;
  }

  private async lockProduct(
    manager: EntityManager,
    productId: string,
    tenantId: string,
  ) {
    const product = await manager.getRepository(Product).findOne({
      where: { id: productId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!product) throw new BadRequestException('Product not found');
    return product;
  }

  private async activeQuantity(
    manager: EntityManager,
    productId: string,
    tenantId: string,
  ) {
    const row = await manager
      .getRepository(OrderItemReservation)
      .createQueryBuilder('reservation')
      .select('COALESCE(SUM(reservation.quantity), 0)', 'quantity')
      .where('reservation.product_id = :productId', { productId })
      .andWhere('reservation.tenant_id = :tenantId', { tenantId })
      .andWhere("reservation.state = 'active'")
      .getRawOne<{ quantity: string }>();
    return Number(row?.quantity || 0);
  }
}
