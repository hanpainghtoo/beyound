import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, type Repository } from 'typeorm';

import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import { OutboundMessageCommand } from '../conversation/entities/outbound-message-command.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { Product } from '../product/entities/product.entity';
import { CannedResponse } from '../common/entities/canned-response.entity';
import { CsrAnalytics } from '../analytics/entities/csr-analytics.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { DomainEventService } from '../domain-event/domain-event.service';
import { ChannelAdapterService } from '../channel-adapter/channel-adapter.service';
import { WebSocketService } from '../websocket/websocket.service';
import {
  attachmentFileIds,
  mergeAttachmentLinks,
  normalizeAttachmentLinks,
} from '../common/attachments/attachment-link.util';
import { UsageLimitService } from '../usage/usage-limit.service';
import { isPeriodScopedEnforcementEnabled } from '../subscription-period/subscription-entitlement-flag.util';

import type { CommerceWorkspaceStatsDto } from './dto/commerce-workspace-stats.dto';
import type { ConversationFilterDto } from './dto/conversation-filter.dto';
import type { SendMessageDto } from './dto/send-message.dto';
import type { UpdateConversationDto } from './dto/update-conversation.dto';
import type { CreateOrderFromChatDto } from './dto/create-order.dto';
import type { PaginationDto } from '../common/dto/pagination.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import type { CreateCustomerDto } from './dto/create-customer.dto';

type ConversationSearchResult = Conversation & {
  searchSnippet?: string | null;
};

