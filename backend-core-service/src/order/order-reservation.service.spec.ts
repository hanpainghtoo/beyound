/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { BadRequestException } from '@nestjs/common';
import { OrderReservationService } from './order-reservation.service';

function fakeManager(
  executeResults: Array<{ affected: number }>,
  productStock = 3,
) {
  const reservation = {
    id: 'reservation-1',
    tenantId: 'tenant-1',
    orderId: 'order-1',
    orderItemId: 'item-1',
    productId: 'product-1',
    quantity: 1,
    state: 'active',
  } as any;
  const product = {
    id: 'product-1',
    tenantId: 'tenant-1',
    trackInventory: true,
    stockQuantity: productStock,
  } as any;
  const selectBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([reservation]),
  };
  const updateBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(executeResults.shift() || { affected: 0 }),
      ),
  };
  let queryBuilderCall = 0;
  const reservationRepository = {
    createQueryBuilder: jest.fn(() =>
      queryBuilderCall++ % 2 === 0 ? selectBuilder : updateBuilder,
    ),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity.name === 'OrderItemReservation') return reservationRepository;
      if (entity.name === 'Product') {
        return {
          findOne: jest.fn().mockResolvedValue(product),
          save: jest.fn().mockImplementation(async (value) => value),
        };
      }
      if (entity.name === 'StockMovement')
        return { save: jest.fn(), find: jest.fn().mockResolvedValue([]) };
      throw new Error(`Unexpected repository ${entity.name}`);
    }),
  } as any;
  return { manager, product, reservationRepository };
}

describe('OrderReservationService atomic state changes', () => {
  it('converts once and writes one stock movement without going below zero', async () => {
    const { manager, product } = fakeManager([
      { affected: 1 },
      { affected: 0 },
    ]);
    const service = new OrderReservationService();
    const order = { id: 'order-1', tenantId: 'tenant-1' } as any;

    expect(await service.convert(manager, order, 'agent-1')).toBe(1);
    expect(await service.convert(manager, order, 'agent-1')).toBe(0);
    expect(product.stockQuantity).toBe(2);
  });

  it('fails before creating a negative stock balance', async () => {
    const { manager } = fakeManager([{ affected: 1 }], 0);
    const service = new OrderReservationService();

    await expect(
      service.convert(manager, { id: 'order-1', tenantId: 'tenant-1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('releases an active reservation only once', async () => {
    const { manager } = fakeManager([{ affected: 1 }, { affected: 0 }]);
    const service = new OrderReservationService();

    expect(
      await service.release(manager, 'order-1', 'tenant-1', 'expired'),
    ).toBe(1);
    expect(
      await service.release(manager, 'order-1', 'tenant-1', 'expired'),
    ).toBe(0);
  });

  it('converts to a no-op when no reservation rows exist', async () => {
    const { manager } = fakeManager([]);
    const reservationRepository = manager.getRepository({
      name: 'OrderItemReservation',
    });
    reservationRepository.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }));
    const service = new OrderReservationService();
    await expect(
      service.convert(manager, { id: 'order-1', tenantId: 'tenant-1' } as any),
    ).resolves.toBe(0);
  });

  it('restores converted stock only when a stock movement exists and never twice', async () => {
    const product = {
      id: 'product-1',
      tenantId: 'tenant-1',
      stockQuantity: 2,
    } as any;
    const movements: any[] = [
      {
        orderId: 'order-1',
        tenantId: 'tenant-1',
        delta: -1,
        reason: 'reservation_converted',
      },
    ];
    const reservation = {
      id: 'reservation-1',
      orderId: 'order-1',
      tenantId: 'tenant-1',
      productId: 'product-1',
      orderItemId: 'item-1',
      quantity: 1,
      state: 'converted',
    } as any;
    const manager: any = {
      getRepository: jest.fn((entity) => {
        if (entity.name === 'StockMovement')
          return {
            find: jest.fn().mockResolvedValue(movements),
            save: jest.fn().mockImplementation(async (movement) => {
              movements.push(movement);
              return movement;
            }),
          };
        if (entity.name === 'OrderItemReservation')
          return { find: jest.fn().mockResolvedValue([reservation]) };
        if (entity.name === 'Product')
          return {
            findOne: jest.fn().mockResolvedValue(product),
            save: jest.fn().mockImplementation(async (value) => value),
          };
        throw new Error(`Unexpected repository ${entity.name}`);
      }),
    };
    const service = new OrderReservationService();
    expect(
      await service.restoreConverted(manager, {
        id: 'order-1',
        tenantId: 'tenant-1',
      } as any),
    ).toBe(1);
    expect(product.stockQuantity).toBe(3);
    expect(
      await service.restoreConverted(manager, {
        id: 'order-1',
        tenantId: 'tenant-1',
      } as any),
    ).toBe(0);
    expect(product.stockQuantity).toBe(3);
  });

  it('locks shared products in product-id order for opposite item orders', async () => {
    const lockCalls: string[] = [];
    const products = new Map([
      [
        'product-a',
        { id: 'product-a', tenantId: 'tenant-1', stockQuantity: 10 },
      ],
      [
        'product-b',
        { id: 'product-b', tenantId: 'tenant-1', stockQuantity: 10 },
      ],
    ]);
    let queryCall = 0;
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const reservationRepository: any = {};
    reservationRepository.createQueryBuilder = jest.fn((alias?: string) => {
      if (!alias) return updateBuilder;
      queryCall += 1;
      const rows =
        queryCall === 1
          ? [
              {
                id: 'b',
                tenantId: 'tenant-1',
                orderId: 'order-1',
                productId: 'product-b',
                quantity: 1,
                state: 'active',
              },
              {
                id: 'a',
                tenantId: 'tenant-1',
                orderId: 'order-1',
                productId: 'product-a',
                quantity: 1,
                state: 'active',
              },
            ]
          : [
              {
                id: 'a2',
                tenantId: 'tenant-1',
                orderId: 'order-2',
                productId: 'product-a',
                quantity: 1,
                state: 'active',
              },
              {
                id: 'b2',
                tenantId: 'tenant-1',
                orderId: 'order-2',
                productId: 'product-b',
                quantity: 1,
                state: 'active',
              },
            ];
      rows.sort((left, right) => left.productId.localeCompare(right.productId));
      return {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
    });
    const manager: any = {
      getRepository: jest.fn((entity) => {
        if (entity.name === 'OrderItemReservation')
          return reservationRepository;
        if (entity.name === 'Product') {
          return {
            findOne: jest.fn(async ({ where }: any) => {
              lockCalls.push(where.id);
              return products.get(where.id);
            }),
            save: jest.fn(async (value) => value),
          };
        }
        if (entity.name === 'StockMovement') return { save: jest.fn() };
        throw new Error(`Unexpected repository ${entity.name}`);
      }),
    };
    const service = new OrderReservationService();
    await service.convert(manager, {
      id: 'order-1',
      tenantId: 'tenant-1',
    } as any);
    await service.convert(manager, {
      id: 'order-2',
      tenantId: 'tenant-1',
    } as any);
    expect(lockCalls).toEqual([
      'product-a',
      'product-b',
      'product-a',
      'product-b',
    ]);
  });
});
