import { BadRequestException } from '@nestjs/common';

import { OrderService } from './order.service';

describe('OrderService lifecycle persistence', () => {
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
      balanceDue: 50000,
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
    );

    const updated = await service.updateOrderLifecycle(
      'tenant-1',
      'order-1',
      {
        paymentStatus: 'partially_paid',
        paidAmount: 20000,
        deliveryAssigneeName: 'Thiha Aye',
        deliveryAssigneePhone: '09 765 432 100',
        deliveryZone: 'Tamwe',
        trackingNumber: 'ZAY-DEL-1042',
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
      balanceDue: 30000,
      deliveryAssigneeName: 'Thiha Aye',
      deliveryAssigneePhone: '09 765 432 100',
      deliveryZone: 'Tamwe',
      trackingNumber: 'ZAY-DEL-1042',
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
      balanceDue: 50000,
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
      balanceDue: 50000,
      codAmount: 50000,
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
      balanceDue: 50000,
      codAmount: 50000,
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
      balanceDue: 0,
      codAmount: 0,
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
      balanceDue: 50000,
      codAmount: 50000,
    });
  });

  it('replaces order items and recalculates totals when details are updated', async () => {
    const order = {
      id: 'order-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      conversationId: null,
      orderNumber: 'MM-ORD-1001',
      status: 'confirmed',
      paymentStatus: 'cod_pending',
      paymentMethod: 'cod',
      subtotal: 20000,
      taxAmount: 0,
      discountAmount: 0,
      shippingFee: 0,
      totalAmount: 20000,
      paidAmount: 5000,
      balanceDue: 15000,
      codAmount: 15000,
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
          balanceDue: 35000,
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
      append: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OrderService(
      orderRepository as any,
      orderItemRepository as any,
      productRepository as any,
      domainEventService as any,
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
        balanceDue: 35000,
        codAmount: 35000,
        notes: 'updated',
      }),
    );
    expect(domainEventService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'order.updated',
        entityId: 'order-1',
      }),
    );
    expect(updated).toMatchObject({
      subtotal: 38000,
      totalAmount: 40000,
      balanceDue: 35000,
    });
  });
});
