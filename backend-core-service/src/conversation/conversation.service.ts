import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import type { EntityManager, Repository } from 'typeorm';

import { Conversation } from './entities/conversation.entity';
import { InboundProviderEvent } from './entities/inbound-provider-event.entity';
import { Message } from './entities/message.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { Notification } from '../common/entities/notification.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { SubscriptionEntitlementService } from '../subscription-period/subscription-entitlement.service';
import {
  isPeriodScopedEnforcementEnabled,
  isShadowDualWriteEnabled,
} from '../subscription-period/subscription-entitlement-flag.util';
import { UsageLimitService } from '../usage/usage-limit.service';
import { WebSocketService } from '../websocket/websocket.service';

type NormalizedProviderMessage = {
  externalConversationId: string;
  externalMessageId: string;
  senderId: string;
  senderDisplayName?: string;
  messageType: string;
  content: string;
  attachments?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
};

type ProviderEventType =
  | 'message'
  | 'message_edit'
  | 'delivery'
  | 'read'
  | 'reaction'
  | 'conversation_update'
  | 'other';

type ProviderIngestionInput = {
  eventId?: string;
  provider: string;
  channelId: string;
  normalized: NormalizedProviderMessage;
};

type ProviderMessageStatusInput = {
  messageId?: string;
  externalMessageId?: string;
  channelId?: string;
  externalConversationId?: string;
  watermark?: number;
  provider: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  providerStatus?: string;
  providerError?: Record<string, unknown>;
  retry?: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
};

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(InboundProviderEvent)
    private inboundProviderEventRepository: Repository<InboundProviderEvent>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(TenantChannel)
    private channelRepository: Repository<TenantChannel>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(TenantUser)
    private tenantUserRepository: Repository<TenantUser>,
    private readonly entitlementResolver: SubscriptionEntitlementService,
    private readonly usageLimitService: UsageLimitService,
    @Inject(forwardRef(() => WebSocketService))
    private readonly websocketService: WebSocketService,
  ) {}

  async createConversation(
    tenantId: string,
    customerId: string,
    channelId: string,
    initialMessage?: string,
  ): Promise<Conversation> {
    // Verify customer and channel exist
    const customer = await this.customerRepository.findOne({
      where: { id: customerId, tenantId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const channel = await this.channelRepository.findOne({
      where: { id: channelId, tenantId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Create conversation
    const conversation = this.conversationRepository.create({
      tenantId,
      customerId,
      channelId,
      status: 'open',
      priority: 'normal',
      firstMessageAt: new Date(),
      lastMessageAt: new Date(),
    });

    const savedConversation =
      await this.conversationRepository.save(conversation);

    // Create initial message if provided
    if (initialMessage) {
      const message = this.messageRepository.create({
        conversationId: savedConversation.id,
        tenantId,
        senderType: 'customer',
        senderId: customerId,
        messageType: 'text',
        content: initialMessage,
      });

      await this.messageRepository.save(message);
    }

    return savedConversation;
  }

  async getConversationHistory(
    tenantId: string,
    customerId: string,
  ): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { tenantId, customerId },
      relations: ['channel', 'assignedCsr'],
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }

  async markMessagesAsRead(
    tenantId: string,
    conversationId: string,
  ): Promise<void> {
    await this.messageRepository.update(
      { conversationId, tenantId, status: 'delivered' },
      { status: 'read' },
    );
  }

  async findOne(
    conversationId: string,
    tenantId: string,
  ): Promise<Conversation | null> {
    return this.conversationRepository.findOne({
      where: { id: conversationId, tenantId },
      relations: ['customer', 'channel', 'messages'],
    });
  }

  async ingestProviderMessage(input: ProviderIngestionInput) {
    const channel = await this.channelRepository.findOne({
      where: { id: input.channelId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const now = new Date();
    const normalized = input.normalized;
    const provider = this.normalizeProvider(
      input.provider || channel.channelType,
    );
    await this.assertTenantCanReceiveProviderEvents(channel.tenantId, provider);
    const providerEventId = this.deriveProviderEventId(input, normalized);
    const eventType = this.deriveEventType(normalized);

    const result = await this.conversationRepository.manager.transaction(
      async (manager) => {
        const eventInsert = await manager
          .createQueryBuilder()
          .insert()
          .into(InboundProviderEvent)
          .values({
            provider,
            tenantId: channel.tenantId,
            channelId: channel.id,
            providerEventId,
            providerMessageId: normalized.externalMessageId || null,
            providerConversationId: normalized.externalConversationId || null,
            providerCustomerId: normalized.senderId || null,
            eventType,
            payloadHash: this.hashStablePayload({
              provider,
              channelId: channel.id,
              normalized,
            }),
            processingStatus: 'processing',
            occurredAt: this.providerOccurredAt(normalized, now),
            receivedAt: now,
            processedAt: null,
            messageId: null,
            failureCode: null,
          })
          .orIgnore()
          .execute();

        if (!eventInsert.identifiers.length) {
          const existingEvent = await manager.findOne(InboundProviderEvent, {
            where: { provider, channelId: channel.id, providerEventId },
          });
          const existingMessage = existingEvent?.messageId
            ? await manager.findOne(Message, {
                where: { id: existingEvent.messageId },
              })
            : null;
          return {
            accepted: true,
            duplicate: true,
            tenantId: channel.tenantId,
            channelId: channel.id,
            customerId: existingMessage?.senderId,
            conversationId: existingMessage?.conversationId,
            messageId: existingEvent?.messageId || existingMessage?.id,
            providerEventId,
            providerEventRecordId: existingEvent?.id,
          };
        }

        const providerEventRecord = await manager.findOneByOrFail(
          InboundProviderEvent,
          {
            provider,
            channelId: channel.id,
            providerEventId,
          },
        );

        let inboundReservation: { activePeriodId?: string | null } | undefined;
        if (isPeriodScopedEnforcementEnabled()) {
          try {
            const reservation =
              await this.usageLimitService.assertProviderMessageUsageAvailable(
                channel.tenantId,
                1,
                { manager, direction: 'inbound', now },
              );
            inboundReservation = reservation;
          } catch (error) {
            const code = this.quotaErrorCode(error);
            await manager.update(
              InboundProviderEvent,
              { id: providerEventRecord.id },
              {
                processingStatus: 'failed_terminal',
                processedAt: new Date(),
                failureCode: code,
                messageId: null,
              },
            );
            return {
              accepted: true,
              duplicate: false,
              quotaRejected: true,
              tenantId: channel.tenantId,
              channelId: channel.id,
              providerEventId,
              providerEventRecordId: providerEventRecord.id,
              rejectionCode: code,
            };
          }
        }

        const customer = await this.upsertProviderCustomer(
          manager,
          channel,
          normalized,
          provider,
          now,
        );
        const conversation = await this.upsertProviderConversation(
          manager,
          channel,
          customer,
          normalized,
          provider,
          now,
        );
        const messageInsert = await manager
          .createQueryBuilder()
          .insert()
          .into(Message)
          .values({
            conversationId: conversation.id,
            tenantId: channel.tenantId,
            channelId: channel.id,
            senderType: 'customer',
            senderId: customer.id,
            messageType: normalized.messageType || 'text',
            content: normalized.content,
            attachments: (normalized.attachments || []) as Record<
              string,
              any
            >[],
            metadata: {
              ...(normalized.metadata || {}),
              provider,
              providerEventId,
              inboundProviderEventId: providerEventRecord.id,
              externalConversationId: normalized.externalConversationId,
              externalSenderId: normalized.senderId,
            } as Record<string, any>,
            provider,
            externalMessageId: normalized.externalMessageId,
            status: 'delivered',
          })
          .orIgnore()
          .execute();

        const insertedMessageId = messageInsert.identifiers[0]?.id
          ? String(messageInsert.identifiers[0].id)
          : undefined;
        const savedMessage = insertedMessageId
          ? await manager.findOneByOrFail(Message, {
              id: insertedMessageId,
            })
          : await manager.findOneByOrFail(Message, {
              provider,
              conversationId: conversation.id,
              externalMessageId: normalized.externalMessageId,
            });

        const insertedMessage = Boolean(messageInsert.identifiers.length);

        if (insertedMessage) {
          const { periodStart, periodEnd } = this.currentMonthlyPeriod();
          if (isPeriodScopedEnforcementEnabled()) {
            await this.usageLimitService.recordProviderMessageInTransaction(
              manager,
              channel.tenantId,
              {
                channelId: channel.id,
                provider,
                direction: 'inbound',
                source: 'provider_webhook',
                sourceEventId: providerEventRecord.id,
                sourceMessageId: savedMessage.id,
                metadata: {
                  eventId: providerEventId,
                  externalMessageId: normalized.externalMessageId,
                  externalConversationId: normalized.externalConversationId,
                },
                now,
              },
              inboundReservation,
            );
          } else {
            const subscriptionPeriodId = isShadowDualWriteEnabled()
              ? await this.entitlementResolver.resolveActivePeriodId(
                  channel.tenantId,
                  { manager, now },
                )
              : null;
            await manager.insert(TenantUsageEvent, {
              tenantId: channel.tenantId,
              channelId: channel.id,
              provider,
              usageType: 'provider_message',
              direction: 'inbound',
              quantity: 1,
              source: 'provider_webhook',
              requestMethod: null,
              requestPath: null,
              billingPeriodStart: periodStart,
              billingPeriodEnd: periodEnd,
              subscriptionPeriodId,
              sourceEventId: providerEventRecord.id,
              sourceMessageId: savedMessage.id,
              metadata: {
                eventId: providerEventId,
                externalMessageId: normalized.externalMessageId,
                externalConversationId: normalized.externalConversationId,
              } as Record<string, any>,
            });
          }
        }

        await manager.update(
          InboundProviderEvent,
          { id: providerEventRecord.id },
          {
            processingStatus: insertedMessage ? 'processed' : 'duplicate',
            processedAt: new Date(),
            messageId: savedMessage.id,
          },
        );

        await manager.update(
          Conversation,
          { id: conversation.id },
          {
            status: 'open',
            lastMessageAt: now,
            lastCustomerMessageAt: now,
          },
        );

        await manager.update(
          Customer,
          { id: customer.id },
          {
            lastContactAt: now,
          },
        );

        if (
          provider === 'telegram' &&
          [
            'credentials_verified',
            'webhook_registering',
            'awaiting_first_event',
          ].includes(String(channel.connectionStatus || ''))
        ) {
          await manager.update(
            TenantChannel,
            { id: channel.id },
            {
              connectionStatus: 'ready',
              status: 'active',
              firstInboundVerifiedAt: channel.firstInboundVerifiedAt || now,
              lastInboundAt: now,
              connectedAt: channel.connectedAt || now,
              configuration: {
                ...(channel.configuration || {}),
                firstInboundVerifiedAt: (
                  channel.firstInboundVerifiedAt || now
                ).toISOString(),
                lastInboundAt: now.toISOString(),
                providerApiCheckStatus: 'ready',
                nextRecommendedAction: 'ready',
              } as Record<string, any>,
            },
          );
        } else if (provider === 'telegram') {
          await manager.update(
            TenantChannel,
            { id: channel.id },
            { lastInboundAt: now },
          );
        }

        return {
          accepted: true,
          duplicate: !insertedMessage,
          tenantId: channel.tenantId,
          channelId: channel.id,
          customerId: customer.id,
          conversationId: conversation.id,
          messageId: savedMessage.id,
          providerEventId,
          providerEventRecordId: providerEventRecord.id,
        };
      },
    );

    if (!result.duplicate && result.conversationId) {
      const [conversation, customer, savedMessage] = await Promise.all([
        this.conversationRepository.findOneBy({ id: result.conversationId }),
        result.customerId
          ? this.customerRepository.findOneBy({ id: result.customerId })
          : Promise.resolve(null),
        result.messageId
          ? this.messageRepository.findOneBy({ id: result.messageId })
          : Promise.resolve(null),
      ]);
      if (conversation && customer) {
        await this.createInboundMessageNotifications(
          channel.tenantId,
          conversation,
          customer,
          normalized.content,
        );
      }
      if (savedMessage) {
        this.websocketService.emitNewMessage(
          channel.tenantId,
          result.conversationId,
          savedMessage,
        );
        this.websocketService.emitConversationUpdate(
          channel.tenantId,
          result.conversationId,
          {
            status: conversation?.status || 'open',
            lastMessageAt: conversation?.lastMessageAt || now,
            lastCustomerMessageAt: conversation?.lastCustomerMessageAt || now,
          },
        );
      }
    }

    return result;
  }

  async updateProviderMessageStatus(input: ProviderMessageStatusInput) {
    if (
      !input.messageId &&
      !input.externalMessageId &&
      input.channelId &&
      input.externalConversationId
    ) {
      return this.updateProviderConversationMessageStatuses(input);
    }

    const message = await this.findProviderMessage(input);

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const statusApplied = this.shouldApplyProviderStatus(
      message.status,
      input.status,
    );
    if (statusApplied) {
      message.status = input.status;
    }
    if (input.externalMessageId) {
      message.externalMessageId = input.externalMessageId;
    }
    message.metadata = this.withProviderDeliveryMetadata(
      message.metadata,
      input,
      statusApplied,
    );

    const savedMessage = await this.messageRepository.save(message);
    return {
      updated: true,
      messageId: savedMessage.id,
      externalMessageId: savedMessage.externalMessageId,
      status: savedMessage.status,
      statusApplied,
    };
  }

  private async assertTenantCanReceiveProviderEvents(
    tenantId: string,
    provider: string,
  ) {
    // Operational access is enforced by the purchased-period ledger: the
    // downstream provider-message quota assertion throws the proper
    // SUBSCRIPTION_PERIOD_* errors for period-less/pending tenants. The legacy
    // tenant_entitlements row is deprecated and does not exist for tenants
    // onboarded through the period flow, so it must not gate ingestion here.
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    const plan = tenant?.subscriptionPlanId
      ? await this.tenantRepository.manager
          .getRepository(SubscriptionPlan)
          .findOne({ where: { id: tenant.subscriptionPlanId } })
      : null;
    const allowedProviders = Array.isArray(plan?.allowedProviders)
      ? plan.allowedProviders
      : [];
    if (
      allowedProviders.length > 0 &&
      !allowedProviders.map((value) => value.toLowerCase()).includes(provider)
    ) {
      throw new HttpException(
        {
          code: 'PROVIDER_NOT_ALLOWED_IN_PLAN',
          message: `Provider ${provider} is not allowed by the active subscription plan.`,
          provider,
          allowedProviders,
          activePeriodId: null,
        },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private quotaErrorCode(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null) {
        const code = (response as { code?: unknown }).code;
        if (typeof code === 'string') return code;
      }
    }
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return 'INBOUND_MESSAGE_QUOTA_EXHAUSTED';
  }

  private async createInboundMessageNotifications(
    tenantId: string,
    conversation: Conversation,
    customer: Customer,
    preview: string,
  ) {
    const recipientIds = conversation.assignedCsrId
      ? [conversation.assignedCsrId]
      : (
          await this.tenantUserRepository.find({
            where: {
              tenantId,
              status: 'active',
            },
          })
        )
          .filter((user) =>
            ['owner', 'admin', 'supervisor'].includes(user.role),
          )
          .map((user) => user.id);

    if (!recipientIds.length) return;

    const snippet = preview?.trim()
      ? preview.trim().slice(0, 140)
      : 'New customer message received.';
    const notifications = recipientIds.map((userId) =>
      this.notificationRepository.create({
        tenantId,
        userId,
        type: 'info',
        title: 'New customer message',
        message: `${customer.fullName || customer.phone || customer.email || 'Customer'}: ${snippet}`,
        actionUrl: `/workspace/inbox?conversation=${conversation.id}`,
      }),
    );
    await this.notificationRepository.save(notifications);
  }

  private async findProviderMessage(input: ProviderMessageStatusInput) {
    if (input.messageId) {
      return this.messageRepository.findOne({ where: { id: input.messageId } });
    }

    if (!input.externalMessageId) {
      return null;
    }

    if (input.channelId && input.externalConversationId) {
      const conversation = await this.conversationRepository.findOne({
        where: {
          channelId: input.channelId,
          conversationId: input.externalConversationId,
        },
      });

      if (conversation) {
        return this.messageRepository.findOne({
          where: {
            conversationId: conversation.id,
            externalMessageId: input.externalMessageId,
          },
        });
      }

      return null;
    }

    return this.messageRepository.findOne({
      where: { externalMessageId: input.externalMessageId },
    });
  }

  private async updateProviderConversationMessageStatuses(
    input: ProviderMessageStatusInput,
  ) {
    const conversation = await this.conversationRepository.findOne({
      where: {
        channelId: input.channelId,
        conversationId: input.externalConversationId,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const messages = await this.messageRepository.find({
      where: {
        conversationId: conversation.id,
        senderType: 'csr',
      },
      order: { createdAt: 'ASC' },
    });
    const watermark = input.watermark ? new Date(input.watermark) : undefined;
    const matchingMessages = messages.filter((message) => {
      if (watermark && message.createdAt && message.createdAt > watermark) {
        return false;
      }
      return this.shouldApplyProviderStatus(message.status, input.status);
    });

    for (const message of matchingMessages) {
      message.status = input.status;
      message.metadata = this.withProviderDeliveryMetadata(
        message.metadata,
        input,
        true,
      );
    }

    if (matchingMessages.length > 0) {
      await this.messageRepository.save(matchingMessages);
    }

    return {
      updated: true,
      updatedCount: matchingMessages.length,
      conversationId: conversation.id,
      status: input.status,
      watermark: input.watermark,
    };
  }

  private shouldApplyProviderStatus(
    currentStatus: string,
    nextStatus: ProviderMessageStatusInput['status'],
  ) {
    if (currentStatus === nextStatus) return true;
    if (currentStatus === 'read') return false;
    if (currentStatus === 'failed') return false;
    if (currentStatus === 'delivered' && nextStatus === 'sent') return false;
    return true;
  }

  private withProviderDeliveryMetadata(
    metadata: Record<string, unknown> | undefined,
    input: ProviderMessageStatusInput,
    statusApplied: boolean,
  ) {
    const currentMetadata: Record<string, unknown> = metadata || {};
    const currentDelivery =
      currentMetadata.providerDelivery &&
      typeof currentMetadata.providerDelivery === 'object' &&
      !Array.isArray(currentMetadata.providerDelivery)
        ? (currentMetadata.providerDelivery as Record<string, unknown>)
        : {};
    const currentHistory: unknown[] = Array.isArray(currentDelivery.history)
      ? currentDelivery.history
      : [];
    const updatedAt = new Date().toISOString();
    const event = {
      provider: input.provider,
      status: input.status,
      providerStatus: input.providerStatus,
      providerError: input.providerError,
      retry: input.retry,
      providerMetadata: input.providerMetadata,
      watermark: input.watermark,
      statusApplied,
      receivedAt: updatedAt,
    };

    return {
      ...currentMetadata,
      providerDelivery: {
        ...currentDelivery,
        provider: input.provider,
        providerStatus: input.providerStatus,
        providerError: input.providerError,
        retry: input.retry,
        providerMetadata: input.providerMetadata,
        watermark: input.watermark,
        statusApplied,
        updatedAt,
        history: [...currentHistory, event].slice(-20),
      },
    };
  }

  private async upsertProviderCustomer(
    manager: EntityManager,
    channel: TenantChannel,
    normalized: NormalizedProviderMessage,
    provider: string,
    now: Date,
  ) {
    await manager
      .createQueryBuilder()
      .insert()
      .into(Customer)
      .values({
        tenantId: channel.tenantId,
        channelId: channel.id,
        provider,
        externalId: normalized.senderId,
        fullName:
          normalized.senderDisplayName || `${provider} ${normalized.senderId}`,
        firstContactAt: now,
        lastContactAt: now,
        totalConversations: 0,
        profileData: {
          provider,
          externalSenderId: normalized.senderId,
        } as Record<string, any>,
      })
      .orIgnore()
      .execute();

    const customer = await manager.findOneByOrFail(Customer, {
      provider,
      channelId: channel.id,
      externalId: normalized.senderId,
    });
    customer.lastContactAt = now;
    const fallbackName = `${provider} ${normalized.senderId}`;
    if (
      normalized.senderDisplayName &&
      (!customer.fullName || customer.fullName === fallbackName)
    ) {
      customer.fullName = normalized.senderDisplayName;
    } else if (!customer.fullName) {
      customer.fullName = fallbackName;
    }
    customer.profileData = {
      ...(customer.profileData || {}),
      provider,
      externalSenderId: normalized.senderId,
    };
    return manager.save(Customer, customer);
  }

  private async upsertProviderConversation(
    manager: EntityManager,
    channel: TenantChannel,
    customer: Customer,
    normalized: NormalizedProviderMessage,
    provider: string,
    now: Date,
  ) {
    const insert = await manager
      .createQueryBuilder()
      .insert()
      .into(Conversation)
      .values({
        tenantId: channel.tenantId,
        customerId: customer.id,
        channelId: channel.id,
        provider,
        conversationId: normalized.externalConversationId,
        status: 'open',
        priority: 'normal',
        firstMessageAt: now,
        lastMessageAt: now,
        lastCustomerMessageAt: now,
        metadata: {
          externalConversationId: normalized.externalConversationId,
        } as Record<string, any>,
      })
      .orIgnore()
      .execute();

    const conversation = await manager.findOneByOrFail(Conversation, {
      provider,
      channelId: channel.id,
      conversationId: normalized.externalConversationId,
    });
    if (insert.identifiers.length) {
      await manager.increment(
        Customer,
        { id: customer.id },
        'totalConversations',
        1,
      );
    }
    return conversation;
  }

  private normalizeProvider(provider: string) {
    return (provider || '').trim().toLowerCase() || 'unknown';
  }

  private deriveProviderEventId(
    input: ProviderIngestionInput,
    normalized: NormalizedProviderMessage,
  ) {
    const metadata = normalized.metadata || {};
    const native =
      this.stringValue(input.eventId) ||
      this.stringValue(metadata.providerEventId) ||
      this.stringValue(metadata.eventId);
    if (native) return native;

    if (normalized.externalMessageId) {
      return `message:${normalized.externalMessageId}`;
    }

    const stable = {
      provider: input.provider,
      channelId: input.channelId,
      externalConversationId: normalized.externalConversationId,
      senderId: normalized.senderId,
      messageType: normalized.messageType,
      content: normalized.content,
    };
    return `sha256:${this.hashStablePayload(stable)}`;
  }

  private deriveEventType(
    normalized: NormalizedProviderMessage,
  ): ProviderEventType {
    const eventType = this.stringValue(normalized.metadata?.eventType);
    if (
      eventType &&
      [
        'message',
        'message_edit',
        'delivery',
        'read',
        'reaction',
        'conversation_update',
        'other',
      ].includes(eventType)
    ) {
      return eventType as ProviderEventType;
    }
    return 'message';
  }

  private providerOccurredAt(
    normalized: NormalizedProviderMessage,
    fallback: Date,
  ) {
    const metadata = normalized.metadata || {};
    const raw = metadata.providerTimestamp || metadata.occurredAt;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const timestamp = raw > 10_000_000_000 ? raw : raw * 1000;
      return new Date(timestamp);
    }
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return fallback;
  }

  private hashStablePayload(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private currentMonthlyPeriod(now = new Date()) {
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return { periodStart, periodEnd };
  }
}
