import { OrderController } from './order.controller';
import { BadRequestException } from '@nestjs/common';

describe('OrderController focused status endpoints', () => {
  const orderService = {
    updateOrderStatus: jest.fn(),
    updatePaymentStatus: jest.fn(),
    mapOrderDetail: jest.fn((order) => order),
  };
  const transitionService = { transitionDelivery: jest.fn() };
  const controller = new OrderController(
    orderService as any,
    transitionService as any,
  );
  beforeEach(() => jest.clearAllMocks());

  it('passes tenant-scoped order status changes to the service', async () => {
    orderService.updateOrderStatus.mockResolvedValue({ id: 'order-1' });
    await controller.updateOrderStatus(
      { id: 'tenant-1' },
      { id: 'agent-1', role: 'agent' },
      'order-1',
      { status: 'confirmed', reason: 'paid' },
    );
    expect(orderService.updateOrderStatus).toHaveBeenCalledWith(
      'tenant-1',
      'order-1',
      'confirmed',
      'paid',
      'agent-1',
    );
  });

  it('passes payment proof reference through the focused payment endpoint', async () => {
    orderService.updatePaymentStatus.mockResolvedValue({ id: 'order-1' });
    await controller.updatePaymentStatus(
      { id: 'tenant-1' },
      { id: 'agent-1' },
      'order-1',
      { status: 'paid', attachmentReference: 'proof-1' },
    );
    expect(orderService.updatePaymentStatus).toHaveBeenCalledWith(
      'tenant-1',
      'order-1',
      'paid',
      'agent-1',
      'proof-1',
      undefined,
    );
  });

  it('passes the payment reason and surfaces the unpaid-without-reason 400', async () => {
    orderService.updatePaymentStatus.mockRejectedValueOnce(
      new BadRequestException('A note is required'),
    );
    await expect(
      controller.updatePaymentStatus(
        { id: 'tenant-1' },
        { id: 'agent-1' },
        'order-1',
        { status: 'unpaid' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    orderService.updatePaymentStatus.mockResolvedValueOnce({ id: 'order-1' });
    await expect(
      controller.updatePaymentStatus(
        { id: 'tenant-1' },
        { id: 'agent-1' },
        'order-1',
        { status: 'unpaid', reason: 'proof rejected' },
      ),
    ).resolves.toEqual({ id: 'order-1' });
    expect(orderService.updatePaymentStatus).toHaveBeenLastCalledWith(
      'tenant-1',
      'order-1',
      'unpaid',
      'agent-1',
      undefined,
      'proof rejected',
    );
  });

  it('passes tenant and actor through the focused delivery endpoint', async () => {
    transitionService.transitionDelivery.mockResolvedValue({ id: 'order-1' });
    await controller.updateDeliveryStatus(
      { id: 'tenant-1' },
      { id: 'agent-1' },
      'order-1',
      { status: 'out_for_delivery', reason: undefined },
    );
    expect(transitionService.transitionDelivery).toHaveBeenCalledWith(
      'tenant-1',
      'order-1',
      expect.objectContaining({ to: 'out_for_delivery', actorId: 'agent-1' }),
    );
  });

  it('has no lifecycle method or route source', () => {
    expect((controller as any).updateOrderLifecycle).toBeUndefined();
  });
});
