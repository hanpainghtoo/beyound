import { DomainEventService } from './domain-event.service';
import type { DomainEvent } from './entities/domain-event.entity';

function eventRow(overrides: Partial<DomainEvent>): DomainEvent {
  return {
    id: 'e1',
    tenantId: 'tenant-a',
    actorId: null,
    actorType: 'agent',
    entityType: 'customer',
    entityId: 'customer-1',
    eventType: 'order_created',
    payload: {},
    source: 'api',
    processedAt: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  } as DomainEvent;
}

describe('DomainEventService customer timeline pagination', () => {
  function serviceWith(rows: DomainEvent[]) {
    // Minimal query-builder stub: the service only chains where/andWhere/
    // orderBy and terminal getMany/getCount, so each terminal call must hand
    // back the slice the service asks for.
    let skip = 0;
    let take = Number.MAX_SAFE_INTEGER;
    const sorted = [...rows].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const builder = {
      where: () => builder,
      andWhere: () => builder,
      orderBy: () => builder,
      skip: (value: number) => ((skip = value), builder),
      take: (value: number) => ((take = value), builder),
      getMany: async () => sorted.slice(skip, skip + take),
      getCount: async () => sorted.length,
    };
    return new DomainEventService({
      createQueryBuilder: () => builder,
    } as any);
  }

  it('returns the newest events first, paginated, with total pages', async () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      eventRow({
        id: `e${index}`,
        createdAt: new Date(Date.UTC(2026, 0, index + 1)),
      }),
    );
    const service = serviceWith(rows);

    const first = await service.getCustomerTimeline('tenant-a', 'customer-1', {
      page: 1,
      limit: 3,
    });
    expect(first.data.map((row) => row.id)).toEqual(['e6', 'e5', 'e4']);
    expect(first.total).toBe(7);
    expect(first.totalPages).toBe(3);
    expect(first.hasNext).toBe(true);
    expect(first.hasPrev).toBe(false);

    const last = await service.getCustomerTimeline('tenant-a', 'customer-1', {
      page: 3,
      limit: 3,
    });
    expect(last.data.map((row) => row.id)).toEqual(['e0']);
    expect(last.hasNext).toBe(false);
    expect(last.hasPrev).toBe(true);
  });

  it('clamps out-of-range page and limit values instead of erroring', async () => {
    const rows = [eventRow({ id: 'only' })];
    const service = serviceWith(rows);

    // A page past the end is simply empty (hasNext=false), never an error;
    // limit 0 falls back to the default of 20.
    const pastEnd = await service.getCustomerTimeline('tenant-a', 'customer-1', {
      page: 99,
      limit: 0,
    });
    expect(pastEnd.data).toEqual([]);
    expect(pastEnd.page).toBe(99);
    expect(pastEnd.limit).toBe(20);
    expect(pastEnd.hasNext).toBe(false);
    expect(pastEnd.hasPrev).toBe(true);

    // Negative page clamps to the first page; oversized limit caps at 100.
    const clamped = await service.getCustomerTimeline('tenant-a', 'customer-1', {
      page: -5,
      limit: 5000,
    });
    expect(clamped.page).toBe(1);
    expect(clamped.limit).toBe(100);
    expect(clamped.data.map((row) => row.id)).toEqual(['only']);
  });
});
