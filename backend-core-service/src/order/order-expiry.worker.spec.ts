/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { OrderExpiryWorker } from './order-expiry.worker';

describe('OrderExpiryWorker', () => {
  function worker(overrides: Record<string, unknown> = {}) {
    return new OrderExpiryWorker(
      (overrides.orderRepository || {}) as any,
      {} as any,
      {} as any,
      (overrides.transitionService || {}) as any,
      {} as any,
    );
  }

  it('does not let a scheduled failure escape the timer callback', async () => {
    const instance = worker();
    const error = new Error('database unavailable');
    jest.spyOn(instance, 'runOnce').mockRejectedValue(error);

    await expect(instance.runScheduled()).resolves.toEqual({
      expired: 0,
      overdueOrders: 0,
      failed: true,
    });
  });

  it('selects overdue, expirable orders with skip-locked batching', async () => {
    const getMany = jest.fn().mockResolvedValue([]);
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany,
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      }),
    };
    const orderRepository = {
      manager: {
        transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
          callback(manager),
        ),
      },
    };
    const instance = worker({ orderRepository });

    await instance.runOnce(new Date('2026-10-06T00:00:00.000Z'));

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'order.expires_at IS NOT NULL',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'order.expires_at <= :now',
      { now: new Date('2026-10-06T00:00:00.000Z') },
    );
    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(queryBuilder.setOnLocked).toHaveBeenCalledWith('skip_locked');
  });
});
