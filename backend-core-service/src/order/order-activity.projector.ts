import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { DomainEvent } from '../domain-event/entities/domain-event.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import {
  INTERNAL_SYSTEM_EVENT_TYPE,
  withShoppingActivityMetadata,
} from '../conversation/internal-message.util';
import { WebSocketService } from '../websocket/websocket.service';
import { ChannelAdapterService } from '../channel-adapter/channel-adapter.service';

const ORDER_EVENTS = new Set([
  'order.placed',
  'order.payment_submitted',
  'order.payment_proof_submitted',
  'order.confirmed',
  'order.rejected',
  'order.cancelled',
]);

@Injectable()
export class OrderActivityProjector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderActivityProjector.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(DomainEvent)
    private readonly eventRepository: Repository<DomainEvent>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(TenantChannel)
    private readonly channelRepository: Repository<TenantChannel>,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly websocketService: WebSocketService,
    private readonly channelAdapter: ChannelAdapterService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runScheduled(), 1000);
    this.timer.unref?.();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runScheduled() {
    try {
      return await this.runOnce();
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'order_activity_projection_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return 0;
    }
  }

  async runOnce(limit = 100) {
    let projected = 0;
    while (projected < limit) {
      const result = await this.eventRepository.manager.transaction(
        async (manager) => {
          const event = await manager
            .getRepository(DomainEvent)
            .createQueryBuilder('event')
            .where('event.processed_at IS NULL')
            .andWhere('event.event_type IN (:...types)', {
              types: [...ORDER_EVENTS],
            })
            .orderBy('event.created_at', 'ASC')
            .take(1)
            .setLock('pessimistic_write')
            .setOnLocked('skip_locked')
            .getOne();
          if (!event) return null;
          const projection = await this.project(manager, event);
          await manager
            .getRepository(DomainEvent)
            .update({ id: event.id }, { processedAt: new Date() });
          return { projection };
        },
      );
      if (!result) break;
      if (result.projection) {
        // Projection rows are committed before any workspace notification is emitted.
        this.websocketService.emitNewMessage(
          result.projection.message.tenantId,
          result.projection.conversation.id,
          result.projection.message,
        );
        this.websocketService.emitConversationUpdate(
          result.projection.message.tenantId,
          result.projection.conversation.id,
          { metadata: result.projection.conversation.metadata },
        );
        if (result.projection.customerNotification) {
          await this.channelAdapter.sendMessage(
            'telegram',
            result.projection.customerNotification,
          );
        }
      }
      projected += 1;
    }
    return projected;
  }

  private async project(manager: EntityManager, event: DomainEvent) {
    const customerId = String(event.payload?.customerId || '');
    if (!customerId) return;
    const customer = await manager
      .getRepository(Customer)
      .findOne({ where: { id: customerId, tenantId: event.tenantId } });
    if (!customer?.channelId) return;
    const channel = await manager.getRepository(TenantChannel).findOne({
      where: {
        id: customer.channelId,
        tenantId: event.tenantId,
        channelType: 'telegram',
      },
    });
    const shopping = channel?.configuration?.telegramShopping as
      | Record<string, unknown>
      | undefined;
    if (!channel || shopping?.shopEnabled !== true) return;
    const conversation = await manager.getRepository(Conversation).findOne({
      where: {
        tenantId: event.tenantId,
        customerId: customer.id,
        channelId: channel.id,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!conversation) return;
    const idempotencyKey = `order-activity:${event.id}`;
    const messageRepo = manager.getRepository(Message);
    const existing = await messageRepo
      .createQueryBuilder('message')
      .where('message.tenant_id = :tenantId', { tenantId: event.tenantId })
      .andWhere('message.conversation_id = :conversationId', {
        conversationId: conversation.id,
      })
      .andWhere("message.metadata ->> 'idempotencyKey' = :idempotencyKey", {
        idempotencyKey,
      })
      .getOne();
    if (existing) return;
    const source = String(event.source || event.payload?.source || 'system');
    const attention =
      source === 'agent' || source === 'dashboard'
        ? false
        : event.eventType === 'order.placed' ||
          event.eventType === 'order.payment_submitted' ||
          event.eventType === 'order.payment_proof_submitted';
    const stage =
      event.eventType === 'order.payment_submitted' ||
      event.eventType === 'order.payment_proof_submitted'
        ? 'payment_submitted'
        : event.eventType === 'order.confirmed'
          ? 'confirmed'
          : event.eventType === 'order.placed'
            ? 'awaiting_payment'
            : null;
    const previous = conversation.metadata || {};
    conversation.metadata = withShoppingActivityMetadata(previous, {
      shoppingStage: stage,
      shoppingStageUpdatedAt: new Date().toISOString(),
      needsAttention: attention
        ? true
        : event.eventType === 'order.confirmed' ||
            event.eventType === 'order.rejected' ||
            event.eventType === 'order.cancelled'
          ? false
          : previous.needsAttention === true,
      attentionReason: attention ? event.eventType : null,
      attentionAt: attention ? new Date().toISOString() : null,
    });
    await manager.getRepository(Conversation).save(conversation);
    const message = await messageRepo.save(
      messageRepo.create({
        conversationId: conversation.id,
        tenantId: event.tenantId,
        channelId: channel.id,
        senderType: 'system',
        senderId: undefined,
        messageType: INTERNAL_SYSTEM_EVENT_TYPE,
        content: this.summary(event),
        attachments: [],
        metadata: {
          systemEvent: true,
          eventName: `telegram.${event.eventType.replace('order.', 'order_')}`,
          eventVersion: 1,
          idempotencyKey,
          domainEventId: event.id,
          orderId: event.entityId,
          source,
        },
        provider: null,
        externalMessageId: undefined,
        status: 'sent',
        isInternal: true,
      }),
    );
    const customerNotification =
      event.eventType === 'order.rejected'
        ? {
            channelId: channel.id,
            conversationId: conversation.id,
            recipientId: customer.externalId || undefined,
            content: `Your order was rejected: ${String(event.payload?.reason || 'The payment proof was not accepted')}. If this is about your payment proof, please upload a correct proof here to try again.`,
            messageType: 'text' as const,
            metadata: {
              source: 'order_activity_projector',
              orderId: event.entityId,
              eventId: event.id,
            },
          }
        : event.eventType === 'order.cancelled' &&
            event.payload?.reason === 'expired'
          ? {
              channelId: channel.id,
              conversationId: conversation.id,
              recipientId: customer.externalId || undefined,
              content: `Order ${String(event.payload?.orderNumber || '')} expired because its payment deadline passed. You can place a new order from the shop.`,
              messageType: 'text' as const,
              metadata: {
                source: 'order_activity_projector',
                orderId: event.entityId,
                eventId: event.id,
              },
            }
          : null;
    return { conversation, message, customerNotification };
  }

  private summary(event: DomainEvent) {
    return `${event.eventType.replace('order.', 'Order ')}${event.payload?.orderNumber ? ` ${event.payload.orderNumber}` : ''}.`;
  }
}
