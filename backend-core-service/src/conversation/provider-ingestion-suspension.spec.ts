/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { ConflictException } from '@nestjs/common';

import { ConversationService } from './conversation.service';

function createService(overrides: Record<string, any> = {}) {
  const transactionManager =
    overrides.transactionManager || createTransactionManager();
  const repositories = {
    conversation: {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'conversation-1', ...value })),
      update: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => callback(transactionManager)),
      },
    },
    message: {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'message-1', ...value })),
    },
    customer: {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'customer-1', ...value })),
      update: jest.fn(),
    },
    channel: { findOne: jest.fn() },
    tenant: { findOne: jest.fn() },
    notification: {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    },
    tenantUser: { find: jest.fn(async () => []) },
    entitlement: {
      assertTenantCanOperate: jest
        .fn()
        .mockResolvedValue({ state: 'paid_active' }),
      getTenantEntitlement: jest
        .fn()
        .mockResolvedValue({ state: 'paid_active' }),
    },
    ...overrides,
  };
  const service = new ConversationService(
    repositories.conversation as any,
    {} as any,
    repositories.message as any,
    repositories.customer as any,
    repositories.channel as any,
    repositories.tenant as any,
    repositories.notification as any,
    repositories.tenantUser as any,
    { resolveActivePeriodId: jest.fn(async () => null) } as any,
    overrides.usageLimitService || {
      assertProviderMessageUsageAvailable: jest.fn(),
      recordProviderMessageInTransaction: jest.fn(async () => ({
        id: 'usage-1',
      })),
    },
    {
      emitNewMessage: jest.fn(),
      emitConversationUpdate: jest.fn(),
    } as any,
  );

  return { service, repositories, transactionManager };
}

