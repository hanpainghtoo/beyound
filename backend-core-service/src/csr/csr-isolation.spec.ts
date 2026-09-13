/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CsrService } from './csr.service';

function createService(overrides: Record<string, any> = {}) {
  let lastOutboundCommand: Record<string, any> | undefined;
  let lastMessage: Record<string, any> | undefined;
  const repositories = {
    conversation: { findOne: jest.fn(), save: jest.fn(), update: jest.fn() },
    message: {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        lastMessage = { id: value.id || 'message-1', ...value };
        return lastMessage;
      }),
      find: jest.fn(),
    },
    outboundCommand: {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        lastOutboundCommand = { id: value.id || 'command-1', ...value };
        return lastOutboundCommand;
      }),
      find: jest.fn(async () =>
        lastOutboundCommand?.status === 'queued' ? [lastOutboundCommand] : [],
      ),
      findOne: jest.fn(async () =>
        lastOutboundCommand
          ? {
              ...lastOutboundCommand,
              message: lastMessage,
              conversation: {
                id: lastOutboundCommand.conversationId,
                customer: { externalId: 'telegram-chat-1' },
              },
              channel: {
                id: lastOutboundCommand.channelId,
                channelType: lastOutboundCommand.provider,
              },
            }
          : null,
      ),
    },
    customer: { findOne: jest.fn(), save: jest.fn() },
    tenantUser: { findOne: jest.fn() },
    order: {
      create: jest.fn((value) => value),
      save: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    },
    orderItem: { create: jest.fn((value) => value), save: jest.fn() },
    product: { findOne: jest.fn() },
    cannedResponse: {},
    analytics: {},
    tenantChannel: {
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'channel-1',
          status: 'active',
          connectionStatus: 'ready',
        }),
      })),
    },
    ...overrides,
  };
  const domainEventService = overrides.domainEventService || {
    append: jest.fn(),
  };
  const channelAdapterService = overrides.channelAdapterService || {
    sendMessage: jest.fn(),
  };
  const websocketService = overrides.websocketService || {
    emitNewMessage: jest.fn(),
    emitConversationUpdate: jest.fn(),
  };
  const usageLimitService = overrides.usageLimitService || {
    assertProviderMessageUsageAvailable: jest.fn(async () => ({
      activePeriodId: 'period-1',
    })),
    recordProviderMessageInTransaction: jest.fn(async () => ({
      id: 'usage-1',
    })),
    trackProviderMessage: jest.fn(async () => ({ id: 'usage-1' })),
  };
  const transactionManager: any = {
    getRepository: jest.fn((entity) => {
      if (entity.name === 'TenantChannel') return repositories.tenantChannel;
      if (entity.name === 'Message') return repositories.message;
      if (entity.name === 'OutboundMessageCommand') {
        return repositories.outboundCommand;
      }
      return undefined;
    }),
  };
  (repositories.message as any).manager = {
    transaction: jest.fn(async (callback: (manager: any) => any) =>
      callback(transactionManager),
    ),
  };

  const service = new CsrService(
    repositories.conversation as any,
    repositories.message as any,
    repositories.outboundCommand as any,
    repositories.customer as any,
    repositories.tenantUser as any,
    repositories.order as any,
    repositories.orderItem as any,
    repositories.product as any,
    repositories.cannedResponse as any,
    repositories.analytics as any,
    repositories.tenantChannel as any,
    domainEventService,
    channelAdapterService,
    websocketService,
    usageLimitService,
  );

  return {
    service,
    repositories,
    domainEventService,
    channelAdapterService,
    websocketService,
    usageLimitService,
  };
}

