/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { AgentService } from './agent.service';
import type { Conversation } from '../conversation/entities/conversation.entity';

/**
 * Coverage for the Phase 5 queue contract: server-side filters, per-filter
 * counts, and server-owned intent/urgency/score classification.
 *
 * The last of these existed before, but only in the dashboard. Two
 * implementations of the same idea meant the API could filter with one
 * classifier while the card coloured itself with another. These tests pin the
 * server one so the client can delete its own.
 */

type CapturedClause = { clause: string; params: Record<string, unknown> };

function createService(
  rows: unknown[] = [],
  countRow: Record<string, unknown> = {},
  orders: unknown[] = [],
  unreadRows: unknown[] = [],
  latestRows: unknown[] = [],
) {
  const clauses: CapturedClause[] = [];
  const addSelects: string[] = [];
  let countSql = '';
  let countParams: unknown[] = [];

  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn(function addSelect(columns: string[]) {
      addSelects.push(...columns);
      return this;
    }),
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
    getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
  };

  const conversationRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    query: jest.fn().mockImplementation((sql: string, params: unknown) => {
      countSql = sql;
      countParams = params as unknown[];
      // Mirror TypeORM's real contract: raw `query` rejects a non-array with
      // "Query values must be an array". A mock that accepted anything would
      // have hidden the bug that shipped every chip as a confident 0.
      if (!Array.isArray(params)) {
        return Promise.reject(new Error('Query values must be an array'));
      }
      return Promise.resolve([countRow]);
    }),
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
  // orderRepository: resolves the page's linked orders for the classifier.
  // Returns [] by default (a queue page with no linked orders).
  const orderFind = jest.fn().mockResolvedValue(orders);
  const orderRepository = { ...emptyRepo, find: orderFind };
  // messageRepository: unread-count aggregate for the page. Resolves empty by
  // default (no unread customer messages); tests override via `unreadRows`.
  const unreadQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(unreadRows),
    getMany: jest.fn().mockResolvedValue(latestRows),
  };
  const messageRepository = {
    ...emptyRepo,
    createQueryBuilder: jest.fn(() => unreadQb),
  };
  const service = new AgentService(
    conversationRepository as any,
    messageRepository as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    { ...emptyRepo } as any,
    orderRepository as any,
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

  return {
    service,
    clauses,
    addSelects,
    orderFind,
    unreadQb,
    getCountSql: () => countSql,
    getCountParams: () => countParams,
    getCountValues: () => countParams,
  };
}

const TENANT = 'tenant-1';
const AGENT = 'agent-1';

const findClause = (clauses: CapturedClause[], needle: string) =>
  clauses.find((entry) => entry.clause.includes(needle));

