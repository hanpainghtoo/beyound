import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { OrderService } from './order.service';
import { Order } from './entities/order.entity';
import type { OrderItem } from './entities/order-item.entity';
import type { Product } from '../product/entities/product.entity';
import type { DomainEventService } from '../domain-event/domain-event.service';
import type { OrderTransitionService } from './order-transition.service';

describe('OrderService order response mapping', () => {
  it('includes deliveryStatus in list responses', async () => {
    const order = {
      id: 'order-1',
      orderNumber: 'MM-ORD-1001',
      status: 'pending',
      paymentStatus: 'unpaid',
      deliveryStatus: 'packed',
      paymentMethod: 'bank_transfer',
      paymentSubmittedAt: null,
      totalAmount: 50000,
      currency: 'MMK',
      conversationId: null,
      createdAt: new Date(),
      customer: null,
    };
    const queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[order], 1]),
    };
    const service = new OrderService(
      {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      } as unknown as Repository<Order>,
      undefined as unknown as Repository<OrderItem>,
      undefined as unknown as Repository<Product>,
      undefined as unknown as DomainEventService,
      undefined as unknown as OrderTransitionService,
    );

    const result = await service.getAllOrders('tenant-1', {});

    expect(result.data[0]).toEqual(
      expect.objectContaining({ deliveryStatus: 'packed' }),
    );
  });

  it('includes deliveryStatus in detail responses', async () => {
    const service = new OrderService(
      undefined as unknown as Repository<Order>,
      undefined as unknown as Repository<OrderItem>,
      undefined as unknown as Repository<Product>,
      undefined as unknown as DomainEventService,
      undefined as unknown as OrderTransitionService,
    );

    const result = await service.mapOrderDetail({
      id: 'order-1',
      orderNumber: 'MM-ORD-1001',
      status: 'cancelled',
      paymentStatus: 'paid',
      deliveryStatus: 'returned',
      statusHistory: [],
      attachments: [],
      createdAt: new Date(),
      customer: null,
    } as unknown as Order);

    expect(result).toEqual(
      expect.objectContaining({ deliveryStatus: 'returned' }),
    );
  });
});

describe('OrderService payment ledger mapping', () => {
  const build = (order: Record<string, unknown>, ledger: Array<Record<string, unknown>>) => {
    const transactionRepository = {
      find: jest.fn().mockResolvedValue(ledger),
    };
    const orderRepository = {
      manager: {
        getRepository: jest.fn(() => transactionRepository),
      },
    };
    const service = new OrderService(
      orderRepository as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
    );
    return service.mapOrderDetail({
      id: 'order-1',
      tenantId: 'tenant-1',
      orderNumber: 'MM-ORD-1001',
      status: 'confirmed',
      deliveryStatus: 'packed',
      statusHistory: [],
      attachments: [],
      currency: 'MMK',
      createdAt: new Date(),
      customer: null,
      ...order,
    } as unknown as Order);
  };

  it('derives the paid amount, remaining balance, and status from the ledger', async () => {
    const result = await build(
      { paymentStatus: 'partially_paid', totalAmount: 100000, paidAmount: 0 },
      [
        { type: 'payment', amount: 30000, actorId: null },
        { type: 'payment', amount: 40000, actorId: null },
      ],
    );
    expect(result).toEqual(
      expect.objectContaining({
        paidAmount: 70000,
        remainingAmount: 30000,
        paymentStatus: 'partially_paid',
      }),
    );
  });

  it('marks an order paid and clears the remaining balance when the ledger covers the total', async () => {
    const result = await build(
      { paymentStatus: 'paid', totalAmount: 100000, paidAmount: 0 },
      [{ type: 'payment', amount: 100000, actorId: null }],
    );
    expect(result).toEqual(
      expect.objectContaining({
        paidAmount: 100000,
        remainingAmount: 0,
        paymentStatus: 'paid',
      }),
    );
  });

  it('treats a full reversal as unpaid without deleting earlier entries', async () => {
    const result = await build(
      { paymentStatus: 'paid', totalAmount: 100000, paidAmount: 100000 },
      [
        { type: 'payment', amount: 100000, actorId: null },
        { type: 'reversal', amount: -100000, actorId: null },
      ],
    );
    expect(result).toEqual(
      expect.objectContaining({
        paidAmount: 0,
        remainingAmount: 100000,
        paymentStatus: 'unpaid',
      }),
    );
  });

  it('keeps the stored paid amount for orders that predate the ledger', async () => {
    const result = await build(
      { paymentStatus: 'partially_paid', totalAmount: 100000, paidAmount: 50000 },
      [],
    );
    expect(result).toEqual(
      expect.objectContaining({
        paidAmount: 50000,
        remainingAmount: 50000,
        paymentStatus: 'partially_paid',
      }),
    );
  });
});

