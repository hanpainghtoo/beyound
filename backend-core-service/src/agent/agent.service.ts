import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, type Repository } from 'typeorm';
import { createHash } from 'crypto';

import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import { OutboundMessageCommand } from '../conversation/entities/outbound-message-command.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { OrderNumberService } from '../order/order-number.service';
import { OrderCreationService } from '../order/order-creation.service';
import { Product } from '../product/entities/product.entity';
import { CannedResponse } from '../common/entities/canned-response.entity';
import { AgentAnalytics } from '../analytics/entities/agent-analytics.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TelegramBotApiClient } from '../channel/telegram-bot-api.client';
import { decryptProviderCredentials } from '../channel/provider-credentials.util';
import { MediaLibraryService } from '../media/media-library.service';
import { DomainEventService } from '../domain-event/domain-event.service';
import { ChannelAdapterService } from '../channel-adapter/channel-adapter.service';
import { WebSocketService } from '../websocket/websocket.service';
import {
  conversationShoppingFields,
  isInternalSystemMessage,
} from '../conversation/internal-message.util';
import {
  attachmentFileIds,
  mergeAttachmentLinks,
  normalizeAttachmentLinks,
} from '../common/attachments/attachment-link.util';
import { UsageLimitService } from '../usage/usage-limit.service';
import { isPeriodScopedEnforcementEnabled } from '../subscription-period/subscription-entitlement-flag.util';

import type { CommerceWorkspaceStatsDto } from './dto/commerce-workspace-stats.dto';
import {
  CONVERSATION_INTENTS,
  COUNTABLE_FILTERS,
  DELIVERY_ORDER_STATUSES,
  HIGH_VALUE_ORDER_THRESHOLD,
  HOT_LEAD_PRIORITIES,
  INTENT_KEYWORDS,
  MEDIA_MESSAGING_CHANNEL_TYPES,
  OPEN_PAYMENT_STATUSES,
  RESOLVED_STATUSES,
  SCORE_WEIGHTS,
  SLA_FALLBACK_MINUTES,
  URGENT_PRIORITIES,
  type ConversationIntent,
  type ConversationListResult,
  type ConversationQueueFields,
  type CountableFilter,
} from './conversation-intent';
import type { ConversationFilterDto } from './dto/conversation-filter.dto';
import {
  CONVERSATION_MESSAGES_DEFAULT_LIMIT,
  CONVERSATION_MESSAGES_MAX_LIMIT,
} from './dto/conversation-messages-query.dto';
import type { SendMessageDto } from './dto/send-message.dto';
import type { UpdateConversationDto } from './dto/update-conversation.dto';
import type { CreateOrderFromChatDto } from './dto/create-order.dto';
import type { CustomerListQueryDto } from './dto/customer-list-query.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { paginateQueryBuilder } from '../common/pagination/paginate';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import type { CreateCustomerDto } from './dto/create-customer.dto';

/** How long a resolved provider avatar stays trustworthy before a re-check. */
const AVATAR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * "This person has no picture" expires sooner than a hit — people add photos,
 * and a stale negative hides one indefinitely.
 */
const AVATAR_NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const AVATAR_FETCH_TIMEOUT_MS = 10_000;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

type ConversationSearchResult = Conversation & {
  searchSnippet?: string | null;
  /** Sender of the latest message, so the card can prefix "You:". */
  latestSenderType?: string | null;
};

/**
 * The order state one classification decision may read. A structural subset
 * of Order — the repository query selects exactly these columns, and the spec
 * builds them as plain objects.
 */