describe('AgentService.getConversations server-side queue filters', () => {
  it('filters unassigned when requested', async () => {
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, { unassigned: true } as any);
    // The client used to express this itself; the API could not.
    expect(findClause(clauses, 'assigned_agent_id IS NULL')).toBeDefined();
  });

  it('narrows the queue to one channel without touching the buckets', async () => {
    // A scope like search: constrains rows AND recounts chips inside it.
    const { service, clauses, getCountSql } = createService();
    await service.getConversations(TENANT, AGENT, {
      channelId: '11111111-1111-4111-8111-111111111111',
    } as any);
    const clause = findClause(clauses, 'conversation.channel_id = :channelId');
    expect(clause).toBeDefined();
    expect(getCountSql()).toContain('conversation.channel_id = $');
  });

  it('treats resolvedOnly as resolved OR closed', async () => {
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, {
      resolvedOnly: true,
    } as any);
    const clause = findClause(clauses, ':...resolvedStatuses');
    expect(clause).toBeDefined();
    expect(clause!.params.resolvedStatuses).toEqual(['resolved', 'closed']);
  });

  it('applies the payment_review intent predicate', async () => {
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, {
      intent: 'payment_review',
    } as any);
    const clause = findClause(clauses, ':...openPay');
    expect(clause).toBeDefined();
    expect(clause!.params.openPay).toEqual([
      'pending',
      'partially_paid',
      'cod_pending',
    ]);
    // Keyword half of the predicate reads subject/tags only — exactly the
    // fields the row classifier builds its haystack from. Matching message
    // content here pulled threads into buckets they do not resolve to (e.g. a
    // "COD delivery guide" note landing in payment_review while the row says
    // delivery), so filter membership and resolved intent disagreed.
    expect(clause!.clause).toContain('subject ILIKE ANY');
    expect(clause!.clause).not.toContain('message.content ILIKE ANY');
    // Top of the priority chain: nothing outranks payment, so no exclusions.
    expect(clause!.clause).not.toContain('AND NOT');
  });

  it('excludes higher-priority signals from the complaints bucket', async () => {
    // A thread that is both a complaint and a payment case resolves to
    // payment_review. Without the exclusion it would sit behind the Complaints
    // chip while wearing the Payment review badge.
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, {
      intent: 'complaints',
    } as any);
    const clause = findClause(clauses, ':complaintKw');
    expect(clause).toBeDefined();
    expect(clause!.clause).toContain('AND NOT');
    expect(clause!.clause).toContain(':payKw');
  });

  it('excludes every higher signal from the follow_up bucket', async () => {
    // Bottom of the chain: follow_up must exclude payment, complaint,
    // delivery AND order signals, or a thread with any of those resolves
    // above follow_up while the chip claims it.
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, {
      intent: 'follow_up',
    } as any);
    const clause = findClause(clauses, ':followUpKw');
    expect(clause).toBeDefined();
    for (const param of [':payKw', ':complaintKw', ':deliveryKw', ':orderKw']) {
      expect(clause!.clause).toContain(param);
    }
  });

  it('applies the delivery intent predicate against order state', async () => {
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, {
      intent: 'delivery',
    } as any);
    const clause = findClause(clauses, ':...deliveryStatuses');
    expect(clause).toBeDefined();
    expect(clause!.params.deliveryStatuses).toEqual([
      'out_for_delivery',
      'delivered',
      'failed_delivery',
      'returned',
    ]);
    expect(clause!.clause).toContain('delivery_assignee_name IS NOT NULL');
    expect(clause!.clause).toContain('delivery_status IN');
  });

  it('matches order_intent rows that have a linked order', async () => {
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, {
      intent: 'order_intent',
    } as any);
    expect(findClause(clauses, 'workspaceOrder.id IS NOT NULL')).toBeDefined();
  });

  it('does not constrain general, since it means "no particular intent"', async () => {
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, { intent: 'general' } as any);
    // Returning nothing for `general` would silently empty the queue.
    for (const param of [':payKw', ':complaintKw', ':orderKw']) {
      expect(findClause(clauses, param)).toBeUndefined();
    }
  });

  it('ignores an unknown intent rather than returning nothing', async () => {
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, {
      intent: 'nonsense',
    } as any);
    for (const param of [':payKw', ':complaintKw', ':orderKw', ':openPay']) {
      expect(findClause(clauses, param)).toBeUndefined();
    }
  });

  it('fetches the page orders for the classifier in one query', async () => {
    const row = { id: 'c1' };
    const { service, orderFind } = createService([row]);
    await service.getConversations(TENANT, AGENT, {} as any);
    // addSelect aliases never reach the entity under getMany(), so the orders
    // must arrive through the repository, not the query builder.
    expect(orderFind).toHaveBeenCalledTimes(1);
    const criteria = orderFind.mock.calls[0][0] as {
      where: Record<string, unknown>;
      select: string[];
    };
    expect(criteria.where.tenantId).toBe(TENANT);
    expect(criteria.select).toEqual(
      expect.arrayContaining([
        'paymentStatus',
        'status',
        'deliveryStatus',
        'totalAmount',
        'deliveryAssigneeName',
      ]),
    );
  });

  it('filters on the newest linked order rather than any joined order', async () => {
    // A thread can link several orders. If the filter matched ANY joined row,
    // a conversation whose OLD order is confirmed would appear under
    // "Confirmed" while its card renders the newer order's status — the exact
    // disagreement these facets exist to remove.
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, {
      orderStatus: 'confirmed',
    } as any);
    const clause = findClause(clauses, 'EXISTS (');
    expect(clause).toBeDefined();
    expect(clause!.clause).toContain('latestOrder.status = :latestOrderStatus');
    expect(clause!.params.latestOrderStatus).toBe('confirmed');
    expect(clause!.clause).toContain(
      'ORDER BY newestOrder.created_at DESC NULLS LAST, newestOrder.id DESC',
    );
  });

  it('applies order, delivery and payment facets to one latest order row', async () => {
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, {
      orderStatus: 'confirmed',
      deliveryStatus: 'delivered',
      paymentStatus: 'paid',
    } as any);
    const clause = findClause(clauses, 'EXISTS (');
    expect(clause).toBeDefined();
    // One EXISTS means all three conditions are evaluated against the same
    // newest row; separate subqueries would leave the guarantee incidental.
    expect(clause!.clause).toContain('latestOrder.status = :latestOrderStatus');
    expect(clause!.clause).toContain(
      'latestOrder.delivery_status = :latestOrderDeliveryStatus',
    );
    expect(clause!.clause).toContain(
      'latestOrder.payment_status = :latestOrderPaymentStatus',
    );
    expect(clause!.params).toMatchObject({
      latestOrderStatus: 'confirmed',
      latestOrderDeliveryStatus: 'delivered',
      latestOrderPaymentStatus: 'paid',
    });
  });

  it('adds no order predicate when no facet is selected', async () => {
    const { service, clauses } = createService();
    await service.getConversations(TENANT, AGENT, {} as any);
    expect(findClause(clauses, 'EXISTS (')).toBeUndefined();
  });

  it('recounts chips inside the active order facets', async () => {
    // The dropdowns are a scope, like channel/search: if the counts ignored
    // them, "Open 3" would describe rows the visible filter excludes.
    const { service, getCountSql, getCountParams } = createService();
    await service.getConversations(TENANT, AGENT, {
      deliveryStatus: 'delivered',
    } as any);
    expect(getCountSql()).toContain('latestOrder.delivery_status = $');
    expect(getCountSql()).toContain('EXISTS (');
    expect(getCountParams()).toEqual(expect.arrayContaining(['delivered']));
  });
});

