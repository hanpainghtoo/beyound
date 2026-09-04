import { ForbiddenException } from '@nestjs/common';
import { OrderController } from './order.controller';

describe('OrderController payment authorization', () => {
  const orderService = { updateOrderLifecycle: jest.fn() };
  const controller = new OrderController(orderService as any);

  beforeEach(() => jest.clearAllMocks());

  it('rejects payment changes from staff csrs', async () => {
    await expect(
      controller.updateOrderLifecycle(
        { id: 'tenant-1' },
        { id: 'csr-1', role: 'csr' },
        '00000000-0000-0000-0000-000000000001',
        { paymentStatus: 'paid', paidAmount: 1000 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(orderService.updateOrderLifecycle).not.toHaveBeenCalled();
  });

  it('rejects delivery detail changes from staff csrs', async () => {
    await expect(
      controller.updateOrderLifecycle(
        { id: 'tenant-1' },
        { id: 'csr-1', role: 'csr' },
        '00000000-0000-0000-0000-000000000001',
        { deliveryZone: 'Tamwe', trackingNumber: 'TRACK-1' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(orderService.updateOrderLifecycle).not.toHaveBeenCalled();
  });

  it('rejects cancellation and delivery status changes from staff csrs', async () => {
    await expect(
      controller.updateOrderLifecycle(
        { id: 'tenant-1' },
        { id: 'csr-1', role: 'csr' },
        '00000000-0000-0000-0000-000000000001',
        { status: 'cancelled' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      controller.updateOrderLifecycle(
        { id: 'tenant-1' },
        { id: 'csr-1', role: 'csr' },
        '00000000-0000-0000-0000-000000000001',
        { status: 'out_for_delivery' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(orderService.updateOrderLifecycle).not.toHaveBeenCalled();
  });

  it('allows managers to persist payment changes', async () => {
    orderService.updateOrderLifecycle.mockResolvedValue({
      id: 'order-1',
      paymentStatus: 'paid',
    });

    await controller.updateOrderLifecycle(
      { id: 'tenant-1' },
      { id: 'manager-1', role: 'supervisor' },
      '00000000-0000-0000-0000-000000000001',
      { paymentStatus: 'paid', paidAmount: 1000 },
    );

    expect(orderService.updateOrderLifecycle).toHaveBeenCalledWith(
      'tenant-1',
      '00000000-0000-0000-0000-000000000001',
      expect.objectContaining({ paymentStatus: 'paid', paidAmount: 1000 }),
      'manager-1',
    );
  });

  it('allows finance users to persist payment changes but not delivery updates', async () => {
    orderService.updateOrderLifecycle.mockResolvedValue({
      id: 'order-1',
      paymentStatus: 'paid',
    });

    await controller.updateOrderLifecycle(
      { id: 'tenant-1' },
      { id: 'finance-1', role: 'finance' },
      '00000000-0000-0000-0000-000000000001',
      { paymentStatus: 'paid', paidAmount: 1000 },
    );

    await expect(
      controller.updateOrderLifecycle(
        { id: 'tenant-1' },
        { id: 'finance-1', role: 'finance' },
        '00000000-0000-0000-0000-000000000001',
        { status: 'out_for_delivery' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows delivery users to update delivery-stage statuses but not payment changes', async () => {
    orderService.updateOrderLifecycle.mockResolvedValue({
      id: 'order-1',
      status: 'out_for_delivery',
    });

    await controller.updateOrderLifecycle(
      { id: 'tenant-1' },
      { id: 'delivery-1', role: 'delivery' },
      '00000000-0000-0000-0000-000000000001',
      { status: 'out_for_delivery', trackingNumber: 'TRACK-1' },
    );

    await expect(
      controller.updateOrderLifecycle(
        { id: 'tenant-1' },
        { id: 'delivery-1', role: 'delivery' },
        '00000000-0000-0000-0000-000000000001',
        { paymentStatus: 'paid' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      controller.updateOrderLifecycle(
        { id: 'tenant-1' },
        { id: 'delivery-1', role: 'delivery' },
        '00000000-0000-0000-0000-000000000001',
        { status: 'confirmed' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects workflow status changes from staff csrs', async () => {
    await expect(
      controller.updateOrderLifecycle(
        { id: 'tenant-1' },
        { id: 'csr-1', role: 'csr' },
        '00000000-0000-0000-0000-000000000001',
        { status: 'packed' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(orderService.updateOrderLifecycle).not.toHaveBeenCalled();
  });
});