type QueueOrderState = {
  id?: string;
  conversationId?: string | null;
  orderNumber?: string;
  paymentStatus?: string;
  status?: string;
  deliveryStatus?: string;
  totalAmount?: number | string;
  deliveryAssigneeName?: string | null;
  createdAt?: Date | string;
};

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private conversationRepository: Repository<Conversation>;
  private messageRepository: Repository<Message>;
  private outboundCommandRepository: Repository<OutboundMessageCommand>;
  private customerRepository: Repository<Customer>;
  private tenantUserRepository: Repository<TenantUser>;
  private orderRepository: Repository<Order>;
  private orderItemRepository: Repository<OrderItem>;
  private productRepository: Repository<Product>;
  private cannedResponseRepository: Repository<CannedResponse>;
  private agentAnalyticsRepository: Repository<AgentAnalytics>;
  private tenantChannelRepository: Repository<TenantChannel>;
  private readonly orderNumberService: OrderNumberService;

  constructor(
    @InjectRepository(Conversation)
    conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    messageRepository: Repository<Message>,
    @InjectRepository(OutboundMessageCommand)
    outboundCommandRepository: Repository<OutboundMessageCommand>,
    @InjectRepository(Customer)
    customerRepository: Repository<Customer>,
    @InjectRepository(TenantUser)
    tenantUserRepository: Repository<TenantUser>,
    @InjectRepository(Order)
    orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    productRepository: Repository<Product>,
    @InjectRepository(CannedResponse)
    cannedResponseRepository: Repository<CannedResponse>,
    @InjectRepository(AgentAnalytics)
    agentAnalyticsRepository: Repository<AgentAnalytics>,
    @InjectRepository(TenantChannel)
    tenantChannelRepository: Repository<TenantChannel>,
    private domainEventService: DomainEventService,
    private channelAdapterService: ChannelAdapterService,
    private websocketService: WebSocketService,
    private usageLimitService: UsageLimitService,
    // Position 17 deliberately: every existing positional `new AgentService(...)`
    // call passes MediaLibraryService here, and it must sit before the @Optional
    // pair below because TypeScript forbids a required parameter after an
    // optional one.
    private mediaLibraryService: MediaLibraryService,
    @Optional() orderNumberService?: OrderNumberService,
    @Optional() private readonly orderCreationService?: OrderCreationService,
  ) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.outboundCommandRepository = outboundCommandRepository;
    this.customerRepository = customerRepository;
    this.tenantUserRepository = tenantUserRepository;
    this.orderRepository = orderRepository;
    this.orderItemRepository = orderItemRepository;
    this.productRepository = productRepository;
    this.cannedResponseRepository = cannedResponseRepository;
    this.agentAnalyticsRepository = agentAnalyticsRepository;
    this.tenantChannelRepository = tenantChannelRepository;
    this.orderNumberService = orderNumberService || new OrderNumberService();
    this.mediaLibraryService = mediaLibraryService;
  }

  async getCommerceWorkspaceStats(
    tenantId: string,
    agentId: string,
  ): Promise<CommerceWorkspaceStatsDto> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      assignedConversations,
      unreadConversations,
      todayChatsHandled,
      resolvedTodayConversations,
      todaysAnalytics,
    ] = await Promise.all([
      this.conversationRepository.count({
        where: { tenantId, assignedAgentId: agentId, status: 'open' },
      }),
      this.conversationRepository.count({
        where: { tenantId, assignedAgentId: agentId, status: 'pending' },
      }),
      this.conversationRepository.count({
        where: {
          tenantId,
          assignedAgentId: agentId,
          createdAt: MoreThanOrEqual(today),
        },
      }),
      this.conversationRepository.count({
        where: {
          tenantId,
          assignedAgentId: agentId,
          createdAt: MoreThanOrEqual(today),
          status: In(['resolved', 'closed']),
        },
      }),
      this.agentAnalyticsRepository.findOne({
        where: { tenantId, agentId, date: today },
      }),
    ]);

    const resolutionRate =
      todayChatsHandled > 0
        ? Math.round((resolvedTodayConversations / todayChatsHandled) * 100)
        : 0;

    return {
      assignedConversations,
      unreadConversations,
      todayChatsHandled,
      avgResponseTime: todaysAnalytics?.avgResponseTimeSeconds || 0,
      resolutionRate,
      customerSatisfactionAvg: todaysAnalytics?.customerSatisfactionAvg || 0,
      onlineTime: todaysAnalytics?.onlineTimeMinutes || 0,
      activeCampaigns: 0,
    };
  }

  async getAgentPerformance(
    tenantId: string,
    agentId: string,
    requestedDays: number,
  ) {
    const days = Math.min(
      90,
      Math.max(1, Number.isFinite(requestedDays) ? requestedDays : 7),
    );
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));

    const [analytics, conversationsHandled, resolvedConversations] =
      await Promise.all([
        this.agentAnalyticsRepository
          .createQueryBuilder('analytics')
          .where('analytics.tenant_id = :tenantId', { tenantId })
          .andWhere('analytics.agent_id = :agentId', { agentId })
          .andWhere('analytics.date >= :from', {
            from: from.toISOString().slice(0, 10),
          })
          .orderBy('analytics.date', 'ASC')
          .getMany(),
        this.conversationRepository.count({
          where: {
            tenantId,
            assignedAgentId: agentId,
            createdAt: MoreThanOrEqual(from),
          },
        }),
        this.conversationRepository
          .createQueryBuilder('conversation')
          .where('conversation.tenant_id = :tenantId', { tenantId })
          .andWhere('conversation.assigned_agent_id = :agentId', { agentId })
          .andWhere('conversation.created_at >= :from', { from })
          .andWhere('conversation.status IN (:...statuses)', {
            statuses: ['resolved', 'closed'],
          })
          .getCount(),
      ]);

    const totals = analytics.reduce(
      (result, row) => ({
        messagesSent: result.messagesSent + row.messagesSent,
        responseSeconds: result.responseSeconds + row.avgResponseTimeSeconds,
        resolutionSeconds:
          result.resolutionSeconds + row.avgResolutionTimeSeconds,
        satisfaction:
          result.satisfaction + Number(row.customerSatisfactionAvg || 0),
        onlineMinutes: result.onlineMinutes + row.onlineTimeMinutes,
      }),
      {
        messagesSent: 0,
        responseSeconds: 0,
        resolutionSeconds: 0,
        satisfaction: 0,
        onlineMinutes: 0,
      },
    );
    const analyticsDays = analytics.length;

    return {
      days,
      conversationsHandled,
      resolvedConversations,
      resolutionRate: conversationsHandled
        ? Math.round((resolvedConversations / conversationsHandled) * 100)
        : 0,
      messagesSent: totals.messagesSent,
      avgResponseTimeSeconds: analyticsDays
        ? Math.round(totals.responseSeconds / analyticsDays)
        : 0,
      avgResolutionTimeSeconds: analyticsDays
        ? Math.round(totals.resolutionSeconds / analyticsDays)
        : 0,
      customerSatisfactionAvg: analyticsDays
        ? Number((totals.satisfaction / analyticsDays).toFixed(2))
        : 0,
      onlineTimeMinutes: totals.onlineMinutes,
      daily: analytics.map((row) => ({
        date: row.date,
        conversationsHandled: row.conversationsHandled,
        messagesSent: row.messagesSent,
        avgResponseTimeSeconds: row.avgResponseTimeSeconds,
        customerSatisfactionAvg: Number(row.customerSatisfactionAvg || 0),
      })),
    };
  }

  async getTeamPerformance(tenantId: string, requestedDays: number) {
    const days = Math.min(
      90,
      Math.max(1, Number.isFinite(requestedDays) ? requestedDays : 7),
    );
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));

    const agents = await this.tenantUserRepository.find({
      where: { tenantId, role: In(['agent', 'supervisor']), status: 'active' },
      order: { fullName: 'ASC' },
    });

    return Promise.all(
      agents.map(async (agent) => {
        const performance = await this.getAgentPerformance(
          tenantId,
          agent.id,
          days,
        );
        return {
          agentId: agent.id,
          fullName: agent.fullName,
          role: agent.role,
          conversationsHandled: performance.conversationsHandled,
          resolutionRate: performance.resolutionRate,
          avgResponseTimeSeconds: performance.avgResponseTimeSeconds,
          customerSatisfactionAvg: performance.customerSatisfactionAvg,
        };
      }),
    );
  }

  async getConversations(
    tenantId: string,
    agentId: string,
    filterDto: ConversationFilterDto,
  ): Promise<ConversationListResult<Conversation & ConversationQueueFields>> {
    const {
      page = 1,
      limit = 100,
      search,
      sortBy,
      sortOrder,
      filter,
      status,
      priority,
      channelType,
      channelId,
      assignedAgentId,
      slaState,
      dateFrom,
      dateTo,
      resolvedOnly,
      unassigned,
      intent,
      orderStatus,
      deliveryStatus,
      paymentStatus,
    } = filterDto;
    const skip = (page - 1) * limit;
    const conversationSortColumns: Record<string, string> = {
      createdAt: 'conversation.createdAt',
      updatedAt: 'conversation.updatedAt',
      lastMessageAt: 'conversation.lastMessageAt',
      priority: 'conversation.priority',
      status: 'conversation.status',
    };

    const queryBuilder = this.conversationRepository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.customer', 'customer')
      .leftJoinAndSelect('conversation.channel', 'channel')
      .leftJoinAndSelect('conversation.assignedAgent', 'agent')
      .leftJoin(
        Message,
        'message',
        'message.conversation_id = conversation.id AND message.tenant_id = :tenantId',
        {
          tenantId,
        },
      )
      .leftJoin(
        Order,
        'workspaceOrder',
        'workspaceOrder.conversation_id = conversation.id AND workspaceOrder.tenant_id = :tenantId',
        {
          tenantId,
        },
      )
      .where('conversation.tenant_id = :tenantId', { tenantId });

    // Apply filters based on filter type
    if (filter === 'assigned') {
      queryBuilder.andWhere('conversation.assigned_agent_id = :agentId', {
        agentId,
      });
    } else if (filter === 'unread') {
      queryBuilder.andWhere(
        `(conversation.metadata ->> 'inboxForceUnread' = 'true'
          OR (
            conversation.last_customer_message_at IS NOT NULL
            AND conversation.last_customer_message_at > COALESCE(
              (conversation.metadata ->> 'inboxReadAt')::timestamptz,
              to_timestamp(0)
            )
          ))`,
      );
    } else if (filter === 'hot_leads') {
      queryBuilder.andWhere('conversation.priority IN (:...hotPriorities)', {
        hotPriorities: ['high', 'urgent'],
      });
    } else if (filter === 'vip') {
      queryBuilder.andWhere(
        'conversation.tags::text ILIKE :vipTag OR customer.tags::text ILIKE :vipTag',
        {
          vipTag: '%vip%',
        },
      );
    } else if (filter === 'overdue') {
      queryBuilder.andWhere(
        'conversation.sla_due_at IS NOT NULL AND conversation.sla_due_at < :now',
        {
          now: new Date(),
        },
      );
    } else if (filter === 'needs_attention') {
      queryBuilder.andWhere(
        "conversation.metadata ->> 'needsAttention' = 'true'",
      );
    } else if (filter === 'team') {
      // Show all conversations for the tenant
    }

    if (slaState === 'overdue') {
      queryBuilder.andWhere(
        'conversation.sla_due_at IS NOT NULL AND conversation.sla_due_at < :now',
        {
          now: new Date(),
        },
      );
    } else if (slaState === 'due_soon') {
      const dueSoon = new Date(Date.now() + 30 * 60 * 1000);
      queryBuilder.andWhere(
        'conversation.sla_due_at IS NOT NULL AND conversation.sla_due_at BETWEEN :now AND :dueSoon',
        {
          now: new Date(),
          dueSoon,
        },
      );
    } else if (slaState === 'normal') {
      queryBuilder.andWhere(
        '(conversation.sla_due_at IS NULL OR conversation.sla_due_at >= :now)',
        { now: new Date() },
      );
    }

    if (status) {
      queryBuilder.andWhere('conversation.status = :status', { status });
    }

    if (priority) {
      queryBuilder.andWhere('conversation.priority = :priority', { priority });
    }

    if (channelType) {
      queryBuilder.andWhere('channel.channel_type = :channelType', {
        channelType,
      });
    }

    // Channel scope, declared on the base PaginationDto and reused here: one
    // connected channel narrows rows AND recounts chips (see counts scope).
    if (channelId) {
      queryBuilder.andWhere('conversation.channel_id = :channelId', {
        channelId,
      });
    }

    if (assignedAgentId) {
      queryBuilder.andWhere(
        'conversation.assigned_agent_id = :assignedAgentId',
        {
          assignedAgentId,
        },
      );
    }

    if (unassigned) {
      queryBuilder.andWhere('conversation.assigned_agent_id IS NULL');
    }

    if (resolvedOnly) {
      queryBuilder.andWhere('conversation.status IN (:...resolvedStatuses)', {
        resolvedStatuses: [...RESOLVED_STATUSES],
      });
    }

    if (intent) {
      const predicate = this.buildIntentPredicate(intent);
      if (predicate) {
        queryBuilder.andWhere(predicate.sql, predicate.params);
      }
    }

    // Order facets target the conversation's newest linked order, the same row
    // the chatbot card projects (`latestOrder`). Evaluating them against ANY
    // joined order would return a thread whose older order matches and then
    // show a card whose badges contradict the filter.
    const latestOrderPredicate = this.buildLatestOrderPredicate({
      tenantId,
      orderStatus,
      deliveryStatus,
      paymentStatus,
    });
    if (latestOrderPredicate) {
      queryBuilder.andWhere(
        latestOrderPredicate.sql,
        latestOrderPredicate.params,
      );
    }

    // Activity window. Both params were already declared and validated on
    // ConversationFilterDto but never applied here, so a caller filtering by
    // date silently received the full list. Filtered on last_message_at rather
    // than created_at: the inbox queue is ordered and paged by recency of
    // activity, so that is the column a date range means to a caller.
    if (dateFrom) {
      queryBuilder.andWhere(
        'COALESCE(conversation.last_message_at, conversation.created_at) >= :dateFrom',
        {
          dateFrom: new Date(dateFrom),
        },
      );
    }

    if (dateTo) {
      queryBuilder.andWhere(
        'COALESCE(conversation.last_message_at, conversation.created_at) <= :dateTo',
        {
          dateTo: new Date(dateTo),
        },
      );
    }

    if (search) {
      queryBuilder.andWhere(
        `(customer.full_name ILIKE :search
          OR customer.email ILIKE :search
          OR customer.phone ILIKE :search
          OR customer.tags::text ILIKE :search
          OR conversation.subject ILIKE :search
          OR conversation.tags::text ILIKE :search
          OR (message.content ILIKE :search
            AND (message.is_internal = false OR message.is_internal IS NULL))
          OR workspaceOrder.order_number ILIKE :search
          OR workspaceOrder.payment_notes ILIKE :search)`,
        {
          search: `%${search}%`,
        },
      );
    }

    queryBuilder.orderBy(
      conversationSortColumns[sortBy || 'lastMessageAt'] ||
        'conversation.lastMessageAt',
      sortOrder || 'DESC',
    );
    queryBuilder.distinct(true);

    // Order fields the inbox card and intent/urgency classification need.
    // Fetched in one query for the page's conversation ids and passed to the
    // classifier explicitly. An earlier version used addSelect aliases
    // (queue_order_*) on this query builder, but TypeORM's getMany() drops raw
    // aliased selects — they never land on the entity — so the classifier ran
    // on undefined order state for the whole of Phase 5: no payment-status
    // arm, no delivery arm, no hasOrder, no failed-delivery urgency, and a
    // totalAmount of 0 that blinded high-value detection. Two cheap queries
    // with an honest handoff beat one clever query with a silent one. ALL
    // linked orders per conversation are passed (not the first): the SQL
    // predicate matches when ANY joined order satisfies a signal, so judging
    // by one arbitrary order reintroduces disagreement on multi-order threads.
    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const pageIds = data.map((conversation) => conversation.id);
    const pageOrders =
      pageIds.length > 0
        ? await this.orderRepository.find({
            where: { tenantId, conversationId: In(pageIds) },
            select: [
              'id',
              'conversationId',
              'orderNumber',
              'paymentStatus',
              'status',
              'deliveryStatus',
              'totalAmount',
              'deliveryAssigneeName',
              'createdAt',
            ],
            // Oldest first so a simple "last wins" walk yields the newest
            // order deterministically; the card must never mix statuses from
            // different orders.
            order: { createdAt: 'ASC' },
          })
        : [];
    const orderByConversationId = new Map<string, QueueOrderState[]>();
    const latestOrderByConversation = new Map<string, QueueOrderState>();
    for (const order of pageOrders) {
      if (!order.conversationId) continue;
      const list = orderByConversationId.get(order.conversationId) ?? [];
      list.push(order);
      orderByConversationId.set(order.conversationId, list);
      // Explicit latest-by-timestamp selection: the repository ordering above
      // is an optimisation, not the contract. Relying on row order would make
      // the chosen order depend on the database's plan.
      const current = latestOrderByConversation.get(order.conversationId);
      if (!current || this.isOrderNewer(order, current)) {
        latestOrderByConversation.set(order.conversationId, order);
      }
    }

    // Unread COUNTS per conversation, in one aggregate for the page. The
    // boolean `inboxUnread` compares last-customer-message against the read
    // marker; the count applies the same marker per message: customer-sent
    // messages newer than it. Agent/system messages never count — the number
    // answers "how many customer messages await a reply", which is what the
    // queue pill shows. Defaults to 0, never null: a missing count must read
    // as "none", not "unknown".
    const unreadCounts = await this.getPageUnreadCounts(tenantId, pageIds);

    // Latest message per row for the card preview, in one query for the page.
    // The queue previously never set `searchSnippet`, so every card fell back
    // to subject text or the "Open conversation" placeholder even on threads
    // with messages. Sender travels with it so the card can prefix the
    // agent's own messages with "You:". Newest-first per conversation wins.
    const latestMessages =
      pageIds.length > 0
        ? await this.messageRepository
            .createQueryBuilder('message')
            .select([
              'message.conversationId',
              'message.content',
              'message.senderType',
              'message.createdAt',
            ])
            .where('message.tenantId = :tenantId', { tenantId })
            .andWhere('message.conversationId IN (:...pageIds)', {
              pageIds,
            })
            .orderBy('message.createdAt', 'DESC')
            .getMany()
        : [];
    const latestMessageByConversation = new Map<string, Message>();
    for (const message of latestMessages) {
      if (!latestMessageByConversation.has(message.conversationId)) {
        latestMessageByConversation.set(message.conversationId, message);
      }
    }

    const classified = data.map((conversation) => {
      const latestMessage = latestMessageByConversation.get(conversation.id);
      conversation.metadata = {
        ...(conversation.metadata || {}),
        inboxUnread: this.isConversationUnread(conversation),
        inboxUnreadCount: unreadCounts.get(conversation.id) ?? 0,
      };
      Object.assign(
        conversation,
        conversationShoppingFields(conversation.metadata),
      );
      return this.classifyConversation(
        Object.assign(conversation, {
          searchSnippet: latestMessage?.content ?? null,
          latestSenderType: latestMessage?.senderType ?? null,
        }),
        orderByConversationId.get(conversation.id) ?? [],
        latestOrderByConversation.get(conversation.id),
      );
    });

    const counts = await this.getConversationFilterCounts(tenantId, agentId, {
      search,
      channelId,
      // Active order facets are a scope, like channel/search: the chips recount
      // inside them so "Open 3" still describes the rows the dropdowns allow.
      orderStatus,
      deliveryStatus,
      paymentStatus,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: classified,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      counts,
    };
  }

  /**
   * SQL predicate for one intent bucket, mirroring the order in
   * `conversation-intent.ts`. Returns null for `general`, which means "no
   * constraint" rather than "nothing matches" — an unknown intent must not
   * silently return an empty queue.
   *
   * INVARIANT: the keyword half reads subject and tags ONLY — exactly the
   * fields `classifyConversation` builds its haystack from. An earlier version
   * also matched `message.content`, which made the filter strictly broader
   * than the classifier: a thread mentioning "COD" in passing (e.g. "Seeded
   * COD delivery guide attached") was pulled into the payment_review bucket
   * while resolving to delivery on its own row. Message bodies remain
   * searchable through `search`, so nothing becomes unfindable.
   *
   * SECOND INVARIANT: each bucket excludes every signal that outranks it in
   * the classifier's priority chain (payment > complaint > delivery >
   * order_intent > follow_up). Bucket membership without the exclusions is a
   * superset of resolved intent — a thread that is both a complaint and a
   * payment case would sit behind the Complaints chip while wearing the
   * Payment review badge. With the exclusions, the chip a row is found behind
   * and the badge it wears always agree.
   */
  /**
   * Predicate over a conversation's NEWEST linked order.
   *
   * Shared by the queue list and the chip counts so the rows a dropdown returns
   * and the numbers above them cannot drift. The newest row is chosen by
   * `created_at DESC NULLS LAST, id DESC` — the same contract
   * `isOrderNewer` applies in JS — and all requested facets live in one EXISTS,
   * which forces every condition onto that single row. Two separate EXISTS
   * clauses would still target the same row, but keeping them together makes
   * the "same order" guarantee structural rather than incidental.
   */
  private buildLatestOrderPredicate(filters: {
    tenantId: string;
    orderStatus?: string;
    deliveryStatus?: string;
    paymentStatus?: string;
  }): { sql: string; params: Record<string, unknown> } | null {
    const conditions: string[] = [];
    const params: Record<string, unknown> = { tenantId: filters.tenantId };

    if (filters.orderStatus) {
      conditions.push('latestOrder.status = :latestOrderStatus');
      params.latestOrderStatus = filters.orderStatus;
    }
    if (filters.deliveryStatus) {
      conditions.push(
        'latestOrder.delivery_status = :latestOrderDeliveryStatus',
      );
      params.latestOrderDeliveryStatus = filters.deliveryStatus;
    }
    if (filters.paymentStatus) {
      conditions.push(
        'latestOrder.payment_status = :latestOrderPaymentStatus',
      );
      params.latestOrderPaymentStatus = filters.paymentStatus;
    }
    if (conditions.length === 0) return null;

    return {
      sql: `EXISTS (
        SELECT 1 FROM orders latestOrder
        WHERE latestOrder.conversation_id = conversation.id
          AND latestOrder.tenant_id = :tenantId
          AND latestOrder.id = (
            SELECT newestOrder.id FROM orders newestOrder
            WHERE newestOrder.conversation_id = conversation.id
              AND newestOrder.tenant_id = :tenantId
            ORDER BY newestOrder.created_at DESC NULLS LAST, newestOrder.id DESC
            LIMIT 1
          )
          AND ${conditions.join(' AND ')}
      )`,
      params,
    };
  }

  private buildIntentPredicate(intent: string): {
    sql: string;
    params: Record<string, unknown>;
  } | null {
    if (!CONVERSATION_INTENTS.includes(intent as ConversationIntent))
      return null;
    if (intent === 'general') return null;

    const keywordSignal = (alias: string, param: string) => `(
      ${alias}.subject ILIKE ANY(${param})
      OR ${alias}.tags::text ILIKE ANY(${param})
    )`;

    // One signal fragment per classifier arm, sharing its keyword lists and
    // order status sets from `conversation-intent.ts` so the two cannot drift.
    // Param names are per-signal (never one shared `:intentKeywords`): each
    // bucket below needs several keyword sets at once.
    const paySignal = `(${keywordSignal('conversation', ':payKw')}
      OR workspaceOrder.payment_status IN (:...openPay))`;
    const complaintSignal = keywordSignal('conversation', ':complaintKw');
    const deliverySignal = `(${keywordSignal('conversation', ':deliveryKw')}
      OR workspaceOrder.delivery_assignee_name IS NOT NULL
      OR workspaceOrder.delivery_status IN (:...deliveryStatuses))`;
    const orderSignal = `(${keywordSignal('conversation', ':orderKw')}
      OR workspaceOrder.id IS NOT NULL)`;
    const followUpSignal = keywordSignal('conversation', ':followUpKw');

    // Negations are per-CONVERSATION, not per joined row: the positive arms
    // above match when ANY joined order row satisfies them, but a NOT arm
    // evaluated per row would pass on a non-matching row of the same
    // conversation (e.g. the failed order of a thread that also links a
    // partially_paid one), reintroducing bucket/row disagreement on
    // multi-order threads. Keyword NOTs read the single conversation row, so
    // they are already per-conversation; order-state NOTs use NOT EXISTS.
    // Tenant scope rides on the conversation row itself
    // (`excluded_order.tenant_id = conversation.tenant_id`) rather than a new
    // `:tenantId` param, so the fragment needs no parameter the counts query
    // does not already bind.
    // COALESCE guards the nullable subject: NOT NULL is NULL, which would
    // silently drop the conversation from every bucket below.
    const noKeyword = (param: string) =>
      `NOT (COALESCE(conversation.subject, '') ILIKE ANY(${param}) OR COALESCE(conversation.tags::text, '') ILIKE ANY(${param}))`;
    const noOrderWith = (condition: string) =>
      `NOT EXISTS (SELECT 1 FROM orders excluded_order WHERE excluded_order.conversation_id = conversation.id AND excluded_order.tenant_id = conversation.tenant_id AND ${condition})`;
    const notPay = `(${noKeyword(':payKw')} AND ${noOrderWith('excluded_order.payment_status IN (:...openPay)')})`;
    const notComplaint = noKeyword(':complaintKw');
    const notDelivery = `(${noKeyword(':deliveryKw')} AND ${noOrderWith('(excluded_order.delivery_assignee_name IS NOT NULL OR excluded_order.delivery_status IN (:...deliveryStatuses))')})`;
    const notOrder = `(${noKeyword(':orderKw')} AND ${noOrderWith('excluded_order.id IS NOT NULL')})`;

    const params: Record<string, unknown> = {
      payKw: INTENT_KEYWORDS.payment_review.map((word) => `%${word}%`),
      complaintKw: INTENT_KEYWORDS.complaints.map((word) => `%${word}%`),
      deliveryKw: INTENT_KEYWORDS.delivery.map((word) => `%${word}%`),
      orderKw: INTENT_KEYWORDS.order_intent.map((word) => `%${word}%`),
      followUpKw: INTENT_KEYWORDS.follow_up.map((word) => `%${word}%`),
      openPay: [...OPEN_PAYMENT_STATUSES],
      deliveryStatuses: [...DELIVERY_ORDER_STATUSES],
    };

    let sql: string;
    switch (intent) {
      case 'payment_review':
        sql = paySignal;
        break;
      case 'complaints':
        sql = `(${complaintSignal} AND ${notPay})`;
        break;
      case 'delivery':
        sql = `(${deliverySignal} AND ${notPay} AND ${notComplaint})`;
        break;
      case 'order_intent':
        sql = `(${orderSignal} AND ${notPay} AND ${notComplaint} AND ${notDelivery})`;
        break;
      case 'follow_up':
        sql = `(${followUpSignal} AND ${notPay} AND ${notComplaint} AND ${notDelivery} AND ${notOrder})`;
        break;
      default:
        return null;
    }

    return { sql, params };
  }

  /**
   * Resolve intent and urgency for one row.
   *
   * Runs in JS rather than SQL because the buckets overlap: payment must beat
   * complaint, which must beat delivery. Expressing that as one SQL statement
   * per bucket and picking a winner would mean a `CASE` chain per row anyway.
   * The filter predicate above is the same logic in SQL form — the two share
   * their keyword lists and order status sets from `conversation-intent.ts`,
   * so they cannot drift.
   *
   * Takes ALL linked orders, not one: the SQL predicate matches when ANY
   * joined order row satisfies a signal, so the classifier must use the same
   * ANY semantics. Judging by a single "first" order reintroduces bucket/row
   * disagreement whenever a thread links several orders in different states.
   */
  private classifyConversation(
    conversation: Conversation,
    orders: QueueOrderState[],
    latestOrder?: QueueOrderState,
  ): Conversation & ConversationQueueFields {
    const hasOrder = orders.length > 0;
    const hasOpenPayment = orders.some(
      (order) =>
        order.paymentStatus &&
        (OPEN_PAYMENT_STATUSES as readonly string[]).includes(
          order.paymentStatus,
        ),
    );
    const hasDeliverySignal = orders.some(
      (order) =>
        Boolean(order.deliveryAssigneeName) ||
        (order.deliveryStatus &&
          (DELIVERY_ORDER_STATUSES as readonly string[]).includes(
            order.deliveryStatus,
          )),
    );
    const failedDelivery = orders.some(
      (order) =>
        order.deliveryStatus === 'failed_delivery' ||
        order.deliveryStatus === 'returned',
    );
    const maxTotalAmount = orders.reduce(
      (max, order) => Math.max(max, Number(order.totalAmount ?? 0)),
      0,
    );

    const haystack = [
      conversation.subject ?? '',
      (conversation.tags || []).join(' '),
    ]
      .join(' ')
      .toLowerCase();
    const matches = (keywords: readonly string[]) =>
      keywords.some((word) => haystack.includes(word));

    let intent: ConversationIntent;
    if (matches(INTENT_KEYWORDS.payment_review) || hasOpenPayment) {
      intent = 'payment_review';
    } else if (matches(INTENT_KEYWORDS.complaints)) {
      intent = 'complaints';
    } else if (matches(INTENT_KEYWORDS.delivery) || hasDeliverySignal) {
      intent = 'delivery';
    } else if (matches(INTENT_KEYWORDS.order_intent) || hasOrder) {
      intent = 'order_intent';
    } else if (matches(INTENT_KEYWORDS.follow_up)) {
      intent = 'follow_up';
    } else {
      intent = 'general';
    }

    const overdue = this.isConversationOverdue(conversation);
    const urgentPriority = (URGENT_PRIORITIES as readonly string[]).includes(
      conversation.priority,
    );

    const settled = (RESOLVED_STATUSES as readonly string[]).includes(
      conversation.status,
    );

    let urgency: ConversationQueueFields['urgency'];
    if (settled) {
      urgency = 'neutral';
    } else if (
      overdue ||
      urgentPriority ||
      failedDelivery ||
      intent === 'complaints'
    ) {
      urgency = 'danger';
    } else if (
      intent === 'payment_review' ||
      intent === 'delivery' ||
      hasOpenPayment
    ) {
      urgency = 'warning';
    } else {
      urgency = 'neutral';
    }

    // Relative triage weight. Order of checks does not matter here because the
    // buckets are additive — unlike the intent classification above, where the
    // first match wins and the order is a product decision.
    let score = 0;
    if (intent === 'payment_review') score += SCORE_WEIGHTS.paymentReview;
    if (intent === 'order_intent') score += SCORE_WEIGHTS.orderIntent;
    if (overdue) score += SCORE_WEIGHTS.overdue;
    if (maxTotalAmount >= HIGH_VALUE_ORDER_THRESHOLD) {
      score += SCORE_WEIGHTS.highValueOrder;
    }
    if (intent === 'complaints') score += SCORE_WEIGHTS.complaint;
    if (conversation.priority === 'urgent')
      score += SCORE_WEIGHTS.urgentPriority;
    if (conversation.priority === 'high') score += SCORE_WEIGHTS.highPriority;
    if (this.isConversationUnread(conversation)) score += SCORE_WEIGHTS.unread;
    if (!conversation.assignedAgentId) score += SCORE_WEIGHTS.unassigned;

    if (conversation.lastCustomerMessageAt) {
      const waitMinutes = Math.max(
        0,
        Math.round(
          (Date.now() -
            new Date(conversation.lastCustomerMessageAt).getTime()) /
            60000,
        ),
      );
      score += Math.min(waitMinutes, SCORE_WEIGHTS.maxWaitMinutes);
    }

    return Object.assign(conversation, {
      intent,
      urgency,
      score,
      latestOrder: this.toLatestOrder(latestOrder),
    });
  }

  /**
   * True when `candidate` was created after `current`.
   *
   * Missing timestamps sort last, and ties fall back to id so the result is
   * deterministic instead of depending on query row order.
   */
  private isOrderNewer(
    candidate: QueueOrderState,
    current: QueueOrderState,
  ): boolean {
    const candidateTime = candidate.createdAt
      ? new Date(candidate.createdAt).getTime()
      : Number.NaN;
    const currentTime = current.createdAt
      ? new Date(current.createdAt).getTime()
      : Number.NaN;
    const candidateValid = !Number.isNaN(candidateTime);
    const currentValid = !Number.isNaN(currentTime);
    if (candidateValid && currentValid && candidateTime !== currentTime) {
      return candidateTime > currentTime;
    }
    if (candidateValid !== currentValid) return candidateValid;
    return (candidate.id ?? '') > (current.id ?? '');
  }

  /**
   * Project one linked order onto the compact shape the chat head renders.
   *
   * One projection for both the queue and the single-conversation read, so the
   * card cannot show order status from one row and delivery status from
   * another. Missing columns degrade to an empty string rather than omitting
   * the row, which would make partial data look like "no order".
   */
  private toLatestOrder(
    order?: QueueOrderState,
  ): ConversationQueueFields['latestOrder'] {
    if (!order?.id) return null;
    return {
      id: order.id,
      orderNumber: order.orderNumber ?? '',
      status: order.status ?? '',
      paymentStatus: order.paymentStatus ?? '',
      deliveryStatus: order.deliveryStatus ?? '',
      createdAt: order.createdAt ?? '',
      totalAmount: order.totalAmount,
    };
  }

  private isConversationOverdue(conversation: Conversation): boolean {
    if (conversation.slaDueAt) {
      return new Date(conversation.slaDueAt).getTime() < Date.now();
    }
    // Fallback when no SLA is set. The threshold is a guess, not measured
    // policy — see SLA_FALLBACK_MINUTES in conversation-intent.ts.
    if (!conversation.lastCustomerMessageAt) return false;
    const waitMinutes = Math.max(
      0,
      Math.round(
        (Date.now() - new Date(conversation.lastCustomerMessageAt).getTime()) /
          60000,
      ),
    );
    return (
      waitMinutes >= SLA_FALLBACK_MINUTES &&
      !(RESOLVED_STATUSES as readonly string[]).includes(conversation.status)
    );
  }

  /**
   * Per-filter counts for the queue chips, in a single aggregate query.
   *
   * The frontend cannot do this itself: once filtering is server-side it only
   * ever holds the rows for the *active* filter, so it has no basis for the
   * count on any other chip. It previously counted loaded rows, which was
   * correct only while the whole backlog happened to fit in memory.
   *
   * Scoped to tenant + search but deliberately NOT to the active filter, so the
   * chips stay stable while a filter is selected. Uses FILTER aggregates rather
   * than one query per chip — twelve round trips per keystroke is not a
   * trade worth making for numbers that are always shown together.
   */
  private async getConversationFilterCounts(
    tenantId: string,
    agentId: string,
    scope: {
      search?: string;
      channelId?: string;
      orderStatus?: string;
      deliveryStatus?: string;
      paymentStatus?: string;
    },
  ): Promise<Record<CountableFilter, number> | null> {
    // Raw `repository.query` takes POSITIONAL values in an array, not a named
    // object. Passing an object throws `Query values must be an array`, and an
    // earlier version of this method swallowed that and returned zeros — which
    // surfaced as twelve plausible, entirely wrong counts with no error
    // anywhere. See toPositionalRawSql below.
    const values: unknown[] = [];
    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    const selects: string[] = [];
    for (const filter of COUNTABLE_FILTERS) {
      if (filter === 'all') {
        // `all` is the scope itself, not a predicate — no FILTER clause, since
        // returning null for it previously left the All chip reading 0 while
        // every other chip showed a real number.
        selects.push(`count(DISTINCT conversation.id) AS "all"`);
        continue;
      }
      const predicate = this.buildCountPredicate(filter, agentId);
      if (!predicate) continue;
      // Named by filter, not by index, so reordering COUNTABLE_FILTERS cannot
      // silently mislabel every count.
      //
      // DISTINCT is load-bearing, not defensive: the message join multiplies
      // rows, so a conversation with five messages would be counted five
      // times. The list query hides this behind `.distinct(true)`; a raw
      // aggregate does not.
      const clause = this.toPositionalRawSql(
        predicate.sql,
        predicate.params,
        bind,
      );
      selects.push(
        `count(DISTINCT conversation.id) FILTER (WHERE ${clause}) AS "${filter}"`,
      );
    }

    const tenantIdPlaceholder = bind(tenantId);

    let sql = `SELECT ${selects.join(', ')} FROM conversations conversation
      LEFT JOIN customers customer ON customer.id = conversation.customer_id
      LEFT JOIN messages message ON message.conversation_id = conversation.id AND message.tenant_id = ${tenantIdPlaceholder}
      LEFT JOIN orders workspaceOrder ON workspaceOrder.conversation_id = conversation.id AND workspaceOrder.tenant_id = ${tenantIdPlaceholder}
      WHERE conversation.tenant_id = ${tenantIdPlaceholder}`;

    if (scope.channelId) {
      const channelId = bind(scope.channelId);
      sql += ` AND conversation.channel_id = ${channelId}`;
    }

    if (scope.search) {
      const search = bind(`%${scope.search}%`);
      sql += ` AND (
        customer.full_name ILIKE ${search} OR customer.email ILIKE ${search}
        OR customer.phone ILIKE ${search} OR customer.tags::text ILIKE ${search}
        OR conversation.subject ILIKE ${search} OR conversation.tags::text ILIKE ${search}
        OR message.content ILIKE ${search}
        OR workspaceOrder.order_number ILIKE ${search}
        OR workspaceOrder.payment_notes ILIKE ${search})`;
    }

    // Same newest-order predicate as the list query, so a chip count can never
    // disagree with the rows the dropdowns produce.
    const orderFacet = this.buildLatestOrderPredicate({
      tenantId,
      orderStatus: scope.orderStatus,
      deliveryStatus: scope.deliveryStatus,
      paymentStatus: scope.paymentStatus,
    });
    if (orderFacet) {
      sql += ` AND ${this.toPositionalRawSql(
        orderFacet.sql,
        orderFacet.params,
        bind,
      )}`;
    }

    try {
      const rows = (await this.conversationRepository.query(
        sql,
        values,
      )) as unknown as Record<string, string | number | null>[];
      const row = rows?.[0] ?? {};
      return COUNTABLE_FILTERS.reduce(
        (acc, filter) => ({ ...acc, [filter]: Number(row[filter] ?? 0) }),
        {} as Record<CountableFilter, number>,
      );
    } catch (error) {
      // Chip counts are supplementary and must never fail the list request —
      // but returning zeros here would be a lie the UI cannot distinguish from
      // a real result. Log loudly, return null so the frontend shows "—".
      this.logger.error(
        `[agent] conversation filter counts failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  /**
   * Rewrite a QueryBuilder-style fragment into raw-SQL positional form.
   *
   * The intent predicates are written once with named parameters because the
   * list query is a QueryBuilder, where `:name` and the `:...name` spread are
   * both valid. Neither is valid in a raw query — TypeORM wants `$1` plus an
   * ordered array. This converts between the two so the predicates stay
   * written once and cannot drift between the filter and its count.
   *
   * `IN (:...name)` becomes `= ANY($n)`, the Postgres equivalent, which binds
   * the array as a single value. The `IN (...)` wrapper must be replaced too —
   * swapping only the placeholder leaves `IN (= ANY($n))`, which is a syntax
   * error. That exact bug was caught by the generated-SQL assertion in the
   * spec, not by review.
   */
  private toPositionalRawSql(
    sql: string,
    params: Record<string, unknown>,
    bind: (value: unknown) => string,
  ): string {
    let out = sql;
    for (const [key, value] of Object.entries(params)) {
      // Bind only params the fragment actually uses. A bound value with no
      // SQL occurrence gives Postgres nothing to infer its type from, and the
      // whole query fails with "could not determine data type of parameter
      // $n". This bit once the intent predicates started carrying every
      // signal's keywords (so buckets could exclude higher-priority ones)
      // while each bucket only references its own plus the ones it excludes.
      if (!new RegExp(`:\\.{0,3}${key}\\b`).test(out)) continue;
      const positional = bind(value);
      // Replace the whole `IN (:...key)` rather than just the placeholder,
      // otherwise the wrapper survives and the result is `IN (= ANY($n))`,
      // which is invalid SQL. The bare-spread form is handled too so a spread
      // written without an IN wrapper still converts.
      out = out.split(`IN (:...${key})`).join(`= ANY(${positional})`);
      out = out.split(`:...${key}`).join(`= ANY(${positional})`);
      out = out.split(`:${key}`).join(positional);
    }
    return out;
  }

  /**
   * WHERE body for one chip count. Returns null when the filter imposes no
   * constraint beyond the tenant/search scope the caller already applies.
   *
   * The intent buckets reuse `buildIntentPredicate`, so the number on a chip
   * and the rows behind it come from one definition.
   */
  private buildCountPredicate(
    filter: CountableFilter,
    agentId: string,
  ): {
    sql: string;
    params: Record<string, unknown>;
  } | null {
    if ((CONVERSATION_INTENTS as readonly string[]).includes(filter)) {
      return this.buildIntentPredicate(filter);
    }

    switch (filter) {
      case 'unread':
        // Mirrors the `filter=unread` predicate used by getConversations, so
        // the chip and the list can never disagree about what unread means.
        return {
          sql: `(conversation.metadata ->> 'inboxForceUnread' = 'true'
            OR (conversation.last_customer_message_at IS NOT NULL
              AND conversation.last_customer_message_at > COALESCE(
                (conversation.metadata ->> 'inboxReadAt')::timestamptz,
                to_timestamp(0))))`,
          params: {},
        };
      case 'unassigned':
        return { sql: 'conversation.assigned_agent_id IS NULL', params: {} };
      case 'mine':
        return {
          sql: 'conversation.assigned_agent_id = :count_agent_id',
          params: { count_agent_id: agentId },
        };
      case 'hot_leads':
        return {
          sql: 'conversation.priority IN (:...count_hot_leads)',
          params: { count_hot_leads: [...HOT_LEAD_PRIORITIES] },
        };
      case 'vip':
        return {
          sql: `(conversation.tags::text ILIKE :count_vip OR customer.tags::text ILIKE :count_vip)`,
          params: { count_vip: '%vip%' },
        };
      case 'overdue':
        return {
          sql: `conversation.sla_due_at IS NOT NULL AND conversation.sla_due_at < :count_now`,
          params: { count_now: new Date() },
        };
      case 'needs_attention':
        return {
          sql: "conversation.metadata ->> 'needsAttention' = 'true'",
          params: {},
        };
      case 'open':
      case 'pending':
      case 'resolved':
      case 'closed':
        // Exact status match. `resolved` used to mean resolved OR closed,
        // which made the two chips indistinguishable even though the domain
        // keeps them separate.
        return {
          sql: 'conversation.status = :count_status',
          params: { count_status: filter },
        };
      default:
        // Anything unknown imposes no extra constraint.
        return null;
    }
  }

  async getConversationById(
    tenantId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, tenantId },
      relations: ['customer', 'channel', 'assignedAgent'],
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const metadata = conversation.metadata || {};
    const acknowledgedOrderPlaced = metadata.attentionReason === 'order.placed';
    conversation.metadata = {
      ...(conversation.metadata || {}),
      inboxUnread: this.isConversationUnread(conversation),
      newShoppingActivity: false,
      ...(acknowledgedOrderPlaced
        ? {
            needsAttention: false,
            attentionReason: null,
            attentionAt: null,
          }
        : {}),
    };
    Object.assign(
      conversation,
      conversationShoppingFields(conversation.metadata),
    );
    // Same latest-order projection as the queue. Live sockets cold-load a
    // single conversation when it is not in the cached page, and that row must
    // carry the same order indicators instead of arriving bare.
    const latestOrder = await this.orderRepository.findOne({
      where: { tenantId, conversationId },
      order: { createdAt: 'DESC', id: 'DESC' },
      select: [
        'id',
        'conversationId',
        'orderNumber',
        'paymentStatus',
        'status',
        'deliveryStatus',
        'totalAmount',
        'createdAt',
      ],
    });
    Object.assign(conversation, {
      latestOrder: this.toLatestOrder(latestOrder ?? undefined),
    });
    if (conversation.metadata?.newShoppingActivity === false) {
      await this.conversationRepository.update(
        { id: conversationId, tenantId },
        { metadata: conversation.metadata },
      );
    }
    return conversation;
  }

  async setConversationReadState(
    tenantId: string,
    conversationId: string,
    unread: boolean,
    actorId?: string,
  ): Promise<Conversation> {
    const conversation = await this.getConversationById(
      tenantId,
      conversationId,
    );
    const conversationMetadata: Record<string, unknown> =
      conversation.metadata || {};
    conversation.metadata = {
      ...conversationMetadata,
      inboxReadAt: unread
        ? conversationMetadata.inboxReadAt || null
        : new Date().toISOString(),
      inboxForceUnread: unread,
      inboxUnread: unread,
    };
    const savedConversation =
      await this.conversationRepository.save(conversation);

    await this.domainEventService.append({
      tenantId,
      actorId,
      actorType: 'tenant_user',
      entityType: 'conversation',
      entityId: conversationId,
      eventType: unread
        ? 'conversation.marked_unread'
        : 'conversation.marked_read',
      payload: { customerId: savedConversation.customerId, unread },
    });

    return savedConversation;
  }

  private isConversationUnread(conversation: Conversation): boolean {
    if (conversation.metadata?.inboxForceUnread === true) return true;
    if (!conversation.lastCustomerMessageAt) return false;
    const metadata: Record<string, unknown> = conversation.metadata || {};
    const readAt = metadata.inboxReadAt;
    if (typeof readAt !== 'string' || !readAt) return true;
    return (
      new Date(conversation.lastCustomerMessageAt).getTime() >
      new Date(readAt).getTime()
    );
  }

  /**
   * Customer-message counts newer than each conversation's read marker.
   *
   * One GROUP BY for the whole page rather than a query per row. The marker
   * is per-conversation metadata, so it is read off the joined conversation
   * row — the same `inboxReadAt` (or epoch when never read) that
   * `isConversationUnread` compares against, keeping boolean and count in
   * agreement by construction.
   */
  private async getPageUnreadCounts(
    tenantId: string,
    conversationIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (conversationIds.length === 0) return counts;

    const rows = await this.messageRepository
      .createQueryBuilder('message')
      .select('message.conversationId', 'conversationId')
      .addSelect('COUNT(*)', 'unreadCount')
      .innerJoin(
        Conversation,
        'readMarker',
        'readMarker.id = message.conversationId AND readMarker.tenantId = :tenantId',
        { tenantId },
      )
      .where('message.tenantId = :tenantId', { tenantId })
      .andWhere('message.conversationId IN (:...conversationIds)', {
        conversationIds,
      })
      .andWhere(`message.senderType = 'customer'`)
      .andWhere(
        `message.createdAt > COALESCE((readMarker.metadata ->> 'inboxReadAt')::timestamptz, to_timestamp(0))`,
      )
      .groupBy('message.conversationId')
      .getRawMany<{ conversationId: string; unreadCount: string }>();

    for (const row of rows) {
      counts.set(row.conversationId, Number(row.unreadCount));
    }
    return counts;
  }

  async getConversationMessages(
    tenantId: string,
    conversationId: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<{ data: Message[]; hasMore: boolean; nextCursor: string | null }> {
    // Verify conversation exists and belongs to tenant
    await this.getConversationById(tenantId, conversationId);

    const limit = Math.min(
      Math.max(options.limit ?? CONVERSATION_MESSAGES_DEFAULT_LIMIT, 1),
      CONVERSATION_MESSAGES_MAX_LIMIT,
    );
    const qb = this.messageRepository
      .createQueryBuilder('message')
      .where('message.conversation_id = :conversationId', { conversationId })
      .andWhere('message.tenant_id = :tenantId', { tenantId });

    // Cursor is exclusive: `before` itself never reappears, so consecutive
    // pages cannot overlap. Newest page first, then reversed for rendering.
    if (options.before) {
      qb.andWhere('message.created_at < :before', {
        before: new Date(options.before),
      });
    }
    // createdAt ties (same-millisecond writes) break on id so the order is
    // total — without a tiebreak a row could flip pages between requests.
    qb.orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
    return {
      data: page,
      hasMore,
      nextCursor: hasMore ? (page[0]?.createdAt?.toISOString() ?? null) : null,
    };
  }

  /**
   * Resolve one message attachment to downloadable bytes or a fresh URL.
   *
   * Two stored shapes, two paths:
   * - file-storage refs (`fileId`, agent uploads): redirect to a fresh signed
   *   download URL. Persisted URLs rot (signed, expiring, localhost-bound),
   *   so they are never served directly.
   * - raw provider refs (`providerFile`, inbound Telegram): fetched
   *   server-side through the channel's bot token, which must never reach the
   *   browser. Only channels in MEDIA_MESSAGING_CHANNEL_TYPES are served.
   *   Messenger has no raw-ref path on purpose: its CDN links expire, so an
   *   attachment that never made it into file-storage is reported as gone
   *   rather than linked to a URL that will rot.
   */
  async getMessageAttachmentContent(
    tenantId: string,
    messageId: string,
    index: number,
  ): Promise<
    | { kind: 'redirect'; url: string }
    | { kind: 'bytes'; bytes: Buffer; contentType: string; fileName: string }
  > {
    const message = await this.messageRepository.findOne({
      where: { id: messageId, tenantId },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    const attachments = Array.isArray(message.attachments)
      ? (message.attachments as Record<string, unknown>[])
      : [];
    const attachment = attachments[index];
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const storedFileId =
      typeof attachment.fileId === 'string' ? attachment.fileId : null;
    if (storedFileId) {
      const download = (await this.mediaLibraryService.getDownloadUrl(
        tenantId,
        storedFileId,
      )) as {
        url?: string;
        downloadUrl?: string;
        download?: { url?: string };
      } | null;
      const url =
        download?.url ?? download?.downloadUrl ?? download?.download?.url;
      if (!url) {
        throw new NotFoundException('Attachment is no longer available');
      }
      return { kind: 'redirect', url };
    }

    const channel = message.channelId
      ? await this.tenantChannelRepository.findOne({
          where: { id: message.channelId, tenantId },
        })
      : null;
    const channelType = channel?.channelType ?? '';
    if (
      !(MEDIA_MESSAGING_CHANNEL_TYPES as readonly string[]).includes(
        channelType,
      )
    ) {
      throw new ForbiddenException(
        'Media messaging is not enabled for this channel',
      );
    }
    if (channelType !== 'telegram' || !channel) {
      throw new NotFoundException('Attachment is no longer available');
    }
    const credentials = decryptProviderCredentials(
      channel.credentials,
      process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
        process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY ||
        '',
    ) as { botToken?: string };
    if (!credentials?.botToken) {
      throw new NotFoundException('Attachment is no longer available');
    }
    const providerFile = attachment.providerFile as
      | { file_id?: string; file_size?: number }
      | Array<{ file_id?: string; file_size?: number }>
      | undefined;
    const candidates = Array.isArray(providerFile)
      ? providerFile
      : providerFile
        ? [providerFile]
        : [];
    const best = candidates
      .filter((item) => typeof item?.file_id === 'string')
      .sort((a, b) => Number(b.file_size ?? 0) - Number(a.file_size ?? 0))[0];
    if (!best?.file_id) {
      throw new NotFoundException('Attachment has no downloadable file');
    }
    const client = new TelegramBotApiClient();
    const { bytes, contentType } = await client.downloadFile(
      credentials.botToken,
      best.file_id,
    );
    const fileName =
      typeof attachment.fileName === 'string' && attachment.fileName
        ? attachment.fileName
        : `telegram-${best.file_id.slice(0, 12)}`;
    return { kind: 'bytes', bytes, contentType, fileName };
  }

  async sendMessage(
    tenantId: string,
    agentId: string,
    sendMessageDto: SendMessageDto,
  ): Promise<Message> {
    const {
      conversationId,
      messageType,
      content,
      attachments,
      metadata,
      replyToMessageId,
      cannedResponseId,
    } = sendMessageDto;
    const normalizedAttachments = normalizeAttachmentLinks(attachments, {
      defaultRole: 'message_attachment',
      source: 'agent_message',
    });

    // Verify conversation exists and belongs to tenant
    const conversation = await this.getConversationById(
      tenantId,
      conversationId,
    );
    if (
      conversation.channel?.status === 'disabled' ||
      conversation.channel?.status === 'inactive' ||
      conversation.channel?.connectionStatus === 'disabled'
    ) {
      throw new BadRequestException(
        'This channel is disabled and cannot send or receive provider traffic.',
      );
    }
    if (
      conversation.channel?.channelType === 'telegram' &&
      conversation.channel.connectionStatus !== 'ready' &&
      conversation.channel.connectionStatus !== 'connected'
    ) {
      throw new BadRequestException(
        'Telegram channel is not ready for outbound replies.',
      );
    }

    // Media sends are allowlisted per channel type (see
    // MEDIA_MESSAGING_CHANNEL_TYPES): the composer hides the button elsewhere,
    // but the API must reject regardless — client gates are bypassable.
    if (
      normalizedAttachments.length > 0 &&
      !(MEDIA_MESSAGING_CHANNEL_TYPES as readonly string[]).includes(
        conversation.channel?.channelType ?? '',
      )
    ) {
      throw new BadRequestException(
        'Media messaging is not enabled for this channel',
      );
    }

    // If using canned response, get the content
    let messageContent = content;
    let selectedCannedResponseId: string | null = null;
    if (cannedResponseId) {
      const cannedResponse = await this.cannedResponseRepository.findOne({
        where: { id: cannedResponseId, tenantId },
      });
      if (cannedResponse) {
        messageContent = cannedResponse.content;
        selectedCannedResponseId = cannedResponse.id;
      }
    }

    const messageInput = {
      conversationId,
      tenantId,
      channelId: conversation.channelId,
      senderType: 'agent',
      senderId: agentId,
      messageType: messageType || 'text',
      content: messageContent,
      attachments: normalizedAttachments,
      metadata: {
        ...(metadata || {}),
        provider: conversation.channel?.channelType || 'unknown',
      },
      provider: conversation.channel?.channelType || 'unknown',
      replyToMessageId,
      status: 'queued',
    };
    const usageInput = {
      channelId: conversation.channelId,
      provider: conversation.channel?.channelType || 'unknown',
      direction: 'outbound' as const,
      source: 'agent_message',
      metadata: {
        conversationId,
        agentId,
        messageType: messageType || 'text',
        attachmentFileIds: attachmentFileIds(normalizedAttachments),
        billingPolicy: 'accepted_outbound_command',
      },
    };

    let savedMessage: Message;
    let outboundCommand: OutboundMessageCommand;
    const createOutboundCommand = (message: Message) => {
      if (isInternalSystemMessage(message)) {
        throw new BadRequestException(
          'Internal system events cannot be sent to a provider',
        );
      }
      return this.outboundCommandRepository.create({
        commandId: `outbound:${message.id}`,
        tenantId,
        conversationId,
        messageId: message.id,
        channelId: conversation.channelId,
        provider: conversation.channel?.channelType || 'unknown',
        status: 'queued',
        attempts: 0,
        lastError: null,
        payload: {
          messageType: messageType || 'text',
          attachmentFileIds: attachmentFileIds(normalizedAttachments),
        },
        providerResult: {},
      });
    };

    if (isPeriodScopedEnforcementEnabled()) {
      const persisted = await this.messageRepository.manager.transaction(
        async (manager) => {
          const lockedChannel = await manager
            .getRepository(TenantChannel)
            .createQueryBuilder('channel')
            .where('channel.id = :channelId', {
              channelId: conversation.channelId,
            })
            .andWhere('channel.tenant_id = :tenantId', { tenantId })
            .setLock('pessimistic_write')
            .getOne();
          if (
            !lockedChannel ||
            lockedChannel.status === 'disabled' ||
            lockedChannel.status === 'inactive' ||
            lockedChannel.connectionStatus === 'disabled'
          ) {
            throw new ConflictException({
              code: 'CHANNEL_DISABLED',
              message:
                'This channel is disabled and cannot send provider traffic.',
            });
          }
          const reservation =
            await this.usageLimitService.assertProviderMessageUsageAvailable(
              tenantId,
              1,
              { manager, direction: 'outbound' },
            );
          const messageRepository = manager.getRepository(Message);
          const commandRepository = manager.getRepository(
            OutboundMessageCommand,
          );
          const created = messageRepository.create(messageInput);
          const saved = await messageRepository.save(created);
          await this.usageLimitService.recordProviderMessageInTransaction(
            manager,
            tenantId,
            { ...usageInput, sourceMessageId: saved.id },
            reservation,
          );
          const command = await commandRepository.save(
            commandRepository.create({
              ...createOutboundCommand(saved),
              commandId: `outbound:${saved.id}`,
            }),
          );
          saved.status = 'sending';
          saved.metadata = {
            ...(saved.metadata || {}),
            outboundCommand: {
              id: command.commandId,
              state: 'sending',
              attempts: 1,
            },
          };
          await messageRepository.save({
            ...saved,
            metadata: { ...(saved.metadata || {}) },
          });
          command.status = 'sending';
          command.attempts += 1;
          await commandRepository.save({
            ...command,
            payload: { ...(command.payload || {}) },
            providerResult: { ...(command.providerResult || {}) },
          });
          return { message: saved, command };
        },
      );
      savedMessage = persisted.message;
      outboundCommand = persisted.command;
    } else {
      await this.usageLimitService.assertProviderMessageUsageAvailable(
        tenantId,
        1,
        { direction: 'outbound' },
      );
      savedMessage = await this.messageRepository.save(
        this.messageRepository.create(messageInput),
      );
      await this.usageLimitService.trackProviderMessage(tenantId, {
        ...usageInput,
        sourceMessageId: savedMessage.id,
      });
      outboundCommand = await this.outboundCommandRepository.save(
        createOutboundCommand(savedMessage),
      );
      savedMessage.status = 'sending';
      savedMessage.metadata = {
        ...(savedMessage.metadata || {}),
        outboundCommand: {
          id: outboundCommand.commandId,
          state: 'sending',
          attempts: 1,
        },
      };
      await this.messageRepository.save({
        ...savedMessage,
        metadata: { ...(savedMessage.metadata || {}) },
      });
      outboundCommand.status = 'sending';
      outboundCommand.attempts += 1;
      await this.outboundCommandRepository.save({
        ...outboundCommand,
        payload: { ...(outboundCommand.payload || {}) },
        providerResult: { ...(outboundCommand.providerResult || {}) },
      });
    }
    const outboundCommandId = outboundCommand.commandId;

    const dispatchResult =
      await this.processOutboundMessageCommand(outboundCommandId);
    const deliveryResult = dispatchResult.deliveryResult;
    savedMessage = dispatchResult.message;
    if (
      conversation.channel?.channelType === 'telegram' &&
      deliveryResult.status === 'sent'
    ) {
      await this.tenantChannelRepository.update(
        { id: conversation.channelId, tenantId },
        { lastOutboundAt: new Date() },
      );
    }

    if (selectedCannedResponseId && deliveryResult.status === 'sent') {
      await this.cannedResponseRepository.increment(
        { id: selectedCannedResponseId, tenantId },
        'usageCount',
        1,
      );
    }

    const responseAt = new Date();
    if (!conversation.firstResponseAt) {
      conversation.firstResponseAt = responseAt;
    }
    conversation.lastAgentResponseAt = responseAt;
    conversation.lastMessageAt = responseAt;
    if (conversation.status === 'pending') {
      conversation.status = 'open';
    }

    await this.conversationRepository.update(conversationId, {
      firstResponseAt: conversation.firstResponseAt,
      lastAgentResponseAt: conversation.lastAgentResponseAt,
      lastMessageAt: conversation.lastMessageAt,
      status: conversation.status,
    });

    await this.domainEventService.append({
      tenantId,
      actorId: agentId,
      actorType: 'tenant_user',
      entityType: 'message',
      entityId: savedMessage.id,
      eventType:
        savedMessage.status === 'failed'
          ? 'message.failed'
          : savedMessage.status === 'delivery_unknown'
            ? 'message.delivery_unknown'
            : 'message.sent',
      payload: {
        conversationId,
        customerId: conversation.customerId,
        senderType: 'agent',
        messageType: savedMessage.messageType,
        attachmentFileIds: attachmentFileIds(normalizedAttachments),
      },
    });

    this.websocketService.emitNewMessage(
      tenantId,
      conversationId,
      savedMessage,
    );
    this.websocketService.emitConversationUpdate(tenantId, conversationId, {
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
      lastAgentResponseAt: conversation.lastAgentResponseAt,
      firstResponseAt: conversation.firstResponseAt,
    });

    return savedMessage;
  }

  /**
   * Re-dispatch a failed agent message as the SAME message, not a duplicate.
   *
   * Only terminal-failure states qualify (`failed`, `delivery_unknown`).
   * Sent/delivered/read rows are rejected: retrying those would double-send.
   * The UI gates on `providerDelivery.retry.recommended`, and this re-checks
   * server-side so a crafted call cannot resend settled traffic. Resets both
   * the command and the message to `queued`, then runs the normal dispatch.
   */
  async retryMessage(tenantId: string, messageId: string): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId, tenantId },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    if (!['failed', 'delivery_unknown'].includes(message.status)) {
      throw new BadRequestException('Only failed messages can be retried');
    }
    const command = await this.outboundCommandRepository.findOne({
      where: { messageId, tenantId },
    });
    if (!command) {
      throw new NotFoundException('Outbound command not found');
    }
    command.status = 'queued';
    command.lastError = null;
    await this.outboundCommandRepository.save(command);
    message.status = 'queued';
    await this.messageRepository.save(message);
    await this.processOutboundMessageCommand(command.commandId);
    const updated = await this.messageRepository.findOne({
      where: { id: messageId, tenantId },
    });
    if (!updated) {
      throw new NotFoundException('Message not found');
    }
    return updated;
  }

  /**
   * Attach inline bytes for file-storage refs before provider dispatch.
   *
   * Providers cannot use our world: our fileIds are not Telegram file_ids and
   * our signed URLs are localhost-bound, so sending the ref yields "wrong
   * remote file identifier". The bytes travel base64 in the dispatch payload
   * (bounded by the 10 MiB storage cap) and the provider client POSTs
   * multipart. A ref that fails to resolve is left as-is — the provider then
   * fails loudly with its own error rather than us failing silently here.
   */
  private async withAttachmentBytes(
    tenantId: string,
    attachments: Record<string, any>[],
  ): Promise<Record<string, any>[]> {
    return Promise.all(
      attachments.map(async (attachment) => {
        const fileId =
          typeof attachment?.fileId === 'string' ? attachment.fileId : null;
        if (!fileId) return attachment;
        try {
          const download = (await this.mediaLibraryService.getDownloadUrl(
            tenantId,
            fileId,
          )) as { url?: string; download?: { url?: string } } | null;
          const url =
            (download as { download?: { url?: string } })?.download?.url ??
            (download as { url?: string })?.url;
          if (!url) return attachment;
          const response = await fetch(url);
          if (!response.ok) return attachment;
          const buffer = Buffer.from(await response.arrayBuffer());
          return {
            ...attachment,
            bytesBase64: buffer.toString('base64'),
          };
        } catch (error) {
          this.logger.warn(
            `Attachment bytes unavailable for ${fileId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return attachment;
        }
      }),
    );
  }

  async processOutboundMessageCommand(commandId: string) {
    const command = await this.outboundCommandRepository.findOne({
      where: { commandId },
      relations: [
        'message',
        'conversation',
        'conversation.customer',
        'channel',
      ],
    });
    if (!command) {
      throw new NotFoundException('Outbound message command not found');
    }

    const message = command.message;
    const conversation = command.conversation;
    const channel = command.channel;
    if (!message || !conversation || !channel) {
      throw new ConflictException(
        'Outbound message command is missing persisted dispatch context',
      );
    }

    if (
      channel.status === 'disabled' ||
      channel.status === 'inactive' ||
      channel.connectionStatus === 'disabled'
    ) {
      command.status = 'blocked_channel_disabled';
      command.lastError =
        'Channel is disabled and cannot dispatch outbound provider traffic.';
      if (isPeriodScopedEnforcementEnabled()) {
        await this.usageLimitService.markProviderMessageNonBillable(
          command.tenantId,
          message.id,
        );
      }
      message.status = 'failed';
      message.metadata = {
        ...(message.metadata || {}),
        outboundCommand: {
          id: command.commandId,
          state: 'blocked_channel_disabled',
        },
      };
      await Promise.all([
        this.messageRepository.save(message),
        this.outboundCommandRepository.save(command),
      ]);
      throw new ConflictException({
        code: 'CHANNEL_DISABLED',
        message: 'This channel is disabled and cannot send provider traffic.',
      });
    }

    if (command.status === 'queued') {
      command.status = 'sending';
      command.attempts += 1;
      message.status = 'sending';
      message.metadata = {
        ...(message.metadata || {}),
        outboundCommand: {
          id: command.commandId,
          state: 'sending',
          attempts: command.attempts,
        },
      };
      await Promise.all([
        this.messageRepository.save({
          ...message,
          metadata: { ...(message.metadata || {}) },
        }),
        this.outboundCommandRepository.save({
          ...command,
          payload: { ...(command.payload || {}) },
          providerResult: { ...(command.providerResult || {}) },
        }),
      ]);
    }

    let deliveryResult: {
      status: string;
      externalMessageId?: string;
      metadata?: Record<string, any>;
    };
    try {
      deliveryResult = await this.channelAdapterService.sendMessage(
        channel.channelType,
        {
          channelId: command.channelId,
          conversationId: command.conversationId,
          recipientId: conversation.customer?.externalId,
          content: message.content,
          messageType: message.messageType || 'text',
          attachments: await this.withAttachmentBytes(
            command.tenantId,
            message.attachments || [],
          ),
          metadata: {
            ...(message.metadata || {}),
            internalMessageId: message.id,
            outboundCommandId: command.commandId,
          },
        },
      );
    } catch (error) {
      deliveryResult = {
        status: 'delivery_unknown',
        metadata: {
          error:
            error instanceof Error ? error.message : 'Provider delivery failed',
          retry: { recommended: true },
          ambiguous: true,
        },
      };
    }

    if (deliveryResult.externalMessageId) {
      message.externalMessageId = deliveryResult.externalMessageId;
    }
    message.status = deliveryResult.status;
    message.metadata = {
      ...(message.metadata || {}),
      outboundCommand: {
        id: command.commandId,
        state: deliveryResult.status,
      },
      providerDelivery: deliveryResult.metadata || {},
    };
    await this.messageRepository.save(message);

    command.status = deliveryResult.status;
    command.lastError =
      typeof deliveryResult.metadata?.error === 'string'
        ? deliveryResult.metadata.error
        : null;
    command.providerResult = {
      externalMessageId: deliveryResult.externalMessageId,
      status: deliveryResult.status,
      metadata: deliveryResult.metadata || {},
    };
    await this.outboundCommandRepository.save(command);

    return { deliveryResult, message };
  }

  async processPendingOutboundMessageCommands(limit = 25) {
    const commands = await this.outboundCommandRepository.find({
      where: { status: 'queued' },
      order: { updatedAt: 'ASC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
    const results: Array<{
      commandId: string;
      status: string;
      error?: string;
    }> = [];

    for (const command of commands) {
      try {
        const result = await this.processOutboundMessageCommand(
          command.commandId,
        );
        results.push({
          commandId: command.commandId,
          status: result.deliveryResult.status,
        });
      } catch (error) {
        results.push({
          commandId: command.commandId,
          status: 'failed',
          error:
            error instanceof Error ? error.message : 'Outbound command failed',
        });
      }
    }

    return {
      processed: results.length,
      results,
    };
  }

  async updateConversation(
    tenantId: string,
    conversationId: string,
    updateDto: UpdateConversationDto,
    actorId?: string,
    actorRole?: string,
  ): Promise<Conversation> {
    const conversation = await this.getConversationById(
      tenantId,
      conversationId,
    );

    // Plan 35 shim: accept legacy `assignedCsrId` alongside `assignedAgentId`.
    const { assignedCsrId: _legacyAssignedCsrId, ...restUpdate } = updateDto;
    updateDto = {
      ...restUpdate,
      assignedAgentId:
        updateDto.assignedAgentId ?? _legacyAssignedCsrId ?? undefined,
    };

    const previousStatus = conversation.status;
    const previousAssignedAgentId = conversation.assignedAgentId;

    Object.assign(conversation, {
      ...updateDto,
      slaDueAt: updateDto.slaDueAt
        ? new Date(updateDto.slaDueAt)
        : conversation.slaDueAt,
    });

    // If resolving conversation, set resolved time
    if (updateDto.status === 'resolved' && previousStatus !== 'resolved') {
      conversation.resolvedAt = new Date();
      // Calculate resolution time
      if (conversation.firstMessageAt) {
        const resolutionTime = Math.floor(
          (conversation.resolvedAt.getTime() -
            conversation.firstMessageAt.getTime()) /
            1000,
        );
        conversation.resolutionTimeSeconds = resolutionTime;
      }
    }

    if (updateDto.status === 'closed' && previousStatus !== 'closed') {
      conversation.closedAt = new Date();
    }

    if (
      updateDto.assignedAgentId &&
      updateDto.assignedAgentId !== previousAssignedAgentId
    ) {
      if (actorRole === 'agent' && updateDto.assignedAgentId !== actorId) {
        throw new ForbiddenException(
          'Staff agents can only assign conversations to themselves',
        );
      }
      const assignedAgent = await this.tenantUserRepository.findOne({
        where: { id: updateDto.assignedAgentId, tenantId },
      });
      if (!assignedAgent) {
        throw new NotFoundException('Agent not found');
      }
      conversation.assignedAt = new Date();
    }

    const savedConversation =
      await this.conversationRepository.save(conversation);

    if (updateDto.status && updateDto.status !== previousStatus) {
      await this.domainEventService.append({
        tenantId,
        actorId,
        actorType: 'tenant_user',
        entityType: 'conversation',
        entityId: conversationId,
        eventType: 'conversation.status_changed',
        payload: {
          customerId: savedConversation.customerId,
          previousStatus,
          status: updateDto.status,
          closeReason: updateDto.closeReason,
        },
      });
    }

    if (
      updateDto.assignedAgentId &&
      updateDto.assignedAgentId !== previousAssignedAgentId
    ) {
      await this.domainEventService.append({
        tenantId,
        actorId,
        actorType: 'tenant_user',
        entityType: 'conversation',
        entityId: conversationId,
        eventType: 'conversation.assigned',
        payload: {
          customerId: savedConversation.customerId,
          previousAssignedAgentId,
          assignedAgentId: updateDto.assignedAgentId,
        },
      });
    }

    return savedConversation;
  }

  async assignConversation(
    tenantId: string,
    conversationId: string,
    agentId: string,
    actorId?: string,
    actorRole?: string,
  ): Promise<Conversation> {
    const conversation = await this.getConversationById(
      tenantId,
      conversationId,
    );

    if (actorRole === 'agent' && agentId !== actorId) {
      throw new ForbiddenException(
        'Staff agents can only assign conversations to themselves',
      );
    }

    // Verify agent belongs to tenant
    const agent = await this.tenantUserRepository.findOne({
      where: { id: agentId, tenantId },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const previousAssignedAgentId = conversation.assignedAgentId;
    conversation.assignedAgentId = agentId;
    conversation.assignedAt = new Date();
    const savedConversation =
      await this.conversationRepository.save(conversation);

    await this.domainEventService.append({
      tenantId,
      actorId,
      actorType: 'tenant_user',
      entityType: 'conversation',
      entityId: conversationId,
      eventType: 'conversation.assigned',
      payload: {
        customerId: conversation.customerId,
        previousAssignedAgentId,
        assignedAgentId: agentId,
      },
    });

    // Tell every other agent watching this thread. Without this the assignee
    // only changed on the next unrelated refetch, so a second agent's browser
    // kept the old Assign button and stale Mine/Unassigned counts. The client
    // re-fetches by id, so the payload is informational, not load-bearing.
    this.websocketService.emitConversationUpdate(tenantId, conversationId, {
      assignedAgentId: conversation.assignedAgentId,
      assignedAt: conversation.assignedAt,
    });

    return savedConversation;
  }

  /**
   * Clear an assignment, returning the thread to the pool.
   *
   * Permission is deliberately open (all roles) per current product decision.
   * THE SEAM for a future supervisor-only rule is here: gate on `actorRole`
   * the way `assignConversation` gates cross-assignment, keeping the same
   * ForbiddenException shape. Audited like assigns so the history shows who
   * released what.
   */
  async unassignConversation(
    tenantId: string,
    conversationId: string,
    actorId?: string,
    actorRole?: string,
  ): Promise<Conversation> {
    const conversation = await this.getConversationById(
      tenantId,
      conversationId,
    );

    const previousAssignedAgentId = conversation.assignedAgentId;
    // Object.assign rather than direct assignment: the entity declares these
    // non-nullable while the columns are nullable, and widening the shared
    // entity type is a larger change than this feature owns. The `assignedAgent`
    // relation MUST be cleared too: getConversationById loads it, and on save
    // TypeORM derives the FK from a present relation object in preference to
    // the bare column — leaving it set silently re-persists the old assignee.
    Object.assign(conversation, {
      assignedAgentId: null,
      assignedAt: null,
      assignedAgent: null,
    });
    const savedConversation =
      await this.conversationRepository.save(conversation);

    await this.domainEventService.append({
      tenantId,
      actorId,
      actorType: 'tenant_user',
      entityType: 'conversation',
      entityId: conversationId,
      eventType: 'conversation.unassigned',
      payload: {
        customerId: conversation.customerId,
        previousAssignedAgentId,
        assignedAgentId: null,
        actorRole,
      },
    });

    // Tell every other agent looking at this thread. Without this the assignee
    // only refreshed on the next refetch, so other tabs kept showing a stale
    // Assign button and stale Mine/Unassigned counts. The client re-fetches by
    // id, so the payload is informational rather than load-bearing.
    this.websocketService.emitConversationUpdate(tenantId, conversationId, {
      assignedAgentId: conversation.assignedAgentId,
      assignedAt: conversation.assignedAt,
    });

    return savedConversation;
  }

  async createOrderFromChat(
    tenantId: string,
    agentId: string,
    createOrderDto: CreateOrderFromChatDto,
  ): Promise<Order> {
    const {
      conversationId,
      customerId,
      items,
      paymentStatus: requestedPaymentStatus,
      attachments,
      attachmentSourceMessageIds,
      ...orderData
    } = createOrderDto;

    // Manual orders have no conversation. Chat orders retain the stronger
    // customer/conversation ownership check and attachment linking behavior.
    const conversation = conversationId
      ? await this.getConversationById(tenantId, conversationId)
      : null;
    const customer = await this.customerRepository.findOne({
      where: { id: customerId, tenantId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    if (conversation && conversation.customerId !== customer.id) {
      throw new NotFoundException('Customer does not belong to conversation');
    }

    const linkedAt = new Date().toISOString();
    const explicitAttachments = normalizeAttachmentLinks(attachments, {
      defaultRole: 'order_attachment',
      source: 'chat_order',
      linkedAt,
    });
    const messageAttachments = conversationId
      ? await this.getConversationMessageAttachmentLinks(
          tenantId,
          conversationId,
          attachmentSourceMessageIds,
          linkedAt,
        )
      : [];
    const orderAttachments = mergeAttachmentLinks(
      explicitAttachments,
      messageAttachments,
    );

    if (this.orderCreationService) {
      const actor = await this.tenantUserRepository.findOne({
        where: { id: agentId, tenantId },
      });
      const managed = await this.orderCreationService.createManagedAgentOrder({
        tenantId,
        agentId,
        customerId,
        conversationId: conversationId || undefined,
        items,
        paymentMethod: orderData.paymentMethod,
        shippingAddress: orderData.shippingAddress,
        attachments: orderAttachments,
        permissionSet: actor?.permissions,
        reason: orderData.notes,
      });
      await this.domainEventService.append({
        tenantId,
        actorId: agentId,
        actorType: 'tenant_user',
        entityType: 'order',
        entityId: managed.id,
        eventType: 'order.created',
        payload: {
          customerId,
          conversationId,
          orderNumber: managed.orderNumber,
          status: managed.status,
          paymentStatus: managed.paymentStatus,
          totalAmount: managed.totalAmount,
          attachmentFileIds: attachmentFileIds(orderAttachments),
        },
      });
      return (
        (await this.orderRepository.findOne({
          where: { id: managed.id, tenantId },
          relations: ['customer', 'conversation'],
        })) || managed
      );
    }

    // Calculate totals
    let subtotal = 0;
    const orderItems: Partial<OrderItem>[] = [];

    for (const item of items) {
      const product = await this.productRepository.findOne({
        where: { id: item.productId, tenantId },
      });

      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      const lockedUnitPrice = Number(item.unitPrice ?? product.price ?? 0);
      const itemTotal = item.quantity * lockedUnitPrice;
      subtotal += itemTotal;

      orderItems.push({
        productId: item.productId,
        productName: product.name,
        productSku: product.sku,
        productSnapshot: {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          type: product.type,
          price: product.price,
          status: product.status,
        },
        variationSnapshot: item.variation || {},
        quantity: item.quantity,
        unitPrice: lockedUnitPrice,
        totalPrice: itemTotal,
        notes: item.notes,
      });
    }

    const totalAmount =
      subtotal +
      (orderData.taxAmount || 0) +
      (orderData.shippingFee || 0) -
      (orderData.discountAmount || 0);

    const paidAmount = Number(orderData.paidAmount || 0);
    const paymentMethod = orderData.paymentMethod || 'cod';
    const paymentStatus =
      requestedPaymentStatus ||
      (paidAmount >= totalAmount
        ? 'paid'
        : paidAmount > 0
          ? 'partially_paid'
          : paymentMethod === 'cod'
            ? 'cod_pending'
            : 'pending');

    const savedOrder = await this.orderRepository.manager.transaction(
      async (manager) => {
        const orderNumber = await this.orderNumberService.allocate(
          manager,
          tenantId,
        );
        const orderRepository = manager.getRepository(Order);
        const orderItemRepository = manager.getRepository(OrderItem);
        const order = orderRepository.create({
          tenantId,
          customerId,
          conversationId,
          orderNumber,
          status: 'new',
          subtotal,
          totalAmount,
          paidAmount,
          createdBy: agentId,
          attachments: orderAttachments,
          statusHistory: [
            {
              type: 'order_created',
              field: 'order',
              status: 'new',
              previousStatus: null,
              actorId: agentId,
              actorType: 'agent',
              actorName: null,
              actorAvatarUrl: null,
              source: conversationId ? 'chat' : 'manual',
              note: conversationId
                ? 'Order created from conversation'
                : 'Manual order created',
              products: (((orderData as any).items || [])).map((item: any) => ({
                name: item.productName || item.name,
                sku: item.productSku || item.sku,
                quantity: item.quantity,
              })),
              timestamp: new Date().toISOString(),
            },
          ],
          ...orderData,
          shippingAddress:
            typeof orderData.shippingAddress === 'string'
              ? orderData.shippingAddress
              : orderData.shippingAddress
                ? JSON.stringify(orderData.shippingAddress)
                : null,
          paymentStatus,
        });
        const saved = await orderRepository.save(order);
        for (const itemData of orderItems) {
          await orderItemRepository.save(
            orderItemRepository.create({
              orderId: saved.id,
              ...itemData,
            }),
          );
        }
        return saved;
      },
    );

    await this.domainEventService.append({
      tenantId,
      actorId: agentId,
      actorType: 'tenant_user',
      entityType: 'order',
      entityId: savedOrder.id,
      eventType: 'order.created',
      payload: {
        customerId,
        conversationId,
        orderNumber: savedOrder.orderNumber,
        status: savedOrder.status,
        paymentStatus: savedOrder.paymentStatus,
        totalAmount,
        attachmentFileIds: attachmentFileIds(orderAttachments),
      },
    });

    if (conversation) {
      await this.domainEventService.append({
        tenantId,
        actorId: agentId,
        actorType: 'tenant_user',
        entityType: 'conversation',
        entityId: conversation.id,
        eventType: 'conversation.order_created',
        payload: {
          customerId: conversation.customerId,
          orderId: savedOrder.id,
          orderNumber: savedOrder.orderNumber,
          totalAmount,
          attachmentFileIds: attachmentFileIds(orderAttachments),
        },
      });
    }

    const loadedOrder = await this.orderRepository.findOne({
      where: { id: savedOrder.id, tenantId },
      relations: ['customer', 'conversation'],
    });
    return loadedOrder || savedOrder;
  }

  async searchConversations(
    tenantId: string,
    query: string,
  ): Promise<ConversationSearchResult[]> {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery || normalizedQuery.length < 2) return [];

    const queryBuilder = this.conversationRepository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.customer', 'customer')
      .leftJoinAndSelect('conversation.channel', 'channel')
      .leftJoin(
        Message,
        'message',
        'message.conversation_id = conversation.id AND message.tenant_id = :tenantId',
        {
          tenantId,
        },
      )
      .leftJoin(
        Order,
        'workspaceOrder',
        'workspaceOrder.conversation_id = conversation.id AND workspaceOrder.tenant_id = :tenantId',
        {
          tenantId,
        },
      )
      .where('conversation.tenant_id = :tenantId', { tenantId })
      .andWhere(
        `(customer.full_name ILIKE :query
          OR customer.email ILIKE :query
          OR customer.phone ILIKE :query
          OR conversation.subject ILIKE :query
          OR conversation.tags::text ILIKE :query
          OR (message.content ILIKE :query
            AND (message.is_internal = false OR message.is_internal IS NULL))
          OR workspaceOrder.order_number ILIKE :query
          OR workspaceOrder.payment_notes ILIKE :query)`,
        { query: `%${normalizedQuery}%` },
      )
      .distinct(true);

    const conversations = await queryBuilder
      .orderBy('conversation.lastMessageAt', 'DESC')
      .limit(20)
      .getMany();
    const conversationIds = conversations.map(
      (conversation) => conversation.id,
    );
    if (conversationIds.length === 0) return [];

    const [matchingMessages, latestMessages] = await Promise.all([
      this.messageRepository
        .createQueryBuilder('message')
        .where('message.tenant_id = :tenantId', { tenantId })
        .andWhere('message.conversation_id IN (:...conversationIds)', {
          conversationIds,
        })
        .andWhere('message.content ILIKE :query', {
          query: `%${normalizedQuery}%`,
        })
        .andWhere(
          '(message.is_internal = false OR message.is_internal IS NULL)',
        )
        .orderBy('message.createdAt', 'DESC')
        .getMany(),
      this.messageRepository
        .createQueryBuilder('message')
        .where('message.tenant_id = :tenantId', { tenantId })
        .andWhere('message.conversation_id IN (:...conversationIds)', {
          conversationIds,
        })
        .orderBy('message.createdAt', 'DESC')
        .getMany(),
    ]);
    const matchingMessageByConversation = new Map<string, Message>();
    const latestMessageByConversation = new Map<string, Message>();

    matchingMessages.forEach((message) => {
      if (!matchingMessageByConversation.has(message.conversationId)) {
        matchingMessageByConversation.set(message.conversationId, message);
      }
    });
    latestMessages.forEach((message) => {
      if (!latestMessageByConversation.has(message.conversationId)) {
        latestMessageByConversation.set(message.conversationId, message);
      }
    });

    return conversations.map((conversation) => {
      const matchingMessage = matchingMessageByConversation.get(
        conversation.id,
      );
      const latestMessage = latestMessageByConversation.get(conversation.id);
      return Object.assign(conversation, {
        searchSnippet:
          matchingMessage?.content || latestMessage?.content || null,
      });
    });
  }

  async getCustomers(
    tenantId: string,
    paginationDto: CustomerListQueryDto,
  ): Promise<PaginatedResult<Customer>> {
    const {
      page = 1,
      limit = 100,
      search,
      sortBy,
      sortOrder,
      status,
    } = paginationDto;
    const customerSortColumns: Record<string, string> = {
      createdAt: 'customer.createdAt',
      updatedAt: 'customer.updatedAt',
      firstContactAt: 'customer.firstContactAt',
      lastContactAt: 'customer.lastContactAt',
      fullName: 'customer.fullName',
      status: 'customer.status',
    };

    const queryBuilder = this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.tenant_id = :tenantId', {
        tenantId,
      });

    if (search) {
      queryBuilder.andWhere(
        '(customer.full_name ILIKE :search OR customer.email ILIKE :search OR customer.phone ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status && status !== 'all') {
      queryBuilder.andWhere('customer.status = :status', { status });
    }

    return paginateQueryBuilder(queryBuilder, {
      page,
      limit,
      sortBy,
      sortOrder,
      columnMap: customerSortColumns,
      defaultSort: 'customer.lastContactAt',
      nulls: 'NULLS LAST',
    });
  }

  async getCustomerProfile(
    tenantId: string,
    customerId: string,
  ): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId, tenantId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async createCustomerProfile(
    tenantId: string,
    createData: CreateCustomerDto,
    actorId?: string,
  ): Promise<Customer> {
    // Channel is optional: walk-in / manual customers may have none.
    if (createData.channelId) {
      const channel = await this.tenantChannelRepository.findOne({
        where: { id: createData.channelId, tenantId },
      });

      if (!channel) {
        throw new NotFoundException('Channel not found');
      }
    }

    const normalizedEmail = createData.email?.trim().toLowerCase();
    const normalizedPhone = createData.phone?.trim();

    if (normalizedEmail) {
      const existingByEmail = await this.customerRepository.findOne({
        where: { tenantId, email: normalizedEmail },
      });
      if (existingByEmail) {
        throw new ConflictException(
          'A customer with this email already exists',
        );
      }
    }

    if (normalizedPhone) {
      const existingByPhone = await this.customerRepository.findOne({
        where: { tenantId, phone: normalizedPhone },
      });
      if (existingByPhone) {
        throw new ConflictException(
          'A customer with this phone number already exists',
        );
      }
    }

    const now = new Date();
    const customer = this.customerRepository.create({
      tenantId,
      channelId: createData.channelId ?? null,
      fullName: createData.fullName.trim(),
      email: normalizedEmail || undefined,
      phone: normalizedPhone || undefined,
      location: createData.location || undefined,
      tags: createData.tags || [],
      notes: createData.notes?.trim() || undefined,
      status: createData.status || 'active',
      firstContactAt: now,
      lastContactAt: now,
      totalConversations: 0,
      profileData: {
        source: 'manual_workspace_create',
      },
    } as Partial<Customer>);

    const savedCustomer = await this.customerRepository.save(customer);
    await this.domainEventService.append({
      tenantId,
      actorId,
      actorType: 'tenant_user',
      entityType: 'customer',
      entityId: savedCustomer.id,
      eventType: 'customer.created',
      payload: {
        channelId: savedCustomer.channelId,
        email: savedCustomer.email,
        phone: savedCustomer.phone,
        status: savedCustomer.status,
      },
    });

    return savedCustomer;
  }

  async updateCustomerProfile(
    tenantId: string,
    customerId: string,
    updateData: UpdateCustomerDto,
    actorId?: string,
  ): Promise<Customer> {
    const customer = await this.getCustomerProfile(tenantId, customerId);
    // `null` clears the channel; `undefined` leaves it untouched.
    if (updateData.channelId !== undefined && updateData.channelId !== null) {
      const channel = await this.tenantChannelRepository.findOne({
        where: { id: updateData.channelId, tenantId },
      });
      if (!channel) {
        throw new NotFoundException('Channel not found');
      }
    }
    const allowedFields: Array<keyof UpdateCustomerDto> = [
      'channelId',
      'fullName',
      'email',
      'phone',
      'location',
      'tags',
      'notes',
      'status',
    ];

    const previousFullName = customer.fullName;
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        Object.assign(customer, { [field]: updateData[field] });
      }
    }

    // A name an agent typed wins over the provider from now on. Only flag a
    // real change: profile forms resend the current name alongside other
    // edits, which must not freeze the provider name by accident.
    if (
      updateData.fullName !== undefined &&
      updateData.fullName !== previousFullName
    ) {
      customer.profileData = {
        ...(customer.profileData || {}),
        nameManuallyEdited: updateData.fullName.trim().length > 0,
      };
    }

    const attachmentsUpdated = updateData.attachments !== undefined;
    if (attachmentsUpdated) {
      customer.attachments = normalizeAttachmentLinks(updateData.attachments, {
        defaultRole: 'customer_attachment',
        source: 'customer_profile',
      });
    }

    const savedCustomer = await this.customerRepository.save(customer);

    if (attachmentsUpdated) {
      await this.domainEventService.append({
        tenantId,
        actorId,
        actorType: 'tenant_user',
        entityType: 'customer',
        entityId: customerId,
        eventType: 'customer.attachments_updated',
        payload: {
          attachmentFileIds: attachmentFileIds(savedCustomer.attachments),
        },
      });
    }

    return savedCustomer;
  }

  private async getConversationMessageAttachmentLinks(
    tenantId: string,
    conversationId: string,
    sourceMessageIds: string[] | undefined,
    linkedAt: string,
  ) {
    const messageIds = [
      ...new Set(
        (sourceMessageIds || [])
          .filter(
            (id): id is string => typeof id === 'string' && Boolean(id.trim()),
          )
          .map((id) => id.trim()),
      ),
    ];
    if (!messageIds.length) return [];

    const messages = await this.messageRepository.find({
      where: {
        tenantId,
        conversationId,
        id: In(messageIds),
      },
      order: { createdAt: 'ASC' },
    });

    if (messages.length !== messageIds.length) {
      throw new NotFoundException('Attachment source message not found');
    }

    return messages.flatMap((message) =>
      normalizeAttachmentLinks(
        (message.attachments || []).filter((attachment) => {
          return (
            attachment &&
            typeof attachment === 'object' &&
            (typeof attachment.fileId === 'string' ||
              typeof attachment.id === 'string')
          );
        }),
        {
          defaultRole: 'chat_attachment',
          source: 'conversation_message',
          sourceMessageId: message.id,
          linkedAt,
        },
      ),
    );
  }

  /**
   * Lazily resolve a sender's avatar from whichever provider the conversation
   * runs on and stream its bytes.
   *
   * Nothing is written to media storage: avatars are display-only and would
   * otherwise consume tenant quota. What *is* cached on Customer.profileData is
   * a cheap pointer — Telegram's `file_id`, Messenger's CDN URL — plus a fetch
   * timestamp and a token hash, so a rotated credential or an expired URL
   * forces a re-resolve instead of serving a dead image forever.
   */
  async getSenderAvatar(
    tenantId: string,
    conversationId: string,
  ): Promise<{ bytes: Buffer; contentType: string } | null> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) return null;

    const channel = await this.tenantChannelRepository.findOne({
      where: { id: conversation.channelId, tenantId },
    });
    if (!channel) return null;

    if (
      channel.channelType !== 'telegram' &&
      channel.channelType !== 'messenger'
    ) {
      return null;
    }

    const customer = await this.customerRepository.findOne({
      where: { id: conversation.customerId, tenantId },
    });
    if (!customer || !customer.externalId) return null;

    return channel.channelType === 'telegram'
      ? this.loadTelegramSenderAvatar(channel, customer)
      : this.loadMessengerSenderAvatar(channel, customer);
  }

  private async loadTelegramSenderAvatar(
    channel: TenantChannel,
    customer: Customer,
  ): Promise<{ bytes: Buffer; contentType: string } | null> {
    let botToken = '';
    try {
      const raw = decryptProviderCredentials(
        channel.credentials,
        process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
          process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY ||
          '',
      );
      botToken = String(raw.botToken || '');
    } catch {
      return null;
    }
    if (!botToken) return null;

    const tokenHash = createHash('sha256').update(botToken).digest('hex');
    const profileData = { ...(customer.profileData || {}) } as Record<
      string,
      any
    >;

    const cachedFileId =
      typeof profileData.profilePhotoFileId === 'string'
        ? profileData.profilePhotoFileId
        : null;
    const cachedAt = profileData.profilePhotoFetchedAt;
    const cachedHash = profileData.profilePhotoBotTokenHash;
    const noPhoto = profileData.noProfilePhoto === true;
    const isStale =
      !cachedAt ||
      Date.now() - new Date(cachedAt).getTime() > 7 * 24 * 60 * 60 * 1000 ||
      cachedHash !== tokenHash;

    const cachedHashMatch = cachedHash === tokenHash;
    if (!cachedHashMatch || isStale) {
      // If already known no-photo and still fresh, skip refetch.
      if (noPhoto && cachedHashMatch && !isStale) {
        // keep no-photo
      } else {
        const c = new TelegramBotApiClient();
        const remote = await c.getUserProfilePhotoFileId(
          botToken,
          customer.externalId,
        );
        if (!remote) {
          profileData.noProfilePhoto = true;
          profileData.profilePhotoFetchedAt = new Date().toISOString();
          profileData.profilePhotoBotTokenHash = tokenHash;
          delete profileData.profilePhotoFileId;
          customer.profileData = profileData;
          await this.customerRepository.save(customer);
          return null;
        }
        profileData.profilePhotoFileId = remote;
        profileData.profilePhotoFetchedAt = new Date().toISOString();
        profileData.profilePhotoBotTokenHash = tokenHash;
        profileData.noProfilePhoto = false;
        customer.profileData = profileData;
        await this.customerRepository.save(customer);
      }
    }

    const fileId = profileData.profilePhotoFileId || cachedFileId;
    if (!fileId) return null;
    const c2 = new TelegramBotApiClient();
    try {
      const downloaded = await c2.downloadFile(botToken, fileId);
      return {
        bytes: downloaded.bytes,
        contentType: downloaded.contentType,
      };
    } catch {
      return null;
    }
  }

  /**
   * Messenger profile pictures live on a signed CDN URL that expires, so the
   * cache TTL is deliberately shorter than Telegram's and the URL is only ever
   * a hint: the bytes are re-fetched through it, never handed to the browser.
   */
  private async loadMessengerSenderAvatar(
    channel: TenantChannel,
    customer: Customer,
  ): Promise<{ bytes: Buffer; contentType: string } | null> {
    const externalId = customer.externalId;
    if (!externalId) return null;

    let pageAccessToken = '';
    try {
      const raw = decryptProviderCredentials(
        channel.credentials,
        process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
          process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY ||
          '',
      );
      pageAccessToken = String(raw.pageAccessToken || '');
    } catch {
      return null;
    }
    if (!pageAccessToken) return null;

    const tokenHash = createHash('sha256')
      .update(pageAccessToken)
      .digest('hex');
    const profileData: Record<string, unknown> = {
      ...(customer.profileData || {}),
    };
    const cachedUrl =
      typeof profileData.providerAvatarUrl === 'string'
        ? profileData.providerAvatarUrl
        : null;
    const cachedAt =
      typeof profileData.providerAvatarFetchedAt === 'string'
        ? new Date(profileData.providerAvatarFetchedAt).getTime()
        : Number.NaN;
    const noAvatar = profileData.noProviderAvatar === true;
    // A "no picture" answer is not permanent — people add photos — so it
    // expires sooner than a positive hit.
    const ttlMs = noAvatar ? AVATAR_NEGATIVE_CACHE_TTL_MS : AVATAR_CACHE_TTL_MS;
    const isStale =
      !Number.isFinite(cachedAt) ||
      Date.now() - cachedAt > ttlMs ||
      profileData.providerAvatarTokenHash !== tokenHash;

    if (!isStale) {
      if (noAvatar || !cachedUrl) return null;
      return this.fetchAvatarBytes(cachedUrl);
    }

    const remote = await this.fetchMessengerProfilePic(
      externalId,
      pageAccessToken,
    );

    if (remote === undefined) {
      // Graph was unreachable or rejected the call. A cached URL may still
      // resolve, so serve it and leave the cache alone rather than recording a
      // 24h negative entry for a transient failure.
      return cachedUrl && !noAvatar ? this.fetchAvatarBytes(cachedUrl) : null;
    }

    if (remote === null) {
      profileData.noProviderAvatar = true;
      profileData.providerAvatarFetchedAt = new Date().toISOString();
      profileData.providerAvatarTokenHash = tokenHash;
      delete profileData.providerAvatarUrl;
      customer.profileData = profileData;
      await this.customerRepository.save(customer);
      return null;
    }

    profileData.noProviderAvatar = false;
    profileData.providerAvatarUrl = remote;
    profileData.providerAvatarFetchedAt = new Date().toISOString();
    profileData.providerAvatarTokenHash = tokenHash;
    customer.profileData = profileData;
    await this.customerRepository.save(customer);
    return this.fetchAvatarBytes(remote);
  }

  /**
   * `undefined` means the call itself failed (network, bad token); `null` means
   * Graph answered and this person simply has no profile picture.
   */
  private async fetchMessengerProfilePic(
    psid: string,
    pageAccessToken: string,
  ): Promise<string | null | undefined> {
    const baseUrl =
      process.env.MESSENGER_GRAPH_API_BASE_URL || 'https://graph.facebook.com';
    const version =
      process.env.META_GRAPH_API_VERSION ||
      process.env.MESSENGER_GRAPH_API_VERSION ||
      'v25.0';
    const versionPath = version.trim()
      ? `/${version.trim().replace(/^\/|\/$/g, '')}`
      : '';
    const endpoint = new URL(
      `${baseUrl.replace(/\/$/, '')}${versionPath}/${encodeURIComponent(psid)}`,
    );
    endpoint.searchParams.set('fields', 'profile_pic');

    try {
      const response = await fetch(endpoint.toString(), {
        method: 'GET',
        // Bearer keeps the page token out of URLs and access logs.
        headers: { Authorization: `Bearer ${pageAccessToken}` },
        signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as {
        profile_pic?: unknown;
        error?: unknown;
      };
      if (body.error) return undefined;
      return typeof body.profile_pic === 'string' && body.profile_pic.trim()
        ? body.profile_pic.trim()
        : null;
    } catch {
      return undefined;
    }
  }

  private async fetchAvatarBytes(
    url: string,
  ): Promise<{ bytes: Buffer; contentType: string } | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      // Rendered at 28px; anything this large is not a profile picture.
      if (!bytes.length || bytes.length > AVATAR_MAX_BYTES) return null;
      const contentType =
        (response.headers.get('content-type') || '').split(';')[0].trim() ||
        'image/jpeg';
      return { bytes, contentType };
    } catch {
      return null;
    }
  }
}