describe('CsrService tenant isolation', () => {
  it('creates a tenant-scoped manual order without a conversation', async () => {
    const { service, repositories, domainEventService } = createService();
    repositories.customer.findOne.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-a',
    });
    repositories.product.findOne.mockResolvedValue({
      id: 'product-1',
      tenantId: 'tenant-a',
      name: 'Tea set',
      sku: 'TEA-1',
      type: 'product',
      price: 12000,
      status: 'active',
    });
    repositories.order.count.mockResolvedValue(0);
    repositories.order.save.mockImplementation(async (value) => ({
      id: 'order-1',
      ...value,
    }));
    repositories.order.findOne.mockResolvedValue(null);

    const order = await service.createOrderFromChat('tenant-a', 'csr-1', {
      customerId: 'customer-1',
      paymentMethod: 'cod',
      items: [{ productId: 'product-1', quantity: 2, unitPrice: 12000 }],
    });

    expect(order).toMatchObject({
      tenantId: 'tenant-a',
      customerId: 'customer-1',
      conversationId: undefined,
      totalAmount: 24000,
      paymentStatus: 'cod_pending',
    });
    expect(order.statusHistory[0]).toMatchObject({
      source: 'manual',
      note: 'Manual order created',
    });
    expect(domainEventService.append).toHaveBeenCalledTimes(1);
    expect(domainEventService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'order.created',
        entityId: 'order-1',
      }),
    );
  });

  it('persists inbox read state on the tenant-scoped conversation', async () => {
    const conversation = {
      id: 'conversation-1',
      tenantId: 'tenant-a',
      customerId: 'customer-1',
      lastCustomerMessageAt: new Date('2026-07-02T08:00:00.000Z'),
      metadata: {},
    };
    const { service, repositories, domainEventService } = createService();
    repositories.conversation.findOne.mockResolvedValue(conversation);
    repositories.conversation.save.mockImplementation(async (value) => value);

    const unread = await service.setConversationReadState(
      'tenant-a',
      'conversation-1',
      true,
      'csr-1',
    );
    expect(unread.metadata).toMatchObject({
      inboxForceUnread: true,
      inboxUnread: true,
    });

    const read = await service.setConversationReadState(
      'tenant-a',
      'conversation-1',
      false,
      'csr-1',
    );
    expect(read.metadata).toMatchObject({
      inboxForceUnread: false,
      inboxUnread: false,
    });
    expect(read.metadata.inboxReadAt).toEqual(expect.any(String));
    expect(repositories.conversation.save).toHaveBeenCalledTimes(2);
    expect(domainEventService.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: 'conversation.marked_read',
        entityId: 'conversation-1',
      }),
    );
  });

  it('rejects assigning a conversation to a user outside the tenant', async () => {
    const { service, repositories } = createService();
    repositories.conversation.findOne.mockResolvedValue({
      id: 'conversation-1',
      tenantId: 'tenant-a',
      assignedCsrId: null,
    });
    repositories.tenantUser.findOne.mockResolvedValue(null);

    await expect(
      service.updateConversation(
        'tenant-a',
        'conversation-1',
        { assignedCsrId: 'foreign-csr' },
        'actor-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repositories.conversation.save).not.toHaveBeenCalled();
    expect(repositories.tenantUser.findOne).toHaveBeenCalledWith({
      where: { id: 'foreign-csr', tenantId: 'tenant-a' },
    });
  });

  it('only allows staff csrs to assign conversations to themselves', async () => {
    const { service, repositories } = createService();
    repositories.conversation.findOne.mockResolvedValue({
      id: 'conversation-1',
      tenantId: 'tenant-a',
      assignedCsrId: null,
      customerId: 'customer-1',
    });

    await expect(
      service.assignConversation(
        'tenant-a',
        'conversation-1',
        'csr-2',
        'csr-1',
        'csr',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repositories.tenantUser.findOne).not.toHaveBeenCalled();
    expect(repositories.conversation.save).not.toHaveBeenCalled();
  });

  it('never permits customer tenant ownership to be changed', async () => {
    const customer = {
      id: 'customer-1',
      tenantId: 'tenant-a',
      fullName: 'Original',
    };
    const { service, repositories } = createService();
    repositories.customer.findOne.mockResolvedValue(customer);
    repositories.customer.save.mockImplementation(async (value) => value);

    const updated = await service.updateCustomerProfile(
      'tenant-a',
      'customer-1',
      {
        fullName: 'Updated',
        tenantId: 'tenant-b',
      } as any,
    );

    expect(updated.fullName).toBe('Updated');
    expect(updated.tenantId).toBe('tenant-a');
  });

  it('normalizes file attachments before persisting and sending csr messages', async () => {
    const {
      service,
      repositories,
      channelAdapterService,
      domainEventService,
      usageLimitService,
    } = createService();
    repositories.conversation.findOne.mockResolvedValue({
      id: 'conversation-1',
      tenantId: 'tenant-a',
      customerId: 'customer-1',
      channelId: 'channel-1',
      status: 'pending',
      firstResponseAt: null,
      channel: { channelType: 'telegram', connectionStatus: 'ready' },
      customer: { externalId: 'telegram-chat-1' },
    });
    channelAdapterService.sendMessage.mockResolvedValue({
      status: 'sent',
      externalMessageId: 'external-message-1',
      metadata: { provider: 'telegram' },
    });

    const sent = await service.sendMessage('tenant-a', 'csr-1', {
      conversationId: 'conversation-1',
      content: 'Here is the invoice',
      attachments: [
        {
          fileId: 'file-1',
          role: 'invoice',
          fileName: 'invoice.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
        },
      ],
    });

    expect(sent.attachments).toEqual([
      expect.objectContaining({
        fileId: 'file-1',
        role: 'invoice',
        fileName: 'invoice.pdf',
        contentType: 'application/pdf',
        source: 'csr_message',
      }),
    ]);
    expect(channelAdapterService.sendMessage).toHaveBeenCalledWith(
      'telegram',
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            fileId: 'file-1',
            role: 'invoice',
          }),
        ],
        metadata: expect.objectContaining({
          internalMessageId: 'message-1',
          outboundCommandId: 'outbound:message-1',
        }),
      }),
    );
    expect(
      usageLimitService.recordProviderMessageInTransaction,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-a',
      expect.objectContaining({
        channelId: 'channel-1',
        provider: 'telegram',
        direction: 'outbound',
        source: 'csr_message',
        sourceMessageId: 'message-1',
        metadata: expect.objectContaining({
          conversationId: 'conversation-1',
          csrId: 'csr-1',
          attachmentFileIds: ['file-1'],
          billingPolicy: 'accepted_outbound_command',
        }),
      }),
      expect.objectContaining({ activePeriodId: 'period-1' }),
    );
    expect(
      usageLimitService.assertProviderMessageUsageAvailable,
    ).toHaveBeenCalledWith(
      'tenant-a',
      1,
      expect.objectContaining({ direction: 'outbound' }),
    );
    expect(domainEventService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'message.sent',
        payload: expect.objectContaining({
          attachmentFileIds: ['file-1'],
        }),
      }),
    );
    expect(repositories.message.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'queued',
        provider: 'telegram',
        channelId: 'channel-1',
      }),
    );
    expect(repositories.message.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sending',
        metadata: expect.objectContaining({
          outboundCommand: expect.objectContaining({
            id: 'outbound:message-1',
            state: 'sending',
          }),
        }),
      }),
    );
    expect(sent.metadata.outboundCommand).toMatchObject({
      id: 'outbound:message-1',
      state: 'sent',
    });
    expect(repositories.outboundCommand.save).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: 'outbound:message-1',
        status: 'queued',
        attempts: 0,
        payload: {
          messageType: 'text',
          attachmentFileIds: ['file-1'],
        },
      }),
    );
    expect(repositories.outboundCommand.save).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: 'outbound:message-1',
        status: 'sending',
        attempts: 1,
      }),
    );
    expect(repositories.outboundCommand.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        commandId: 'outbound:message-1',
        status: 'sent',
        providerResult: expect.objectContaining({
          externalMessageId: 'external-message-1',
          status: 'sent',
        }),
      }),
    );
  });

  it('processes queued outbound commands through the persisted dispatch context', async () => {
    const { service, repositories, channelAdapterService } = createService();
    channelAdapterService.sendMessage.mockResolvedValue({
      status: 'sent',
      externalMessageId: 'external-message-worker-1',
      metadata: { provider: 'telegram' },
    });

    await repositories.message.save({
      id: 'message-worker-1',
      content: 'Queued hello',
      messageType: 'text',
      attachments: [],
      metadata: {},
      status: 'queued',
    });
    await repositories.outboundCommand.save({
      id: 'command-worker-1',
      commandId: 'outbound:message-worker-1',
      tenantId: 'tenant-a',
      conversationId: 'conversation-1',
      messageId: 'message-worker-1',
      channelId: 'channel-1',
      provider: 'telegram',
      status: 'queued',
      attempts: 0,
      payload: {},
      providerResult: {},
    });

    await expect(
      service.processPendingOutboundMessageCommands(10),
    ).resolves.toMatchObject({
      processed: 1,
      results: [
        {
          commandId: 'outbound:message-worker-1',
          status: 'sent',
        },
      ],
    });

    expect(repositories.outboundCommand.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'queued' },
        take: 10,
      }),
    );
    expect(channelAdapterService.sendMessage).toHaveBeenCalledWith(
      'telegram',
      expect.objectContaining({
        recipientId: 'telegram-chat-1',
        content: 'Queued hello',
        metadata: expect.objectContaining({
          outboundCommandId: 'outbound:message-worker-1',
        }),
      }),
    );
    expect(repositories.outboundCommand.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        commandId: 'outbound:message-worker-1',
        status: 'sent',
        providerResult: expect.objectContaining({
          externalMessageId: 'external-message-worker-1',
          status: 'sent',
        }),
      }),
    );
  });

  it('preserves an outbound command as delivery unknown when the provider throws', async () => {
    const { service, repositories, channelAdapterService, domainEventService } =
      createService();
    repositories.conversation.findOne.mockResolvedValue({
      id: 'conversation-1',
      tenantId: 'tenant-a',
      customerId: 'customer-1',
      channelId: 'channel-1',
      status: 'open',
      channel: { channelType: 'telegram', connectionStatus: 'ready' },
      customer: { externalId: 'telegram-chat-1' },
    });
    channelAdapterService.sendMessage.mockRejectedValue(
      new Error('Telegram unavailable'),
    );

    const message = await service.sendMessage('tenant-a', 'csr-1', {
      conversationId: 'conversation-1',
      content: 'Please retry this',
    });

    expect(message.status).toBe('delivery_unknown');
    expect(message.metadata.providerDelivery).toMatchObject({
      error: 'Telegram unavailable',
      ambiguous: true,
      retry: { recommended: true },
    });
    expect(message.metadata.outboundCommand).toMatchObject({
      id: 'outbound:message-1',
      state: 'delivery_unknown',
    });
    expect(repositories.outboundCommand.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        commandId: 'outbound:message-1',
        status: 'delivery_unknown',
        lastError: 'Telegram unavailable',
      }),
    );
    expect(repositories.message.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'delivery_unknown' }),
    );
    expect(domainEventService.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'message.delivery_unknown' }),
    );
  });

  it('links selected conversation message attachments onto chat-created orders', async () => {
    const { service, repositories, domainEventService } = createService();
    repositories.conversation.findOne.mockResolvedValue({
      id: 'conversation-1',
      tenantId: 'tenant-a',
      customerId: 'customer-1',
      channelId: 'channel-1',
    });
    repositories.customer.findOne.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-a',
    });
    repositories.product.findOne.mockResolvedValue({
      id: 'product-1',
      tenantId: 'tenant-a',
      name: 'Phone case',
      sku: 'CASE-1',
      type: 'product',
      price: 10000,
      status: 'active',
    });
    repositories.message.find.mockResolvedValue([
      {
        id: 'message-1',
        attachments: [
          {
            fileId: 'file-chat-1',
            role: 'payment_screenshot',
            fileName: 'payment.png',
          },
          {
            url: 'https://provider.example/image-only',
          },
        ],
      },
    ]);
    repositories.order.save.mockImplementation(async (value) => ({
      id: 'order-1',
      ...value,
    }));
    repositories.order.findOne.mockResolvedValue(null);
    repositories.orderItem.save.mockImplementation(async (value) => value);

    const order = await service.createOrderFromChat('tenant-a', 'csr-1', {
      conversationId: 'conversation-1',
      customerId: 'customer-1',
      attachmentSourceMessageIds: ['message-1'],
      attachments: [{ fileId: 'file-explicit-1', role: 'delivery_note' }],
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          unitPrice: 10000,
        },
      ],
    });

    expect(order.attachments).toEqual([
      expect.objectContaining({
        fileId: 'file-explicit-1',
        role: 'delivery_note',
        source: 'chat_order',
      }),
      expect.objectContaining({
        fileId: 'file-chat-1',
        role: 'payment_screenshot',
        source: 'conversation_message',
        sourceMessageId: 'message-1',
      }),
    ]);
    expect(domainEventService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'order.created',
        payload: expect.objectContaining({
          attachmentFileIds: ['file-explicit-1', 'file-chat-1'],
        }),
      }),
    );
  });

  it('persists customer profile attachment links without changing tenant ownership', async () => {
    const customer = {
      id: 'customer-1',
      tenantId: 'tenant-a',
      attachments: [],
    };
    const { service, repositories, domainEventService } = createService();
    repositories.customer.findOne.mockResolvedValue(customer);
    repositories.customer.save.mockImplementation(async (value) => value);

    const updated = await service.updateCustomerProfile(
      'tenant-a',
      'customer-1',
      {
        tenantId: 'tenant-b',
        attachments: [
          {
            id: 'file-avatar-1',
            role: 'avatar',
            contentType: 'image/png',
          },
        ],
      } as any,
      'csr-1',
    );

    expect(updated.tenantId).toBe('tenant-a');
    expect(updated.attachments).toEqual([
      expect.objectContaining({
        fileId: 'file-avatar-1',
        role: 'avatar',
        contentType: 'image/png',
        source: 'customer_profile',
      }),
    ]);
    expect(domainEventService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'customer.attachments_updated',
        payload: {
          attachmentFileIds: ['file-avatar-1'],
        },
      }),
    );
  });
});
