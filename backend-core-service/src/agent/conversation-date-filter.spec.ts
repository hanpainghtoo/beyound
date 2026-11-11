/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { AgentService } from './agent.service';

/**
 * Regression cover for the inbox time cursor.
 *
 * `ConversationFilterDto` has always declared and validated `dateFrom` and
 * `dateTo` as ISO dates, but `getConversations` never applied them — it wrote
 * 13 `andWhere` clauses and none of them touched a date. A caller passing
 * either param received the full unfiltered list with no error. The inbox queue
 * paginates with `dateTo`, so leaving this broken would make pagination loop the
 * same first page forever.
 */

type CapturedClause = { clause: string; params: Record<string, unknown> };

function createService() {
  const clauses: CapturedClause[] = [];

  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
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
    distinct: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  const conversationRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    // Filter counts run as a separate aggregate query.
    query: jest.fn().mockResolvedValue([{}]),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
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
    { ...emptyRepo } as any,
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

  return { service, clauses };
}

const TENANT = 'tenant-1';
const AGENT = 'agent-1';

describe('AgentService.getConversations date range', () => {
  it('applies dateFrom as a lower bound on last activity', async () => {
    const { service, clauses } = createService();

    await service.getConversations(TENANT, AGENT, {
      dateFrom: '2026-01-01T00:00:00.000Z',
    } as any);

    const clause = clauses.find((entry) => entry.clause.includes(':dateFrom'));
    expect(clause).toBeDefined();
    expect(clause!.clause).toContain('>=');
    expect(clause!.params.dateFrom).toEqual(
      new Date('2026-01-01T00:00:00.000Z'),
    );
  });

  it('applies dateTo as an upper bound on last activity', async () => {
    const { service, clauses } = createService();

    await service.getConversations(TENANT, AGENT, {
      dateTo: '2026-02-01T00:00:00.000Z',
    } as any);

    const clause = clauses.find((entry) => entry.clause.includes(':dateTo'));
    expect(clause).toBeDefined();
    expect(clause!.clause).toContain('<=');
    expect(clause!.params.dateTo).toEqual(new Date('2026-02-01T00:00:00.000Z'));
  });

  it('filters on last_message_at, not created_at', async () => {
    const { service, clauses } = createService();

    await service.getConversations(TENANT, AGENT, {
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-02-01T00:00:00.000Z',
    } as any);

    const dateClauses = clauses.filter(
      (entry) =>
        entry.clause.includes(':dateFrom') || entry.clause.includes(':dateTo'),
    );
    expect(dateClauses).toHaveLength(2);
    // The inbox orders and pages by recency of activity, so a date range has to
    // mean last_message_at. created_at would exclude long-running threads.
    for (const entry of dateClauses) {
      expect(entry.clause).toContain('last_message_at');
      expect(entry.clause).toContain('COALESCE');
    }
  });

  it('writes no date clause when neither param is supplied', async () => {
    const { service, clauses } = createService();

    await service.getConversations(TENANT, AGENT, {} as any);

    const dateClauses = clauses.filter(
      (entry) =>
        entry.clause.includes(':dateFrom') || entry.clause.includes(':dateTo'),
    );
    expect(dateClauses).toHaveLength(0);
  });

  it('still scopes to the tenant when a date range is present', async () => {
    const { service, clauses } = createService();

    await service.getConversations(TENANT, AGENT, {
      dateFrom: '2026-01-01T00:00:00.000Z',
    } as any);

    // A date filter must never widen the query past the caller's tenant.
    const tenantClause = clauses.find((entry) =>
      entry.clause.includes('conversation.tenant_id'),
    );
    expect(tenantClause).toBeDefined();
    expect(tenantClause!.params.tenantId).toBe(TENANT);
  });

  it('combines with an existing filter rather than replacing it', async () => {
    const { service, clauses } = createService();

    await service.getConversations(TENANT, AGENT, {
      filter: 'unread',
      dateTo: '2026-02-01T00:00:00.000Z',
    } as any);

    expect(
      clauses.some((entry) => entry.clause.includes('inboxForceUnread')),
    ).toBe(true);
    expect(clauses.some((entry) => entry.clause.includes(':dateTo'))).toBe(
      true,
    );
  });
});
