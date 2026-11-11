import { OrderActivityProjector } from './order-activity.projector';
import { DomainEvent } from '../domain-event/entities/domain-event.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';

describe('OrderActivityProjector customer notifications', () => {
  function projector(event: Partial<DomainEvent>) {
    const fullEvent = {
      id: 'event-1',
      tenantId: 'tenant-1',
      entityId: 'order-1',
      eventType: 'order.rejected',
      source: 'agent',
      payload: {
        customerId: 'customer-1',
        orderNumber: 'ORD-1',
        reason: 'proof is wrong',
      },
      ...event,
    } as DomainEvent;
    const eventQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValueOnce(fullEvent)
        .mockResolvedValueOnce(null),
    };
    const customer = {
      id: 'customer-1',
      tenantId: 'tenant-1',
      channelId: 'channel-1',
      externalId: 'telegram-1',
      botBlockedAt: null,
    };
    const channel = {
      id: 'channel-1',
      tenantId: 'tenant-1',
      channelType: 'telegram',
      configuration: { telegramShopping: { shopEnabled: true } },
    };
    const conversation = {
      id: 'conversation-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      channelId: 'channel-1',
      metadata: {},
    };
    const message = {
      id: 'message-1',
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
    };
    const manager: any = {
      getRepository: jest.fn((entity) => {
        if (entity === DomainEvent)
          return {
            createQueryBuilder: jest.fn().mockReturnValue(eventQuery),
            update: jest.fn(),
          };
        if (entity === Customer)
          return { findOne: jest.fn().mockResolvedValue(customer) };
        if (entity === TenantChannel)
          return { findOne: jest.fn().mockResolvedValue(channel) };
        if (entity === Conversation)
          return {
            findOne: jest.fn().mockResolvedValue(conversation),
            save: jest.fn().mockResolvedValue(conversation),
          };
        if (entity === Message)
          return {
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(null),
            }),
            create: jest.fn().mockReturnValue(message),
            save: jest.fn().mockResolvedValue(message),
          };
        return {};
      }),
    };
    const eventRepository: any = {
      manager: { transaction: jest.fn((callback: any) => callback(manager)) },
    };
    const channelAdapter = {
      sendMessage: jest.fn().mockResolvedValue({ status: 'sent' }),
    };
    const instance = new OrderActivityProjector(
      eventRepository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { emitNewMessage: jest.fn(), emitConversationUpdate: jest.fn() } as any,
      channelAdapter as any,
    );
    return { instance, channelAdapter };
  }

  it('proactively sends the rejection reason to the Telegram customer', async () => {
    const { instance, channelAdapter } = projector({});
    await instance.runOnce();
    expect(channelAdapter.sendMessage).toHaveBeenCalledWith(
      'telegram',
      expect.objectContaining({
        recipientId: 'telegram-1',
        content: expect.stringContaining('proof is wrong'),
      }),
    );
  });

  it('notifies only expiry cancellations, not staff cancellations', async () => {
    const expired = projector({
      eventType: 'order.cancelled',
      payload: {
        customerId: 'customer-1',
        orderNumber: 'ORD-1',
        reason: 'expired',
      },
    });
    await expired.instance.runOnce();
    expect(expired.channelAdapter.sendMessage).toHaveBeenCalledTimes(1);

    const staff = projector({
      eventType: 'order.cancelled',
      payload: {
        customerId: 'customer-1',
        orderNumber: 'ORD-1',
        reason: 'customer requested',
      },
    });
    await staff.instance.runOnce();
    expect(staff.channelAdapter.sendMessage).not.toHaveBeenCalled();
  });
});
