/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { AgentService } from './agent.service';

/**
 * Regression cover for thread pagination.
 *
 * `getConversationMessages` used to return the whole thread as one unbounded
 * ASC array. The inbox now pages newest-first with an exclusive `before`
 * cursor, so this pins: the cursor predicate, the DESC-then-reverse ordering,
 * the limit+1 overflow probe, and the `nextCursor` contract. Without the
 * cursor predicate consecutive pages overlap; without the id tiebreak a
 * same-millisecond row can flip pages between requests.
 */

type CapturedClause = { clause: string; params: Record<string, unknown> };

function createService(rows: Array<{ id: string; createdAt: Date }>) {
  const clauses: CapturedClause[] = [];
  let taken: number | undefined;

  const queryBuilder = {
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
    take: jest.fn(function take(n: number) {
      taken = n;
      return this;
    }),
    getMany: jest.fn(async () => rows),
  };

  const conversationRepository = {
    findOne: jest.fn(async () => ({ id: 'conv-1', metadata: {} })),
    update: jest.fn(async () => undefined),
  };
  const messageRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const emptyRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
  };

  const service = new AgentService(
    conversationRepository as any,
    messageRepository as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    {} as any,
    {} as any,
    { findOne: jest.fn() } as any,
    { append: jest.fn() } as any,
    { sendMessage: jest.fn() } as any,
    { emitNewMessage: jest.fn(), emitConversationUpdate: jest.fn() } as any,
    {
      assertProviderMessageUsageAvailable: jest.fn(async () => ({
        activePeriodId: 'p1',
      })),
      recordProviderMessageInTransaction: jest.fn(async () => ({ id: 'u1' })),
      trackProviderMessage: jest.fn(async () => ({ id: 'u1' })),
    } as any,
    { getDownloadUrl: jest.fn() } as any,
  );

  return { service, clauses, getTaken: () => taken, queryBuilder };
}

const TENANT = 'tenant-1';
const CONVERSATION = 'conv-1';

const row = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });

describe('AgentService.getConversationMessages pagination', () => {
  it('returns the newest page oldest-first with no cursor predicate', async () => {
    // DB returns DESC; rows below are newest-first as the query yields them.
    const { service, clauses } = createService([
      row('m3', '2026-10-08T03:00:00.000Z'),
      row('m2', '2026-10-08T02:00:00.000Z'),
      row('m1', '2026-10-08T01:00:00.000Z'),
    ]);

    const result = await service.getConversationMessages(TENANT, CONVERSATION, {
      limit: 15,
    });

    expect(clauses.some((c) => c.clause.includes('created_at <'))).toBe(false);
    expect(result.data.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('applies an exclusive before cursor for older pages', async () => {
    const { service, clauses } = createService([
      row('m1', '2026-10-08T01:00:00.000Z'),
    ]);

    await service.getConversationMessages(TENANT, CONVERSATION, {
      limit: 15,
      before: '2026-10-08T02:00:00.000Z',
    });

    const clause = clauses.find((c) => c.clause.includes('created_at <'));
    expect(clause).toBeDefined();
    expect(clause!.clause).not.toContain('<=');
    expect(clause!.params.before).toEqual(new Date('2026-10-08T02:00:00.000Z'));
  });

  it('probes one past the limit and reports the oldest returned row as cursor', async () => {
    const { service } = createService([
      row('m4', '2026-10-08T04:00:00.000Z'),
      row('m3', '2026-10-08T03:00:00.000Z'),
      row('m2', '2026-10-08T02:00:00.000Z'),
    ]);

    const result = await service.getConversationMessages(TENANT, CONVERSATION, {
      limit: 2,
    });

    expect(result.data.map((m) => m.id)).toEqual(['m3', 'm4']);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('2026-10-08T03:00:00.000Z');
  });

  it('orders newest-first with an id tiebreak', async () => {
    const { service, queryBuilder } = createService([]);
    await service.getConversationMessages(TENANT, CONVERSATION, {});

    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'message.createdAt',
      'DESC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('message.id', 'DESC');
  });

  it('defaults to 15 and clamps to the 100 cap', async () => {
    const { service: s1, getTaken: taken1 } = createService([]);
    await s1.getConversationMessages(TENANT, CONVERSATION, {});
    expect(taken1()).toBe(16);

    const { service: s2, getTaken: taken2 } = createService([]);
    await s2.getConversationMessages(TENANT, CONVERSATION, { limit: 500 });
    expect(taken2()).toBe(101);
  });
});