describe('OrderService lifecycle persistence', () => {
  it('rejects item and detail edits after an order leaves pending', async () => {
    const itemRepository = {
      find: jest.fn().mockResolvedValue([
        {
          productId: 'product-1',
          quantity: 1,
          unitPrice: 10,
          notes: null,
          variationSnapshot: {},
        },
      ]),
    };
    const orderRepository = {
      manager: {
        transaction: jest.fn(async (callback) =>
          callback({
            getRepository: (entity: { name: string }) =>
              entity.name === 'Order'
                ? {
                    findOne: jest.fn().mockResolvedValue({
                      id: 'order-1',
                      tenantId: 'tenant-1',
                      status: 'confirmed',
                    }),
                  }
                : itemRepository,
          }),
        ),
      },
    };
    const service = new OrderService(
      orderRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.updateOrderDetails(
        'tenant-1',
        'order-1',
        { items: [{ productId: 'product-2', quantity: 1, unitPrice: 10 }] },
        'agent-1',
      ),
    ).rejects.toThrow('only be edited while the order is pending');
  });
  it('persists payment and delivery changes with a transition note when status is unchanged', async () => {
    const order = {
      id: 'order-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      conversationId: 'conversation-1',
      status: 'confirmed',
      paymentStatus: 'pending',
      paymentMethod: 'bank_transfer',
      totalAmount: 50000,
      paidAmount: 0,
      statusHistory: [],
    };
    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(async (value) => value),
    };
    const domainEventService = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OrderService(
      orderRepository as any,
      undefined as any,
      undefined as any,
      domainEventService as any,
      undefined as any,
    );

    const updated = await service.updateOrderLifecycle(
      'tenant-1',
      'order-1',
      {
        paymentStatus: 'partially_paid',
        paidAmount: 20000,
        deliveryAssigneeName: 'Thiha Aye',
        deliveryAssigneePhone: '09 765 432 100',
        note: 'Payment confirmed and courier assigned',
      },
      'user-1',
    );

    expect(orderRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'order-1', tenantId: 'tenant-1' },
      relations: ['customer', 'conversation', 'creator'],
    });
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
    expect(updated).toMatchObject({
      paymentStatus: 'partially_paid',
      paidAmount: 20000,
      deliveryAssigneeName: 'Thiha Aye',
      deliveryAssigneePhone: '09 765 432 100',
    });
    expect(updated.statusHistory).toEqual([
      expect.objectContaining({
        status: 'confirmed',
        previousStatus: 'confirmed',
        note: 'Payment confirmed and courier assigned',
      }),
    ]);
    expect(domainEventService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'order.payment_updated',
        entityId: 'order-1',
      }),
    );
  });

  it('requires a cancellation reason when cancelling an order', async () => {
    const order = {
      id: 'order-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      conversationId: 'conversation-1',
      status: 'confirmed',
      paymentStatus: 'pending',
      paymentMethod: 'bank_transfer',
      totalAmount: 50000,
      paidAmount: 0,
      statusHistory: [],
    };
    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(async (value) => value),
    };
    const domainEventService = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OrderService(
      orderRepository as any,
      undefined as any,
      undefined as any,
      domainEventService as any,
      {} as any,
    );

    await expect(
      service.updateOrderLifecycle(
        'tenant-1',
        'order-1',
        {
          status: 'cancelled',
          note: '   ',
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderRepository.save).not.toHaveBeenCalled();
    expect(domainEventService.append).not.toHaveBeenCalled();
  });

  it('requires a reason when marking a delivery as failed', async () => {
    const order = {
      id: 'order-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      conversationId: 'conversation-1',
      status: 'out_for_delivery',
      paymentStatus: 'cod_pending',
      paymentMethod: 'cod',
      totalAmount: 50000,
      paidAmount: 0,
      statusHistory: [],
    };
    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(async (value) => value),
    };
    const domainEventService = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OrderService(
      orderRepository as any,
      {} as any,
      {} as any,
      domainEventService as any,
      {} as any,
    );

    await expect(
      service.updateOrderLifecycle(
        'tenant-1',
        'order-1',
        {
          status: 'failed_delivery',
          note: '   ',
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderRepository.save).not.toHaveBeenCalled();
    expect(domainEventService.append).not.toHaveBeenCalled();
  });

  it('reconciles COD when a delivery fails and restores it if redelivery starts', async () => {
    const order = {
      id: 'order-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      conversationId: 'conversation-1',
      status: 'out_for_delivery',
      paymentStatus: 'cod_pending',
      paymentMethod: 'cod',
      totalAmount: 50000,
      paidAmount: 0,
      statusHistory: [],
    };
    const orderRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(order)
        .mockResolvedValueOnce(order),
      save: jest.fn(async (value) => value),
    };
    const domainEventService = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OrderService(
      orderRepository as any,
      {} as any,
      {} as any,
      domainEventService as any,
      {} as any,
    );

    const failed = await service.updateOrderLifecycle(
      'tenant-1',
      'order-1',
      {
        status: 'failed_delivery',
        note: 'Customer was unreachable at the gate',
      },
      'user-1',
    );

    expect(failed).toMatchObject({
      status: 'failed_delivery',
      paymentStatus: 'failed',
    });

    const restarted = await service.updateOrderLifecycle(
      'tenant-1',
      'order-1',
      {
        status: 'preparing',
        note: 'Rescheduled for tomorrow',
      },
      'user-1',
    );

    expect(restarted).toMatchObject({
      status: 'preparing',
      paymentStatus: 'cod_pending',
    });
  });

  it('replaces order items and recalculates totals when details are updated', async () => {
    const order = {
      id: 'order-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      conversationId: null,
      orderNumber: 'MM-ORD-1001',
      status: 'pending',
      paymentStatus: 'unpaid',
      paymentMethod: 'cod',
      subtotal: 20000,
      taxAmount: 0,
      discountAmount: 0,
      shippingFee: 0,
      totalAmount: 20000,
      paidAmount: 5000,
      notes: 'before',
      statusHistory: [],
    };
    const orderRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(order)
        .mockResolvedValueOnce({
          ...order,
          subtotal: 38000,
          totalAmount: 40000,
        }),
      save: jest.fn(async (value) => value),
    };
    const orderItemRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'item-1' }]),
      create: jest.fn((value) => value),
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(async (value) => value),
    };
    const productRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'product-1',
          tenantId: 'tenant-1',
          name: 'Bag',
          sku: 'BAG-1',
          type: 'product',
          price: 12000,
          status: 'active',
        })
        .mockResolvedValueOnce({
          id: 'product-2',
          tenantId: 'tenant-1',
          name: 'Bottle',
          sku: 'BOT-1',
          type: 'product',
          price: 14000,
          status: 'active',
        }),
    };
    const domainEventService = {
      appendInManager: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: jest.fn((entity: { name: string }) =>
        entity.name === 'Order'
          ? orderRepository
          : entity.name === 'OrderItem'
            ? orderItemRepository
            : productRepository,
      ),
    };
    (orderRepository as any).manager = {
      transaction: jest.fn(async (callback: any) => callback(manager)),
    };
    const service = new OrderService(
      orderRepository as any,
      orderItemRepository as any,
      productRepository as any,
      domainEventService as any,
      {} as any,
    );

    const updated = await service.updateOrderDetails(
      'tenant-1',
      'order-1',
      {
        items: [
          { productId: 'product-1', quantity: 2, unitPrice: 12000 },
          { productId: 'product-2', quantity: 1, unitPrice: 14000 },
        ],
        taxAmount: 4000,
        discountAmount: 2000,
        shippingFee: 0,
        notes: 'updated',
      },
      'user-1',
    );

    expect(orderItemRepository.delete).toHaveBeenCalledWith({
      orderId: 'order-1',
    });
    expect(orderItemRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        productId: 'product-1',
        quantity: 2,
        totalPrice: 24000,
      }),
      expect.objectContaining({
        productId: 'product-2',
        quantity: 1,
        totalPrice: 14000,
      }),
    ]);
    expect(orderRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: 38000,
        taxAmount: 4000,
        discountAmount: 2000,
        totalAmount: 40000,
        notes: 'updated',
      }),
    );
    expect(domainEventService.appendInManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'order.updated',
        entityId: 'order-1',
      }),
    );
    expect(updated).toMatchObject({
      subtotal: 38000,
      totalAmount: 40000,
    });
  });

  it('rolls back the replacement when the transactional event fails', async () => {
    const order = {
      id: 'order-1',
      tenantId: 'tenant-1',
      status: 'pending',
      statusHistory: [],
    };
    const orderRepository: any = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback: any) => callback(manager)),
      },
    };
    const itemRepository: any = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value) => value),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const productRepository: any = {
      findOne: jest.fn().mockResolvedValue({
        id: 'product-1',
        tenantId: 'tenant-1',
        name: 'Bag',
      }),
    };
    const manager: any = {
      getRepository: jest.fn((entity) =>
        entity.name === 'Order'
          ? orderRepository
          : entity.name === 'OrderItem'
            ? itemRepository
            : productRepository,
      ),
    };
    orderRepository.manager.transaction = jest.fn(async (callback: any) => {
      await expect(callback(manager)).rejects.toThrow('event failed');
      throw new Error('event failed');
    });
    const service = new OrderService(
      orderRepository,
      itemRepository,
      productRepository,
      {
        appendInManager: jest.fn().mockRejectedValue(new Error('event failed')),
      } as any,
      {} as any,
    );
    await expect(
      service.updateOrderDetails(
        'tenant-1',
        'order-1',
        { items: [{ productId: 'product-1', quantity: 1, unitPrice: 10 }] },
        'user-1',
      ),
    ).rejects.toThrow('event failed');
    expect(orderRepository.save).toHaveBeenCalled();
  });

  it('accepts only an attachment already linked to the same tenant order for payment proof', async () => {
    const order = {
      id: 'order-1',
      tenantId: 'tenant-1',
      attachments: [{ fileId: 'proof-1' }],
    };
    const orderRepository = { findOne: jest.fn().mockResolvedValue(order) };
    const transition = {
      transitionPayment: jest.fn().mockResolvedValue(order),
    };
    const service = new OrderService(
      orderRepository as any,
      {} as any,
      {} as any,
      {} as any,
      transition as any,
    );
    await service.updatePaymentStatus(
      'tenant-1',
      'order-1',
      'paid',
      'agent-1',
      'proof-1',
    );
    expect(transition.transitionPayment).toHaveBeenCalledWith(
      'tenant-1',
      'order-1',
      expect.objectContaining({ to: 'paid' }),
    );
    await service.updatePaymentStatus(
      'tenant-1',
      'order-1',
      'paid',
      'agent-1',
      'other-order-proof',
    );
    expect(transition.transitionPayment).toHaveBeenLastCalledWith(
      'tenant-1',
      'order-1',
      expect.objectContaining({ attachmentReference: 'other-order-proof' }),
    );
  });
});