describe('AgentService.getConversations filter counts', () => {
  it('returns a count for every countable filter', async () => {
    const { service } = createService();
    const result = await service.getConversations(TENANT, AGENT, {} as any);
    for (const key of [
      'all',
      'unread',
      'unassigned',
      'mine',
      'hot_leads',
      'vip',
      'overdue',
      'payment_review',
      'complaints',
      'delivery',
      'follow_up',
      'open',
      'pending',
      'resolved',
      'closed',
    ]) {
      expect(result.counts).toHaveProperty(key);
    }
  });

  it('counts resolved and closed as separate statuses', async () => {
    // Folding Closed into Resolved made two distinct conversation statuses
    // indistinguishable in both the chip count and the card label.
    const { service, getCountSql } = createService();
    await service.getConversations(TENANT, AGENT, {} as any);
    const sql = getCountSql();
    expect(sql).toContain('AS "resolved"');
    expect(sql).toContain('AS "closed"');
    expect(sql).toMatch(/conversation\.status = \$\d+/);
  });

  it('computes every chip in one query rather than one per chip', async () => {
    const { service, getCountSql } = createService();
    await service.getConversations(TENANT, AGENT, {} as any);
    // Twelve chips as twelve round trips per keystroke is not a trade worth making.
    expect(
      (getCountSql().match(/count\(DISTINCT conversation.id\) FILTER/g) ?? [])
        .length,
    ).toBeGreaterThanOrEqual(10);
  });

  it('counts distinct conversations, not joined rows', async () => {
    const { service, getCountSql } = createService();
    await service.getConversations(TENANT, AGENT, {} as any);
    // The message LEFT JOIN multiplies rows: a conversation with five messages
    // becomes five rows, so a plain count(*) would count it five times. The
    // list query hides this behind `.distinct(true)`; a raw aggregate does not.
    expect(getCountSql()).toContain('count(DISTINCT conversation.id) FILTER');
  });

  it('counts `all` as the whole scope, not zero', async () => {
    const { service, getCountSql } = createService();
    await service.getConversations(TENANT, AGENT, {} as any);
    // `all` has no predicate, so it previously produced no column at all and
    // the All chip read 0 while every other chip showed a real number.
    expect(getCountSql()).toContain('AS "all"');
    expect(getCountSql()).not.toContain('FILTER (WHERE all)');
  });

  it('scopes counts to the tenant and the search term', async () => {
    const { service, getCountSql, getCountValues } = createService();
    await service.getConversations(TENANT, AGENT, {
      search: 'VOL-0042',
    } as any);
    // Tenant scoping must survive, expressed positionally now.
    expect(getCountSql()).toContain('conversation.tenant_id = $');
    expect(getCountSql()).toContain('workspaceOrder.order_number ILIKE $');
    expect(getCountValues()).toContain(TENANT);
    expect(getCountValues()).toContain('%VOL-0042%');
  });

  it('binds only params the counts SQL actually references', async () => {
    // Every intent predicate carries all five keyword sets so buckets can
    // exclude higher-priority signals, but each bucket references only some.
    // Binding the rest leaves Postgres parameters with no SQL context to
    // infer a type from, and the whole counts query fails with "could not
    // determine data type of parameter $n" — which surfaces as twelve "—"
    // chips. Every bound value must have a matching placeholder.
    const { service, getCountSql, getCountValues } = createService();
    await service.getConversations(TENANT, AGENT, {} as any);
    const sql = getCountSql();
    const values = getCountValues();
    const maxPlaceholder = Math.max(
      ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])),
    );
    expect(values.length).toBe(maxPlaceholder);
    expect(sql).not.toMatch(
      /:(payKw|complaintKw|deliveryKw|orderKw|followUpKw|openPay|deliveryStatuses)\b/,
    );
  });

  it('negates higher-priority order signals per conversation, not per row', async () => {
    // A per-row NOT passes on any non-matching joined row of the same
    // conversation, so multi-order threads leak into buckets they do not
    // resolve to. The exclusions must be NOT EXISTS subqueries.
    const { service, getCountSql } = createService();
    await service.getConversations(TENANT, AGENT, {} as any);
    expect(getCountSql()).toContain(
      'NOT EXISTS (SELECT 1 FROM orders excluded_order',
    );
  });

  it('maps returned counts onto chips by filter name, not by index', async () => {
    const { service } = createService([], {
      unread: 12,
      overdue: 3,
      resolved: 40,
    });
    const result = await service.getConversations(TENANT, AGENT, {} as any);
    expect(result.counts).not.toBeNull();
    expect(result.counts!.unread).toBe(12);
    expect(result.counts!.overdue).toBe(3);
    expect(result.counts!.resolved).toBe(40);
  });

  it('returns null counts on failure instead of zeros', async () => {
    const { service } = createService();
    // Zeros are indistinguishable from a real result. A chip showing a
    // confident `0` when the query errored is worse than one showing nothing,
    // so a failure must surface as null and get logged, not swallowed.
    (service as any).conversationRepository.query = jest
      .fn()
      .mockRejectedValue(new Error('boom'));
    const result = await service.getConversations(TENANT, AGENT, {} as any);
    expect(result.counts).toBeNull();
    // The list itself must still come back — an agent keeps their queue.
    expect(result.data).toBeDefined();
  });

  it('binds positional parameters for the raw query', async () => {
    const { service, getCountSql, getCountValues } = createService();
    await service.getConversations(TENANT, AGENT, {} as any);
    // TypeORM raw `query` rejects a named-params object with
    // "Query values must be an array". This is the exact bug that shipped
    // every chip as 0.
    const sql = getCountSql();
    // No `:name` placeholders may survive. The lookarounds skip Postgres
    // `::type` casts, which are legitimate and appear in the unread predicate
    // and the tags column.
    expect(sql).not.toMatch(/(?<!:):(?!:)\w/);
    expect(sql).toContain('$1');
    expect(Array.isArray(getCountValues())).toBe(true);
  });

  it('rewrites the QueryBuilder spread form into ANY() for raw SQL', async () => {
    const { service, getCountSql, getCountValues } = createService();
    await service.getConversations(TENANT, AGENT, {} as any);
    // `IN (:...name)` is QueryBuilder-only syntax; raw SQL needs `= ANY($n)`.
    expect(getCountSql()).not.toContain(':...');
    expect(getCountSql()).toContain('ANY($');
    const values = getCountValues();
    // Arrays are bound whole, which is what ANY() expects.
    expect(values.some((v) => Array.isArray(v))).toBe(true);
  });
});

