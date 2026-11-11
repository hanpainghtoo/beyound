import { NotFoundException } from '@nestjs/common';
import { DeliveryService } from './delivery.service';

function fixture() {
  const order: any = {
    id: 'order-1',
    tenantId: 'tenant-1',
    status: 'confirmed',
    deliveryStatus: 'packed',
    deliveryAssigneeName: null,
    deliveryAssigneePhone: null,
    deliveryDate: null,
    statusHistory: [],
    orderNumber: 'ORD-1',
    createdAt: new Date(),
    customer: null,
  };
  const detailQuery: any = {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(order),
  };
  const transition: any = {
    transitionDelivery: jest.fn().mockResolvedValue(order),
    updateDelivery: jest
      .fn()
      .mockImplementation(async (_tenant: string, _id: string, input: any) => {
        order.deliveryAssigneeName =
          input.deliveryAssigneeName ?? order.deliveryAssigneeName;
        order.deliveryAssigneePhone =
          input.deliveryAssigneePhone ?? order.deliveryAssigneePhone;
        order.deliveryDate = input.deliveryDate ?? order.deliveryDate;
        if (input.to !== undefined && input.to !== order.deliveryStatus)
          order.deliveryStatus = input.to;
        return order;
      }),
  };
  const repository: any = {
    findOne: jest.fn().mockResolvedValue(order),
    createQueryBuilder: jest.fn().mockReturnValue(detailQuery),
  };
  return {
    order,
    detailQuery,
    transition,
    repository,
    service: new DeliveryService(repository, transition),
  };
}

describe('DeliveryService', () => {
  it('persists assignee, phone, and date through the locked shared transition method', async () => {
    const { order, transition, service } = fixture();
    const result = await service.updateDelivery(
      'tenant-1',
      'order-1',
      {
        deliveryAssigneeName: 'Agent A',
        deliveryAssigneePhone: '0999',
        deliveryDate: '2026-10-10',
      },
      'agent-1',
    );
    expect(transition.updateDelivery).toHaveBeenCalledWith(
      'tenant-1',
      'order-1',
      expect.objectContaining({
        to: undefined,
        actorId: 'agent-1',
        reason: undefined,
        deliveryAssigneeName: 'Agent A',
        deliveryAssigneePhone: '0999',
        deliveryDate: new Date('2026-10-10'),
      }),
    );
    expect(order.deliveryAssigneeName).toBe('Agent A');
    expect(order.deliveryAssigneePhone).toBe('0999');
    expect(order.deliveryDate).toEqual(new Date('2026-10-10'));
    expect(result.status).toBe('packed');
  });

  it('does not transition for assignee-only or unchanged-status edits', async () => {
    const first = fixture();
    await first.service.updateDelivery(
      'tenant-1',
      'order-1',
      { deliveryAssigneeName: 'Agent A' },
      'agent-1',
    );
    expect(first.transition.transitionDelivery).not.toHaveBeenCalled();

    const second = fixture();
    await second.service.updateDelivery(
      'tenant-1',
      'order-1',
      { status: 'packed', deliveryAssigneeName: 'Agent A' },
      'agent-1',
    );
    expect(second.transition.transitionDelivery).not.toHaveBeenCalled();
  });

  it('passes actor and reason and leaves fields unchanged when the transition fails', async () => {
    const { order, transition, service } = fixture();
    transition.updateDelivery.mockRejectedValueOnce(
      new Error('invalid transition'),
    );
    await expect(
      service.updateDelivery(
        'tenant-1',
        'order-1',
        {
          status: 'out_for_delivery',
          reason: 'Packed for dispatch',
          deliveryAssigneeName: 'Agent A',
        },
        'agent-1',
      ),
    ).rejects.toThrow('invalid transition');
    expect(transition.updateDelivery).toHaveBeenCalled();
    expect(order.deliveryAssigneeName).toBeNull();

    const ok = fixture();
    await ok.service.updateDelivery(
      'tenant-1',
      'order-1',
      { status: 'out_for_delivery', reason: 'Go' },
      'agent-1',
    );
    expect(ok.transition.transitionDelivery).toHaveBeenCalledWith(
      'tenant-1',
      'order-1',
      expect.objectContaining({ actorId: 'agent-1', reason: 'Go' }),
    );
  });

  it('rejects a missing order and an order belonging to another tenant', async () => {
    const missing = fixture();
    missing.repository.findOne.mockResolvedValue(null);
    await expect(
      missing.service.updateDelivery('tenant-1', 'order-1', {}, 'agent-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const otherTenant = fixture();
    otherTenant.repository.findOne.mockResolvedValue(null);
    await expect(
      otherTenant.service.updateDelivery('tenant-2', 'order-1', {}, 'agent-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only confirmed orders and applies the five-value status filter', async () => {
    const { detailQuery, repository, service } = fixture();
    const listQuery: any = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    repository.createQueryBuilder.mockReturnValue(listQuery);
    await service.getDeliveries('tenant-1', {
      status: 'failed_delivery',
      page: 1,
      limit: 50,
    });
    expect(listQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("order.status = 'confirmed'"),
      expect.objectContaining({
        deliveryStatuses: [
          'packed',
          'out_for_delivery',
          'delivered',
          'failed_delivery',
          'returned',
        ],
      }),
    );
    expect(listQuery.andWhere).toHaveBeenCalledWith(
      'order.delivery_status = :status',
      { status: 'failed_delivery' },
    );
    expect(detailQuery.getOne).not.toHaveBeenCalled();
  });

  it('returns 404 for an unconfirmed delivery detail', async () => {
    const { order, service } = fixture();
    order.status = 'pending';
    await expect(
      service.getDeliveryDetail('tenant-1', 'order-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