describe('ConversationService provider ingestion suspension', () => {
  it('marks inbound provider events failed_terminal when the period quota rejects (no active paid period)', async () => {
    const transactionManager = createTransactionManager();
    const usageLimitService = {
      assertProviderMessageUsageAvailable: jest.fn().mockRejectedValue(
        new ConflictException({
          code: 'SUBSCRIPTION_PERIOD_NOT_ACTIVE',
          message: 'Tenant has no active paid subscription period.',
        }),
      ),
      recordProviderMessageInTransaction: jest.fn(),
    };
    const { service, repositories } = createService({
      transactionManager,
      usageLimitService,
    });
    repositories.channel.findOne.mockResolvedValue({
      id: 'channel-1',
      tenantId: 'tenant-1',
      channelType: 'telegram',
    });

    const result = await service.ingestProviderMessage({
      eventId: 'suspended-event-1',
      provider: 'telegram',
      channelId: 'channel-1',
      normalized: {
        externalConversationId: 'chat-1',
        externalMessageId: 'message-1',
        senderId: 'customer-1',
        messageType: 'text',
        content: 'Hello',
      },
    });

    expect(result).toMatchObject({
      accepted: true,
      quotaRejected: true,
      rejectionCode: 'SUBSCRIPTION_PERIOD_NOT_ACTIVE',
    });
    expect(result).not.toHaveProperty('messageId');
    expect(transactionManager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'event-record-1' },
      expect.objectContaining({
        processingStatus: 'failed_terminal',
        failureCode: 'SUBSCRIPTION_PERIOD_NOT_ACTIVE',
        messageId: null,
      }),
    );
  });

  it('tracks inbound provider message usage for active tenants', async () => {
    const { service, repositories } = createService();
    repositories.channel.findOne.mockResolvedValue({
      id: 'channel-1',
      tenantId: 'tenant-1',
      channelType: 'telegram',
    });
    repositories.customer.findOne.mockResolvedValue(null);
    repositories.conversation.findOne.mockResolvedValue(null);
    repositories.message.findOne.mockResolvedValue(null);
    repositories.conversation.findOneBy.mockResolvedValue({
      id: 'conversation-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      channelId: 'channel-1',
    });
    repositories.customer.findOneBy.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-1',
      channelId: 'channel-1',
      externalId: 'customer-1',
    });

    await expect(
      service.ingestProviderMessage({
        eventId: 'event-1',
        provider: 'telegram',
        channelId: 'channel-1',
        normalized: {
          externalConversationId: 'chat-1',
          externalMessageId: 'provider-message-1',
          senderId: 'customer-1',
          messageType: 'text',
          content: 'Hello',
        },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
      tenantId: 'tenant-1',
      channelId: 'channel-1',
      messageId: 'message-1',
    });

    expect(repositories.conversation.manager.transaction).toHaveBeenCalled();
  });

  it('enforces trial inbound limits without requiring a paid period', async () => {
    const usageLimitService = {
      assertProviderMessageUsageAvailable: jest
        .fn()
        .mockResolvedValue({ activePeriodId: null }),
      recordProviderMessageInTransaction: jest
        .fn()
        .mockResolvedValue({ id: 'trial-usage-1' }),
    };
    const { service, repositories } = createService({
      usageLimitService,
    });
    repositories.entitlement.getTenantEntitlement.mockResolvedValue({
      state: 'trial_active',
    });
    repositories.channel.findOne.mockResolvedValue({
      id: 'channel-1',
      tenantId: 'tenant-1',
      channelType: 'telegram',
    });
    repositories.conversation.findOneBy.mockResolvedValue({
      id: 'conversation-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      channelId: 'channel-1',
    });
    repositories.customer.findOneBy.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-1',
      channelId: 'channel-1',
      externalId: 'customer-1',
    });

    await expect(
      service.ingestProviderMessage({
        eventId: 'trial-event-1',
        provider: 'telegram',
        channelId: 'channel-1',
        normalized: {
          externalConversationId: 'chat-1',
          externalMessageId: 'trial-message-1',
          senderId: 'customer-1',
          messageType: 'text',
          content: 'Trial message',
        },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
      messageId: 'message-1',
    });

    expect(
      usageLimitService.assertProviderMessageUsageAvailable,
    ).toHaveBeenCalledWith(
      'tenant-1',
      1,
      expect.objectContaining({ direction: 'inbound' }),
    );
    expect(
      usageLimitService.recordProviderMessageInTransaction,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({ direction: 'inbound' }),
      { activePeriodId: null },
    );
  });

  it('acknowledges inbound quota rejection without creating a message or usage grant', async () => {
    process.env.SUBSCRIPTION_PERIOD_ENFORCEMENT_ENABLED = 'true';
    const transactionManager = createTransactionManager();
    const usageLimitService = {
      assertProviderMessageUsageAvailable: jest
        .fn()
        .mockRejectedValue(new Error('INBOUND_MESSAGE_QUOTA_EXHAUSTED')),
      recordProviderMessageInTransaction: jest.fn(),
    };
    const { service, repositories } = createService({
      transactionManager,
      usageLimitService,
    });
    repositories.channel.findOne.mockResolvedValue({
      id: 'channel-1',
      tenantId: 'tenant-1',
      channelType: 'telegram',
    });

    const result = await service.ingestProviderMessage({
      eventId: 'quota-event-1',
      provider: 'telegram',
      channelId: 'channel-1',
      normalized: {
        externalConversationId: 'chat-1',
        externalMessageId: 'provider-message-quota-1',
        senderId: 'customer-1',
        messageType: 'text',
        content: 'Over quota',
      },
    });

    expect(result).toMatchObject({
      accepted: true,
      quotaRejected: true,
      rejectionCode: 'INBOUND_MESSAGE_QUOTA_EXHAUSTED',
    });
    expect(result).not.toHaveProperty('messageId');
    expect(
      usageLimitService.recordProviderMessageInTransaction,
    ).not.toHaveBeenCalled();
    expect(transactionManager.insert).not.toHaveBeenCalled();
    delete process.env.SUBSCRIPTION_PERIOD_ENFORCEMENT_ENABLED;
  });

  it('does not create another message or usage event for duplicate provider events', async () => {
    const transactionManager = createTransactionManager({
      eventInsertIdentifiers: [],
      existingEvent: {
        id: 'event-record-1',
        messageId: 'message-1',
        processingStatus: 'processed',
      },
      existingMessage: {
        id: 'message-1',
        tenantId: 'tenant-1',
        channelId: 'channel-1',
        conversationId: 'conversation-1',
        senderId: 'customer-1',
      },
    });
    const { service, repositories } = createService({ transactionManager });
    repositories.channel.findOne.mockResolvedValue({
      id: 'channel-1',
      tenantId: 'tenant-1',
      channelType: 'telegram',
    });

    await expect(
      service.ingestProviderMessage({
        eventId: 'event-1',
        provider: 'telegram',
        channelId: 'channel-1',
        normalized: {
          externalConversationId: 'chat-1',
          externalMessageId: 'provider-message-1',
          senderId: 'customer-1',
          messageType: 'text',
          content: 'Hello again',
        },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      duplicate: true,
      messageId: 'message-1',
    });

    expect(transactionManager.insert).not.toHaveBeenCalled();
    expect(transactionManager.save).not.toHaveBeenCalled();
  });

  it('creates one result when the same provider event is submitted concurrently', async () => {
    const transactionManager = createConcurrentProviderEventManager();
    const { service, repositories } = createService({ transactionManager });
    repositories.channel.findOne.mockResolvedValue({
      id: 'channel-1',
      tenantId: 'tenant-1',
      channelType: 'telegram',
    });
    repositories.conversation.findOneBy.mockResolvedValue({
      id: 'conversation-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      channelId: 'channel-1',
    });
    repositories.customer.findOneBy.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-1',
      channelId: 'channel-1',
      externalId: 'customer-1',
    });

    const input = {
      eventId: 'event-concurrent',
      provider: 'telegram',
      channelId: 'channel-1',
      normalized: {
        externalConversationId: 'chat-1',
        externalMessageId: 'provider-message-1',
        senderId: 'customer-1',
        messageType: 'text',
        content: 'Hello once',
      },
    };

    const results = await Promise.all([
      service.ingestProviderMessage(input),
      service.ingestProviderMessage(input),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ duplicate: false, messageId: 'message-1' }),
        expect.objectContaining({ duplicate: true }),
      ]),
    );
    expect(transactionManager.createQueryBuilder).toHaveBeenCalled();
    expect(transactionManager.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'InboundProviderEvent' }),
      { id: 'event-record-1' },
      expect.objectContaining({
        processingStatus: 'processed',
        messageId: 'message-1',
      }),
    );
  });
});

