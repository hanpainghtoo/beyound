import { BadRequestException } from '@nestjs/common';
import { Order } from './entities/order.entity';
import { OrderPaymentTransaction } from './entities/order-payment-transaction.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import {
  OrderTransitionService,
  PaymentProofRetryLimitError,
} from './order-transition.service';

function serviceFor(
  order: Record<string, unknown>,
  settings: Record<string, unknown> = {},
  ledger: Array<Record<string, any>> = [],
) {
  const orderRepository = {
    findOne: jest.fn().mockResolvedValue(order),
    save: jest.fn().mockImplementation(async (value) => value),
  };
  const tenantRepository = {
    findOneBy: jest.fn().mockResolvedValue({ orderExpirySettings: settings }),
  };
  const paymentTransactions = [...ledger];
  const transactionRepository = {
    find: jest.fn(async () =>
      paymentTransactions.filter(
        (row) =>
          row.tenantId === order.tenantId && row.orderId === order.id,
      ),
    ),
    findOne: jest.fn(async ({ where }: any) =>
      paymentTransactions.find(
        (row) =>
          row.tenantId === where.tenantId &&
          row.orderId === where.orderId &&
          row.idempotencyKey === where.idempotencyKey,
      ),
    ),
    create: jest.fn((value) => ({ id: `tx-${paymentTransactions.length + 1}`, ...value })),
    save: jest.fn(async (value) => {
      paymentTransactions.push(value);
      return value;
    }),
  };
  const manager: any = {
    getRepository: jest.fn((entity) =>
      entity === Order
        ? orderRepository
        : entity === Tenant
          ? tenantRepository
          : entity === OrderPaymentTransaction
            ? transactionRepository
            : undefined,
    ),
  };
  const repository: any = {
    manager: {
      transaction: jest.fn(async (callback: any) => callback(manager)),
    },
  };
  const reservation = {
    convert: jest.fn(),
    release: jest.fn(),
    restoreConverted: jest.fn(),
  };
  const events = { appendInManager: jest.fn() };
  return {
    service: new OrderTransitionService(
      repository,
      {} as any,
      reservation as any,
      events as any,
    ),
    manager,
    orderRepository,
    transactionRepository,
    paymentTransactions,
    reservation,
    events,
  };
}

const base = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1',
  tenantId: 'tenant-1',
  createdBy: null,
  status: 'pending',
  paymentStatus: 'unpaid',
  deliveryStatus: 'packed',
  statusHistory: [],
  expiresAt: null,
  totalAmount: 100,
  paidAmount: 0,
  ...overrides,
});