@Injectable()
export class CsrService {
  private conversationRepository: Repository<Conversation>;
  private messageRepository: Repository<Message>;
  private outboundCommandRepository: Repository<OutboundMessageCommand>;
  private customerRepository: Repository<Customer>;
  private tenantUserRepository: Repository<TenantUser>;
  private orderRepository: Repository<Order>;
  private orderItemRepository: Repository<OrderItem>;
  private productRepository: Repository<Product>;
  private cannedResponseRepository: Repository<CannedResponse>;
  private csrAnalyticsRepository: Repository<CsrAnalytics>;
  private tenantChannelRepository: Repository<TenantChannel>;

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
    @InjectRepository(CsrAnalytics)
    csrAnalyticsRepository: Repository<CsrAnalytics>,
    @InjectRepository(TenantChannel)
    tenantChannelRepository: Repository<TenantChannel>,
    private domainEventService: DomainEventService,
    private channelAdapterService: ChannelAdapterService,
    private websocketService: WebSocketService,
    private usageLimitService: UsageLimitService,
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
    this.csrAnalyticsRepository = csrAnalyticsRepository;
    this.tenantChannelRepository = tenantChannelRepository;
  }

  async getCommerceWorkspaceStats(
    tenantId: string,
    csrId: string,
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
        where: { tenantId, assignedCsrId: csrId, status: 'open' },
      }),
      this.conversationRepository.count({
        where: { tenantId, assignedCsrId: csrId, status: 'pending' },
      }),
      this.conversationRepository.count({
        where: {
          tenantId,
          assignedCsrId: csrId,
          createdAt: MoreThanOrEqual(today),
        },
      }),
      this.conversationRepository.count({
        where: {
          tenantId,
          assignedCsrId: csrId,
          createdAt: MoreThanOrEqual(today),
          status: In(['resolved', 'closed']),
        },
      }),
      this.csrAnalyticsRepository.findOne({
        where: { tenantId, csrId, date: today },
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

  async getCsrPerformance(
    tenantId: string,
    csrId: string,
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
        this.csrAnalyticsRepository
          .createQueryBuilder('analytics')
          .where('analytics.tenant_id = :tenantId', { tenantId })
          .andWhere('analytics.csr_id = :csrId', { csrId })
          .andWhere('analytics.date >= :from', {
            from: from.toISOString().slice(0, 10),
          })
          .orderBy('analytics.date', 'ASC')
          .getMany(),
        this.conversationRepository.count({
          where: {
            tenantId,
            assignedCsrId: csrId,
            createdAt: MoreThanOrEqual(from),
          },
        }),
        this.conversationRepository
          .createQueryBuilder('conversation')
          .where('conversation.tenant_id = :tenantId', { tenantId })
          .andWhere('conversation.assigned_csr_id = :csrId', { csrId })
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

    const csrs = await this.tenantUserRepository.find({
      where: { tenantId, role: In(['csr', 'supervisor']), status: 'active' },
      order: { fullName: 'ASC' },
    });

    return Promise.all(
      csrs.map(async (csr) => {
        const performance = await this.getCsrPerformance(
          tenantId,
          csr.id,
          days,
        );
        return {
          csrId: csr.id,
          fullName: csr.fullName,
          role: csr.role,
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
    csrId: string,
    filterDto: ConversationFilterDto,
  ): Promise<PaginatedResult<Conversation>> {
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
      assignedCsrId,
      slaState,
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
      .leftJoinAndSelect('conversation.assignedCsr', 'csr')
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
      queryBuilder.andWhere('conversation.assigned_csr_id = :csrId', {
        csrId,
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

    if (assignedCsrId) {
      queryBuilder.andWhere('conversation.assigned_csr_id = :assignedCsrId', {
        assignedCsrId,
      });
    }

    if (search) {
      queryBuilder.andWhere(
        `(customer.full_name ILIKE :search
          OR customer.email ILIKE :search
          OR customer.phone ILIKE :search
          OR customer.tags::text ILIKE :search
          OR conversation.subject ILIKE :search
          OR conversation.tags::text ILIKE :search
          OR message.content ILIKE :search
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

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();
    data.forEach((conversation) => {
      conversation.metadata = {
        ...(conversation.metadata || {}),
        inboxUnread: this.isConversationUnread(conversation),
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getConversationById(
    tenantId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, tenantId },
      relations: ['customer', 'channel', 'assignedCsr'],
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    conversation.metadata = {
      ...(conversation.metadata || {}),
      inboxUnread: this.isConversationUnread(conversation),
    };
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

  async getConversationMessages(
    tenantId: string,
    conversationId: string,
  ): Promise<Message[]> {
    // Verify conversation exists and belongs to tenant
    await this.getConversationById(tenantId, conversationId);

    return this.messageRepository.find({
      where: { conversationId, tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  async sendMessage(
    tenantId: string,
    csrId: string,
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
      source: 'csr_message',
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
      senderType: 'csr',
      senderId: csrId,
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
      source: 'csr_message',
      metadata: {
        conversationId,
        csrId,
        messageType: messageType || 'text',
        attachmentFileIds: attachmentFileIds(normalizedAttachments),
        billingPolicy: 'accepted_outbound_command',
      },
    };

    let savedMessage: Message;
    let outboundCommand: OutboundMessageCommand;
    const createOutboundCommand = (message: Message) =>
      this.outboundCommandRepository.create({
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
    conversation.lastCsrResponseAt = responseAt;
    conversation.lastMessageAt = responseAt;
    if (conversation.status === 'pending') {
      conversation.status = 'open';
    }

    await this.conversationRepository.update(conversationId, {
      firstResponseAt: conversation.firstResponseAt,
      lastCsrResponseAt: conversation.lastCsrResponseAt,
      lastMessageAt: conversation.lastMessageAt,
      status: conversation.status,
    });

    await this.domainEventService.append({
      tenantId,
      actorId: csrId,
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
        senderType: 'csr',
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
      lastCsrResponseAt: conversation.lastCsrResponseAt,
      firstResponseAt: conversation.firstResponseAt,
    });

    return savedMessage;
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
          attachments: message.attachments || [],
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

    const previousStatus = conversation.status;
    const previousAssignedCsrId = conversation.assignedCsrId;

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
      updateDto.assignedCsrId &&
      updateDto.assignedCsrId !== previousAssignedCsrId
    ) {
      if (actorRole === 'csr' && updateDto.assignedCsrId !== actorId) {
        throw new ForbiddenException(
          'Staff csrs can only assign conversations to themselves',
        );
      }
      const assignedCsr = await this.tenantUserRepository.findOne({
        where: { id: updateDto.assignedCsrId, tenantId },
      });
      if (!assignedCsr) {
        throw new NotFoundException('CSR not found');
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
      updateDto.assignedCsrId &&
      updateDto.assignedCsrId !== previousAssignedCsrId
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
          previousAssignedCsrId,
          assignedCsrId: updateDto.assignedCsrId,
        },
      });
    }

    return savedConversation;
  }

  async assignConversation(
    tenantId: string,
    conversationId: string,
    csrId: string,
    actorId?: string,
    actorRole?: string,
  ): Promise<Conversation> {
    const conversation = await this.getConversationById(
      tenantId,
      conversationId,
    );

    if (actorRole === 'csr' && csrId !== actorId) {
      throw new ForbiddenException(
        'Staff csrs can only assign conversations to themselves',
      );
    }

    // Verify csr belongs to tenant
    const csr = await this.tenantUserRepository.findOne({
      where: { id: csrId, tenantId },
    });

    if (!csr) {
      throw new NotFoundException('CSR not found');
    }

    const previousAssignedCsrId = conversation.assignedCsrId;
    conversation.assignedCsrId = csrId;
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
        previousAssignedCsrId,
        assignedCsrId: csrId,
      },
    });

    return savedConversation;
  }

  async createOrderFromChat(
    tenantId: string,
    csrId: string,
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

    // Keep customer-facing references short and readable. The tenant scope keeps
    // this sequence independent for each workspace.
    const orderCount = await this.orderRepository.count({
      where: { tenantId },
    });
    const orderNumber = `MM-ORD-${String(orderCount + 1001).padStart(4, '0')}`;

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

    const order = this.orderRepository.create({
      tenantId,
      customerId,
      conversationId,
      orderNumber,
      status: 'new',
      subtotal,
      totalAmount,
      paidAmount,
      balanceDue: Math.max(totalAmount - paidAmount, 0),
      codAmount:
        paymentMethod === 'cod' ? Math.max(totalAmount - paidAmount, 0) : 0,
      createdBy: csrId,
      attachments: orderAttachments,
      statusHistory: [
        {
          status: 'new',
          actorId: csrId,
          source: conversationId ? 'chat' : 'manual',
          note: conversationId
            ? 'Order created from conversation'
            : 'Manual order created',
          timestamp: new Date().toISOString(),
        },
      ],
      ...orderData,
      paymentStatus,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Create order items
    for (const itemData of orderItems) {
      const orderItem = this.orderItemRepository.create({
        orderId: savedOrder.id,
        ...itemData,
      });
      await this.orderItemRepository.save(orderItem);
    }

    await this.domainEventService.append({
      tenantId,
      actorId: csrId,
      actorType: 'tenant_user',
      entityType: 'order',
      entityId: savedOrder.id,
      eventType: 'order.created',
      payload: {
        customerId,
        conversationId,
        orderNumber,
        status: savedOrder.status,
        paymentStatus: savedOrder.paymentStatus,
        totalAmount,
        attachmentFileIds: attachmentFileIds(orderAttachments),
      },
    });

    if (conversation) {
      await this.domainEventService.append({
        tenantId,
        actorId: csrId,
        actorType: 'tenant_user',
        entityType: 'conversation',
        entityId: conversation.id,
        eventType: 'conversation.order_created',
        payload: {
          customerId: conversation.customerId,
          orderId: savedOrder.id,
          orderNumber,
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
          OR message.content ILIKE :query
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
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<Customer>> {
    const { page = 1, limit = 100, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;
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

    queryBuilder.orderBy(
      customerSortColumns[sortBy || 'lastContactAt'] ||
        'customer.lastContactAt',
      sortOrder || 'DESC',
      'NULLS LAST',
    );

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
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
    const channel = await this.tenantChannelRepository.findOne({
      where: { id: createData.channelId, tenantId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
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
      channelId: createData.channelId,
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
    const allowedFields: Array<keyof UpdateCustomerDto> = [
      'fullName',
      'email',
      'phone',
      'location',
      'tags',
      'notes',
      'status',
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        Object.assign(customer, { [field]: updateData[field] });
      }
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
}