function createTransactionManager(overrides: Record<string, any> = {}) {
  const rows = {
    event: overrides.existingEvent || { id: 'event-record-1' },
    customer: { id: 'customer-1', profileData: {}, totalConversations: 0 },
    conversation: { id: 'conversation-1' },
    message: overrides.existingMessage || { id: 'message-1' },
  };
  let insertCount = 0;
  return {
    createQueryBuilder: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => {
        insertCount += 1;
        if (insertCount === 1 && overrides.eventInsertIdentifiers) {
          return { identifiers: overrides.eventInsertIdentifiers };
        }
        return {
          identifiers: [
            {
              id:
                Object.values(rows)[insertCount - 1]?.id ||
                `row-${insertCount}`,
            },
          ],
        };
      }),
    })),
    findOneByOrFail: jest.fn(async (entity) => {
      if (entity.name === 'InboundProviderEvent') return rows.event;
      if (entity.name === 'Customer') return rows.customer;
      if (entity.name === 'Conversation') return rows.conversation;
      if (entity.name === 'Message') return rows.message;
      return { id: 'row-1' };
    }),
    findOne: jest.fn(async (entity) => {
      if (entity.name === 'InboundProviderEvent') return rows.event;
      if (entity.name === 'Message') return rows.message;
      return null;
    }),
    insert: jest.fn(),
    update: jest.fn(),
    increment: jest.fn(),
    save: jest.fn(async (_entity, value) => value),
  };
}

function createConcurrentProviderEventManager() {
  const eventRecord = {
    id: 'event-record-1',
    messageId: null as string | null,
    processingStatus: 'processing',
  };
  const rows = {
    customer: { id: 'customer-1', profileData: {}, totalConversations: 0 },
    conversation: { id: 'conversation-1' },
    message: {
      id: 'message-1',
      senderId: 'customer-1',
      conversationId: 'conversation-1',
    },
  };
  let providerEventClaimed = false;
  let messageInserted = false;

  const manager = {
    createQueryBuilder: jest.fn(() => {
      let entityName = '';
      const builder = {
        insert: jest.fn(() => builder),
        into: jest.fn((entity) => {
          entityName = entity.name;
          return builder;
        }),
        values: jest.fn(() => builder),
        orIgnore: jest.fn(() => builder),
        execute: jest.fn(async () => {
          if (entityName === 'InboundProviderEvent') {
            if (providerEventClaimed) {
              return { identifiers: [] };
            }
            providerEventClaimed = true;
            return { identifiers: [{ id: eventRecord.id }] };
          }
          if (entityName === 'Message') {
            if (messageInserted) {
              return { identifiers: [] };
            }
            messageInserted = true;
            return { identifiers: [{ id: rows.message.id }] };
          }
          if (entityName === 'Customer') {
            return { identifiers: [{ id: rows.customer.id }] };
          }
          if (entityName === 'Conversation') {
            return { identifiers: [{ id: rows.conversation.id }] };
          }
          return { identifiers: [] };
        }),
      };
      return builder;
    }),
    findOneByOrFail: jest.fn(async (entity) => {
      if (entity.name === 'InboundProviderEvent') return eventRecord;
      if (entity.name === 'Customer') return rows.customer;
      if (entity.name === 'Conversation') return rows.conversation;
      if (entity.name === 'Message') return rows.message;
      return { id: 'row-1' };
    }),
    findOne: jest.fn(async (entity) => {
      if (entity.name === 'InboundProviderEvent') return eventRecord;
      if (entity.name === 'Message') return rows.message;
      return null;
    }),
    insert: jest.fn(),
    update: jest.fn(async (entity, _criteria, value) => {
      if (entity.name === 'InboundProviderEvent') {
        eventRecord.messageId = value.messageId;
        eventRecord.processingStatus = value.processingStatus;
      }
    }),
    increment: jest.fn(),
    save: jest.fn(async (_entity, value) => value),
  };

  return manager;
}
