/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { OrderService } from './order.service';
import { DeliveryService } from '../delivery/delivery.service';

/**
 * Cover for the per-conversation list filters (Plan 72).
 *
 * The inbox context panel lists a conversation's orders and deliveries with
 * server-side pagination. Without these predicates the only option would be
 * the first-100 bulk scan filtered client-side, which silently drops rows
 * past the scan and reports wrong totals. Both specs assert the exact
 * predicate against the column the entity actually maps.
 */

type CapturedClause = { clause: string; params: Record<string, unknown> };

function trackableQueryBuilder() {
  const clauses: CapturedClause[] = [];
  const qb = {
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn(function where(
      clause: string,
      params?: Record<string, unknown>,
    ) {
      clauses.push({ clause, params: params ?? {} });
      return this;
    }),
    andWhere: jest.fn(function andWhere(
      clause: string,
      params?: Record<string, unknown>,
    ) {
      clauses.push({ clause, params: params ?? {} });
      return this;
    }),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    // The deliveries list also runs a status-count aggregate off the same
    // repository, which uses addSelect/groupBy on its own builder.
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(undefined),
  };
  return { qb, clauses };
}

describe('per-conversation list filters', () => {
  it('orders: applies conversationId against order.conversation_id', async () => {
    const { qb, clauses } = trackableQueryBuilder();
    // Constructor args follow the service's current signature; the trailing
    // optional media library is omitted (the filter path never touches it).
    const service = new OrderService(
      { createQueryBuilder: jest.fn(() => qb) } as any,
      {} as any,
      {} as any,
      { append: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await service.getAllOrders('tenant-1', { conversationId: 'conv-1' });

    const clause = clauses.find((c) =>
      c.clause.includes('order.conversation_id = :conversationId'),
    );
    expect(clause).toBeDefined();
    expect(clause!.params.conversationId).toBe('conv-1');
  });

  it('orders: omits the predicate when no conversation is given', async () => {
    const { qb, clauses } = trackableQueryBuilder();
    const service = new OrderService(
      { createQueryBuilder: jest.fn(() => qb) } as any,
      {} as any,
      {} as any,
      { append: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await service.getAllOrders('tenant-1', {});

    expect(clauses.some((c) => c.clause.includes(':conversationId'))).toBe(
      false,
    );
  });

  it('deliveries: applies customerId against order.customer_id', async () => {
    const { qb, clauses } = trackableQueryBuilder();
    const service = new DeliveryService(
      { createQueryBuilder: jest.fn(() => qb) } as any,
      {} as any,
    );

    await service.getDeliveries('tenant-1', { customerId: 'cust-1' });

    const clause = clauses.find((c) =>
      c.clause.includes('order.customer_id = :customerId'),
    );
    expect(clause).toBeDefined();
    expect(clause!.params.customerId).toBe('cust-1');
  });

  it('deliveries: applies conversationId against order.conversation_id', async () => {
    const { qb, clauses } = trackableQueryBuilder();
    const service = new DeliveryService(
      { createQueryBuilder: jest.fn(() => qb) } as any,
      {} as any,
    );

    await service.getDeliveries('tenant-1', {
      conversationId: 'conv-1',
    });

    const clause = clauses.find((c) =>
      c.clause.includes('order.conversation_id = :conversationId'),
    );
    expect(clause).toBeDefined();
    expect(clause!.params.conversationId).toBe('conv-1');
  });
});