describe('OrderTransitionService state machines', () => {
  it.each([
    ['pending', 'confirmed'],
    ['pending', 'rejected'],
    ['rejected', 'cancelled'],
  ])('allows order transition %s -> %s', async (from, to) => {
    const { service } = serviceFor(base({ status: from }));
    const result = await service.transition('tenant-1', 'order-1', {
      to: to as any,
      reason: to === 'rejected' ? 'proof invalid' : 'staff decision',
      actorType: 'tenant_user',
    });
    expect(result.status).toBe(to);
  });

  it('expires pending and rejected orders by cancelling with system expired reason', async () => {
    for (const status of ['pending', 'rejected']) {
      const { service, reservation, events } = serviceFor(
        base({ status, expiresAt: new Date('2026-10-08') }),
      );
      const result = await service.transition('tenant-1', 'order-1', {
        to: 'cancelled',
        reason: 'expired',
        expiry: true,
        actorType: 'system',
        now: new Date('2026-10-09'),
      });
      expect(result.status).toBe('cancelled');
      expect(reservation.release).toHaveBeenCalledWith(
        expect.anything(),
        'order-1',
        'tenant-1',
        'expired',
      );
      expect(result.statusHistory.at(-1)).toEqual(
        expect.objectContaining({
          field: 'order',
          reason: 'expired',
          actorType: 'system',
        }),
      );
      expect(events.appendInManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: 'order.cancelled' }),
      );
    }
  });

  it('sets expiry only for bot orders and uses the manager for tenant settings', async () => {
    const bot = serviceFor(base({ createdBy: null }));
    await bot.service.transition('tenant-1', 'order-1', {
      to: 'rejected',
      reason: 'bad proof',
      actorType: 'tenant_user',
    });
    expect(bot.orderRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(bot.manager.getRepository).toHaveBeenCalledWith(Tenant);
    expect(bot.orderRepository.findOne.mock.results[0] as any).toBeDefined();

    const agent = serviceFor(base({ createdBy: 'agent-1' }));
    await agent.service.transition('tenant-1', 'order-1', {
      to: 'rejected',
      reason: 'bad proof',
      actorType: 'tenant_user',
    });
    expect(agent.orderRepository.save.mock.calls[0][0].expiresAt).toBeNull();
  });

  it('allows rejected retry only for bot customers and enforces the tenant retry cap', async () => {
    const retry = serviceFor(base({ status: 'rejected', statusHistory: [] }), {
      rejectedRetryMax: 1,
    });
    await retry.service.transition('tenant-1', 'order-1', {
      to: 'pending',
      actorType: 'customer',
    });
    expect(
      retry.orderRepository.save.mock.calls[0][0].expiresAt,
    ).toBeInstanceOf(Date);

    const capped = serviceFor(
      base({
        status: 'rejected',
        statusHistory: [
          {
            field: 'order',
            previousStatus: 'rejected',
            status: 'pending',
            actorType: 'customer',
          },
        ],
      }),
      { rejectedRetryMax: 1 },
    );
    await expect(
      capped.service.transition('tenant-1', 'order-1', {
        to: 'pending',
        actorType: 'customer',
      }),
    ).rejects.toBeInstanceOf(PaymentProofRetryLimitError);

    const agent = serviceFor(
      base({ status: 'rejected', createdBy: 'agent-1' }),
    );
    await expect(
      agent.service.transition('tenant-1', 'order-1', {
        to: 'pending',
        actorType: 'customer',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['out_for_delivery', 'delivered'])(
    'blocks confirmed cancellation while delivery is %s',
    async (deliveryStatus) => {
      const { service } = serviceFor(
        base({ status: 'confirmed', deliveryStatus }),
      );
      await expect(
        service.transition('tenant-1', 'order-1', {
          to: 'cancelled',
          reason: 'cancel',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each(['packed', 'failed_delivery', 'returned'])(
    'allows confirmed cancellation while delivery is %s',
    async (deliveryStatus) => {
      const { service } = serviceFor(
        base({ status: 'confirmed', deliveryStatus }),
      );
      await expect(
        service.transition('tenant-1', 'order-1', {
          to: 'cancelled',
          reason: 'cancel',
        }),
      ).resolves.toMatchObject({ status: 'cancelled' });
    },
  );

  it('records a full payment when the legacy paid transition is used', async () => {
    const { service, events, paymentTransactions } = serviceFor(
      base({ status: 'confirmed', paymentStatus: 'unpaid' }),
    );
    const result = await service.transitionPayment('tenant-1', 'order-1', {
      to: 'paid',
      actorType: 'tenant_user',
    });
    expect(result.paymentStatus).toBe('paid');
    expect(result.paidAmount).toBe(100);
    expect(paymentTransactions).toHaveLength(1);
    expect(paymentTransactions[0]).toMatchObject({ type: 'payment', amount: 100 });
    expect(result.statusHistory.at(-1)).toEqual(
      expect.objectContaining({ field: 'payment' }),
    );
    expect(events.appendInManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'order.payment_recorded' }),
    );
  });

  it('marks payment unpaid with a reversal ledger entry and preserves history', async () => {
    const ledger = [
      { tenantId: 'tenant-1', orderId: 'order-1', type: 'payment', amount: 100 },
    ];
    const { service, events, paymentTransactions } = serviceFor(
      base({ status: 'confirmed', paymentStatus: 'paid', paidAmount: 100 }),
      {},
      ledger,
    );
    const result = await service.transitionPayment('tenant-1', 'order-1', {
      to: 'unpaid',
      actorType: 'tenant_user',
      reason: 'proof rejected',
    });
    expect(result.paymentStatus).toBe('unpaid');
    expect(result.paidAmount).toBe(0);
    expect(paymentTransactions).toHaveLength(2);
    expect(paymentTransactions[1]).toMatchObject({
      type: 'reversal',
      amount: -100,
      reason: 'proof rejected',
    });
    expect(events.appendInManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'order.payment_marked_unpaid' }),
    );
  });

  it('accumulates partial payments, rejects overpayment, and keeps every entry', async () => {
    const { service, paymentTransactions } = serviceFor(
      base({ status: 'confirmed', paymentStatus: 'unpaid' }),
    );
    const first = await service.recordPayment('tenant-1', 'order-1', {
      amount: 30,
      actorType: 'tenant_user',
    });
    expect(first.paymentStatus).toBe('partially_paid');
    expect(first.paidAmount).toBe(30);
    const second = await service.recordPayment('tenant-1', 'order-1', {
      amount: 40,
      actorType: 'tenant_user',
    });
    expect(second.paymentStatus).toBe('partially_paid');
    expect(second.paidAmount).toBe(70);
    expect(paymentTransactions).toHaveLength(2);
    await expect(
      service.recordPayment('tenant-1', 'order-1', {
        amount: 40,
        actorType: 'tenant_user',
      }),
    ).rejects.toThrow('remaining balance');
    expect(paymentTransactions).toHaveLength(2);
  });

  it('carries a legacy paid amount into the ledger as an opening entry', async () => {
    const { service, paymentTransactions } = serviceFor(
      base({ status: 'confirmed', paymentStatus: 'partially_paid', paidAmount: 50 }),
    );
    const result = await service.recordPayment('tenant-1', 'order-1', {
      amount: 20,
      actorType: 'tenant_user',
    });
    expect(paymentTransactions).toHaveLength(2);
    expect(paymentTransactions[0]).toMatchObject({
      type: 'payment',
      amount: 50,
      metadata: { legacyOpeningBalance: true },
    });
    expect(result.paidAmount).toBe(70);
    expect(result.paymentStatus).toBe('partially_paid');
  });

  it('rejects zero and negative payment amounts', async () => {
    const { service } = serviceFor(
      base({ status: 'confirmed', paymentStatus: 'unpaid' }),
    );
    await expect(
      service.recordPayment('tenant-1', 'order-1', {
        amount: 0,
        actorType: 'tenant_user',
      }),
    ).rejects.toThrow('greater than zero');
    await expect(
      service.recordPayment('tenant-1', 'order-1', {
        amount: -5,
        actorType: 'tenant_user',
      }),
    ).rejects.toThrow('greater than zero');
  });

  it('returns the original transaction for a repeated idempotency key', async () => {
    const { service, paymentTransactions } = serviceFor(
      base({ status: 'confirmed', paymentStatus: 'unpaid' }),
    );
    await service.recordPayment('tenant-1', 'order-1', {
      amount: 30,
      actorType: 'tenant_user',
      idempotencyKey: 'submit-1',
    });
    const repeated = await service.recordPayment('tenant-1', 'order-1', {
      amount: 30,
      actorType: 'tenant_user',
      idempotencyKey: 'submit-1',
    });
    expect(repeated.paidAmount).toBe(30);
    expect(paymentTransactions).toHaveLength(1);
  });

  it('requires a note when marking payment unpaid', async () => {
    const { service } = serviceFor(base({ paymentStatus: 'paid' }));
    await expect(
      service.transitionPayment('tenant-1', 'order-1', {
        to: 'unpaid',
        actorType: 'tenant_user',
      }),
    ).rejects.toThrow('note');
  });

  it('rejects a payment proof reference that is not attached to the locked order', async () => {
    const { service } = serviceFor(
      base({ status: 'confirmed', attachments: [{ fileId: 'proof-1' }] }),
    );
    await expect(
      service.transitionPayment('tenant-1', 'order-1', {
        to: 'paid',
        actorType: 'tenant_user',
        attachmentReference: 'foreign-proof',
      }),
    ).rejects.toThrow('does not belong');
  });

  it('appends a bot proof, timestamps the signal, and emits the proof event transactionally', async () => {
    const { service, events, orderRepository } = serviceFor(
      base({ customerId: 'customer-1', attachments: [] }),
    );
    const result = await service.submitPaymentProof(
      'tenant-1',
      'order-1',
      'customer-1',
      {
        fileId: 'telegram-proof-1',
        sourceMessageId: 'message-1',
        contentType: 'image/jpeg',
      },
    );
    expect(result.paymentSubmittedAt).toBeInstanceOf(Date);
    expect(result.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileId: 'telegram-proof-1',
          role: 'payment_proof',
          source: 'telegram',
        }),
      ]),
    );
    expect(events.appendInManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'order.payment_proof_submitted',
        payload: expect.objectContaining({
          attachmentReference: 'telegram-proof-1',
        }),
      }),
    );
    expect(result.statusHistory.at(-1)).toEqual(
      expect.objectContaining({ event: 'proof_submitted' }),
    );
    expect(orderRepository.save).toHaveBeenCalled();
  });

  it('does not change state, history, or events for a duplicate proof and rejects paid orders', async () => {
    const { service, events, orderRepository } = serviceFor(
      base({ customerId: 'customer-1', attachments: [] }),
    );
    const proof = { fileId: 'telegram-proof-1', sourceMessageId: 'message-1' };
    await service.submitPaymentProof(
      'tenant-1',
      'order-1',
      'customer-1',
      proof,
    );
    const saves = orderRepository.save.mock.calls.length;
    const eventsBefore = events.appendInManager.mock.calls.length;
    await service.submitPaymentProof(
      'tenant-1',
      'order-1',
      'customer-1',
      proof,
    );
    expect(orderRepository.save).toHaveBeenCalledTimes(saves);
    expect(events.appendInManager).toHaveBeenCalledTimes(eventsBefore);

    const paid = serviceFor(
      base({ customerId: 'customer-1', paymentStatus: 'paid' }),
    );
    await expect(
      paid.service.submitPaymentProof(
        'tenant-1',
        'order-1',
        'customer-1',
        proof,
      ),
    ).rejects.toThrow('paid order');
  });

  it('runs delivery transitions, records field, and emits the delivery event', async () => {
    const { service, events } = serviceFor(base({ status: 'confirmed' }));
    const result = await service.transitionDelivery('tenant-1', 'order-1', {
      to: 'out_for_delivery',
      actorType: 'tenant_user',
    });
    expect(result.deliveryStatus).toBe('out_for_delivery');
    expect(result.statusHistory.at(-1)).toEqual(
      expect.objectContaining({ field: 'delivery' }),
    );
    expect(events.appendInManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'order.delivery_status_changed' }),
    );
  });

  it('supports idempotent same-state calls and optional delivery status for field-only edits', async () => {
    const { service, events, orderRepository } = serviceFor(
      base({ status: 'confirmed' }),
    );
    expect(
      (await service.transition('tenant-1', 'order-1', { to: 'confirmed' }))
        .status,
    ).toBe('confirmed');
    const before = orderRepository.save.mock.calls.length;
    const result = await service.updateDelivery('tenant-1', 'order-1', {
      deliveryAssigneeName: 'Agent A',
    });
    expect(result.statusHistory).toHaveLength(0);
    expect(events.appendInManager).not.toHaveBeenCalled();
    expect(orderRepository.save).toHaveBeenCalledTimes(before + 1);
  });

  it('propagates append-event failure so the transaction can roll back', async () => {
    const { service, events, orderRepository } = serviceFor(base());
    events.appendInManager.mockRejectedValue(new Error('event failure'));
    await expect(
      service.transition('tenant-1', 'order-1', {
        to: 'rejected',
        reason: 'bad proof',
      }),
    ).rejects.toThrow('event failure');
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
  });
});