describe('AgentService conversation classification', () => {
  const baseRow = (
    overrides: Partial<Conversation> = {},
    queue: Record<string, unknown> = {},
  ) =>
    ({
      id: 'c1',
      tenantId: TENANT,
      customerId: 'cust-1',
      subject: 'Where is my order?',
      tags: [],
      status: 'open',
      priority: 'normal',
      metadata: {},
      lastMessageAt: new Date(),
      lastCustomerMessageAt: new Date(),
      ...overrides,
      ...queue,
    }) as Conversation;

  const classify = async (row: Conversation, orders: unknown[] = []) => {
    const { service } = createService([row], {}, orders);
    const result = await service.getConversations(TENANT, AGENT, {} as any);
    return result.data[0] as Conversation & {
      intent: string;
      urgency: string;
      score: number;
      latestOrder: Record<string, unknown> | null;
    };
  };

  it('classifies payment intent and raises urgency to warning', async () => {
    const row = await classify(baseRow({ subject: 'Payment not received' }));
    expect(row.intent).toBe('payment_review');
    expect(row.urgency).toBe('warning');
  });

  it('classifies a complaint as danger', async () => {
    const row = await classify(
      baseRow({ subject: 'I want a refund, this is a complaint' }),
    );
    expect(row.intent).toBe('complaints');
    expect(row.urgency).toBe('danger');
  });

  it('treats a pending payment as payment review even without the keyword', async () => {
    // Order state arrives through orderRepository.find, not entity props:
    // addSelect aliases are dropped by getMany(), so props spread onto the row
    // never reached the classifier in production.
    const row = await classify(baseRow({ subject: 'Hello', id: 'c1' }), [
      { id: 'order-1', conversationId: 'c1', paymentStatus: 'pending' },
    ]);
    expect(row.intent).toBe('payment_review');
  });

  it('treats a linked order as order intent', async () => {
    const row = await classify(baseRow({ subject: 'Hello', id: 'c1' }), [
      { id: 'order-1', conversationId: 'c1', paymentStatus: 'paid' },
    ]);
    expect(row.intent).toBe('order_intent');
  });

  it('resolves a delivery-tracked order as delivery', async () => {
    const row = await classify(baseRow({ subject: 'Hello', id: 'c1' }), [
      {
        id: 'order-1',
        conversationId: 'c1',
        paymentStatus: 'paid',
        deliveryStatus: 'out_for_delivery',
      },
    ]);
    expect(row.intent).toBe('delivery');
  });

  it('attaches the latest message snippet and sender per row', async () => {
    // The card preview read `searchSnippet`, which the queue never set — every
    // card fell back to subject or placeholder. Sender travels with it for
    // the "You:" prefix.
    const row = baseRow({ subject: 'Hello', id: 'c1' });
    const { service } = createService(
      [row],
      {},
      [],
      [],
      [
        {
          conversationId: 'c1',
          content: 'On my way',
          senderType: 'agent',
          createdAt: new Date(),
        },
      ],
    );
    const result = await service.getConversations(TENANT, AGENT, {} as any);
    const returned = result.data[0] as unknown as Record<string, unknown>;
    expect(returned.searchSnippet).toBe('On my way');
    expect(returned.latestSenderType).toBe('agent');
  });

  it('attaches per-conversation unread counts from one aggregate', async () => {
    // The pill needs a NUMBER, not the boolean. One GROUP BY for the page —
    // a query per row would multiply round trips by the page size.
    const row = baseRow({ subject: 'Hello', id: 'c1' });
    const { service, unreadQb } = createService(
      [row],
      {},
      [],
      [{ conversationId: 'c1', unreadCount: '3' }],
    );
    const result = await service.getConversations(TENANT, AGENT, {} as any);
    expect(unreadQb.getRawMany).toHaveBeenCalledTimes(1);
    expect(
      (result.data[0] as unknown as { metadata: Record<string, unknown> })
        .metadata.inboxUnreadCount,
    ).toBe(3);
  });

  it('defaults the unread count to 0, never null', async () => {
    // A missing count must read as "none", not "unknown" — the pill hides on
    // 0 but must never render a placeholder.
    const row = baseRow({ subject: 'Hello', id: 'c1' });
    const { service } = createService([row]);
    const result = await service.getConversations(TENANT, AGENT, {} as any);
    expect(
      (result.data[0] as unknown as { metadata: Record<string, unknown> })
        .metadata.inboxUnreadCount,
    ).toBe(0);
  });

  it('attaches the newest linked order and keeps every indicator on it', async () => {
    const row = baseRow({ subject: 'Hello', id: 'c1' });
    const orders = [
      {
        id: 'order-old',
        conversationId: 'c1',
        orderNumber: 'MM-OLD',
        status: 'confirmed',
        paymentStatus: 'paid',
        deliveryStatus: 'delivered',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'order-new',
        conversationId: 'c1',
        orderNumber: 'MM-NEW',
        status: 'pending',
        paymentStatus: 'unpaid',
        deliveryStatus: 'packed',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    ];
    const { service } = createService([row], {}, orders);
    const result = await service.getConversations(TENANT, AGENT, {} as any);
    const returned = result.data[0] as unknown as {
      latestOrder: Record<string, unknown> | null;
    };
    // One row supplies all three indicators, so order, delivery and payment
    // can never describe different orders.
    expect(returned.latestOrder).toMatchObject({
      id: 'order-new',
      orderNumber: 'MM-NEW',
      status: 'pending',
      paymentStatus: 'unpaid',
      deliveryStatus: 'packed',
    });
  });

  it('returns null latestOrder when the thread has no linked order', async () => {
    const row = await classify(baseRow({ subject: 'Hello', id: 'c1' }), []);
    expect(row.latestOrder).toBeNull();
  });

  it('uses ANY-order semantics when a thread links several orders', async () => {
    // The SQL predicate matches when ANY joined order satisfies a signal. A
    // classifier judging by one arbitrary order disagrees on multi-order
    // threads: this one links a partially_paid and a failed order, and must
    // resolve payment_review whichever order a query happens to return first.
    const orders = [
      { id: 'order-1', conversationId: 'c1', paymentStatus: 'failed' },
      { id: 'order-2', conversationId: 'c1', paymentStatus: 'partially_paid' },
    ];
    const row = await classify(baseRow({ subject: 'Hello', id: 'c1' }), orders);
    expect(row.intent).toBe('payment_review');
  });

  it('raises urgency to danger when urgent even if the intent is routine', async () => {
    const row = await classify(
      baseRow({ subject: 'Hello', priority: 'urgent' }),
    );
    expect(row.urgency).toBe('danger');
  });

  it('never marks a settled conversation urgent', async () => {
    const row = await classify(
      baseRow({ subject: 'I want a refund', status: 'resolved' }),
    );
    expect(row.urgency).toBe('neutral');
  });

  it('scores payment review above a routine conversation', async () => {
    const payment = await classify(baseRow({ subject: 'payment pending' }));
    const routine = await classify(baseRow({ subject: 'Hello there' }));
    expect(payment.score).toBeGreaterThan(routine.score);
  });

  it('caps the wait-time contribution so an old row cannot dominate', async () => {
    // The cap applies to the wait term only, so compare two rows that are both
    // far past the ceiling and identical apart from age. If wait were not
    // capped, the older one would score strictly higher.
    const sixtyDays = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDays = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const sixty = await classify(
      baseRow({ subject: 'Hello', lastCustomerMessageAt: sixtyDays }),
    );
    const ninety = await classify(
      baseRow({ subject: 'Hello', lastCustomerMessageAt: ninetyDays }),
    );
    expect(ninety.score).toBe(sixty.score);
  });
});
