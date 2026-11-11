import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderPaymentTransaction } from './entities/order-payment-transaction.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { DomainEventService } from '../domain-event/domain-event.service';
import { OrderReservationService } from './order-reservation.service';
import {
  mergeAttachmentLinks,
  normalizeAttachmentLinks,
} from '../common/attachments/attachment-link.util';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'rejected',
  'cancelled',
] as const;
export const PAYMENT_STATUSES = [
  'unpaid',
  'partially_paid',
  'paid',
] as const;
export const DELIVERY_STATUSES = [
  'packed',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'returned',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type OrderTransitionInput = {
  to: OrderStatus;
  actorId?: string;
  actorType?: string;
  actorName?: string | null;
  actorAvatarUrl?: string | null;
  reason?: string;
  now?: Date;
  expiry?: boolean;
};
export type PaymentTransitionInput = Omit<OrderTransitionInput, 'to'> & {
  to: PaymentStatus;
  attachmentReference?: string;
};
export type DeliveryTransitionInput = Omit<OrderTransitionInput, 'to'> & {
  to?: DeliveryStatus;
};
export type DeliveryFieldUpdates = {
  deliveryAssigneeName?: string;
  deliveryAssigneePhone?: string;
  deliveryDate?: Date;
};
export type PaymentProofInput = {
  fileId: string;
  telegramFileId?: string;
  sourceMessageId?: string;
  contentType?: string;
  sizeBytes?: number;
};
export type RecordPaymentInput = {
  amount: number;
  proofFileId?: string;
  proofContentType?: string;
  proofSizeBytes?: number;
  reason?: string;
  actorId?: string;
  actorType?: string;
  actorName?: string | null;
  actorAvatarUrl?: string | null;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  now?: Date;
};
export type MarkOrderUnpaidInput = {
  reason: string;
  actorId?: string;
  actorType?: string;
  actorName?: string | null;
  actorAvatarUrl?: string | null;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  now?: Date;
};

export class PaymentProofRetryLimitError extends BadRequestException {
  readonly code = 'PAYMENT_PROOF_RETRY_LIMIT';

  constructor() {
    super({
      code: 'PAYMENT_PROOF_RETRY_LIMIT',
      message: 'The payment-proof retry limit has been reached',
    });
  }
}

const ORDER_TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(['confirmed', 'rejected', 'cancelled']),
  rejected: new Set(['pending', 'cancelled']),
  confirmed: new Set(['cancelled']),
  cancelled: new Set(),
};
const DELIVERY_TRANSITIONS: Record<string, Set<string>> = {
  packed: new Set(['out_for_delivery']),
  out_for_delivery: new Set(['delivered', 'failed_delivery']),
  delivered: new Set(['returned']),
  failed_delivery: new Set(['out_for_delivery', 'returned']),
  returned: new Set(),
};

@Injectable()
export class OrderTransitionService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly reservationService: OrderReservationService,
    private readonly domainEventService: DomainEventService,
  ) {}

  async transition(
    tenantId: string,
    orderId: string,
    input: OrderTransitionInput,
  ) {
    return (
      await this.orderRepository.manager.transaction((manager) =>
        this.transitionInManager(manager, tenantId, orderId, input),
      )
    ).order;
  }

  async transitionInManager(
    manager: EntityManager,
    tenantId: string,
    orderId: string,
    input: OrderTransitionInput,
  ) {
    const order = await this.lockOrder(manager, tenantId, orderId);
    const now = input.now || new Date();
    if (order.status === input.to) return { order, changed: false };
    if (
      !ORDER_STATUSES.includes(input.to) ||
      !ORDER_TRANSITIONS[order.status]?.has(input.to)
    ) {
      throw new BadRequestException(
        `Invalid order transition: ${order.status} -> ${input.to}`,
      );
    }

    const expiryCancellation =
      input.to === 'cancelled' && input.expiry === true;
    if (expiryCancellation) {
      if (
        input.actorType !== 'system' ||
        !order.expiresAt ||
        order.expiresAt > now
      ) {
        throw new BadRequestException('Order is not overdue');
      }
    } else if (input.to === 'cancelled' && !input.reason?.trim()) {
      throw new BadRequestException('A cancellation reason is required');
    }
    if (input.to === 'rejected' && !input.reason?.trim()) {
      throw new BadRequestException('A rejection reason is required');
    }
    if (input.to === 'pending') {
      if (
        order.status !== 'rejected' ||
        input.actorType !== 'customer' ||
        order.createdBy !== null
      ) {
        throw new BadRequestException(
          'Only bot customers can retry a rejected order',
        );
      }
      if (
        this.retryCount(order) >= (await this.retryLimit(manager, tenantId))
      ) {
        throw new PaymentProofRetryLimitError();
      }
    }
    if (
      input.to === 'cancelled' &&
      order.status === 'confirmed' &&
      ['out_for_delivery', 'delivered'].includes(order.deliveryStatus)
    ) {
      throw new BadRequestException('Orders in delivery cannot be cancelled');
    }

    const previousStatus = order.status;
    if (input.to === 'confirmed') {
      await this.reservationService.convert(manager, order, input.actorId);
      order.expiresAt = null;
    } else if (input.to === 'cancelled') {
      if (previousStatus === 'confirmed')
        await this.reservationService.restoreConverted(
          manager,
          order,
          input.actorId,
        );
      await this.reservationService.release(
        manager,
        order.id,
        tenantId,
        expiryCancellation ? 'expired' : input.reason || 'cancelled',
      );
      order.expiresAt = null;
    } else if (input.to === 'pending' || input.to === 'rejected') {
      order.expiresAt =
        order.createdBy === null
          ? new Date(
              now.getTime() +
                (await this.expiryHours(
                  manager,
                  tenantId,
                  input.to === 'pending' ? 'pendingPayment' : 'rejected',
                )) *
                  3600_000,
            )
          : null;
    }
    if (input.to === 'rejected') order.paymentSubmittedAt = null;

    order.status = input.to;
    order.statusHistory = [
      ...(order.statusHistory || []),
      this.history('order', input.to, previousStatus, input, now),
    ];
    await manager.getRepository(Order).save(order);
    await this.appendEvent(manager, order, previousStatus, input, now, 'order');
    return { order, changed: true, previousStatus };
  }

  async submitPaymentProof(
    tenantId: string,
    orderId: string,
    customerId: string,
    proof: PaymentProofInput,
  ) {
    return (
      await this.orderRepository.manager.transaction((manager) =>
        this.submitPaymentProofInManager(
          manager,
          tenantId,
          orderId,
          customerId,
          proof,
        ),
      )
    ).order;
  }

  async submitPaymentProofInManager(
    manager: EntityManager,
    tenantId: string,
    orderId: string,
    customerId: string,
    proof: PaymentProofInput,
  ) {
    let order = await this.lockOrder(manager, tenantId, orderId);
    if (order.customerId !== customerId)
      throw new NotFoundException('Order not found');
    if (order.paymentStatus === 'paid') {
      throw new BadRequestException(
        'Payment proof cannot be submitted for a paid order',
      );
    }
    if (!['pending', 'rejected'].includes(order.status)) {
      throw new BadRequestException(
        'Payment proof can only be submitted for pending or rejected orders',
      );
    }
    const duplicate = (order.attachments || []).some(
      (attachment) =>
        (attachment.fileId === proof.fileId ||
          (proof.telegramFileId &&
            attachment.metadata?.telegramFileId === proof.telegramFileId)) &&
        (proof.sourceMessageId
          ? attachment.sourceMessageId === proof.sourceMessageId
          : !attachment.sourceMessageId),
    );
    if (duplicate) return { order, changed: false };
    if (order.status === 'rejected') {
      order = (
        await this.transitionInManager(manager, tenantId, orderId, {
          to: 'pending',
          actorType: 'customer',
        })
      ).order;
    }
    const attachment = normalizeAttachmentLinks(
      [
        {
          ...proof,
          metadata: proof.telegramFileId
            ? { telegramFileId: proof.telegramFileId }
            : undefined,
        },
      ],
      {
        defaultRole: 'payment_proof',
        source: 'telegram',
        sourceMessageId: proof.sourceMessageId,
      },
    );
    order.attachments = mergeAttachmentLinks(
      order.attachments || [],
      attachment,
    );
    order.paymentSubmittedAt = new Date();
    order.statusHistory = [
      ...(order.statusHistory || []),
      this.history(
        'payment',
        order.paymentStatus,
        order.paymentStatus,
        {
          actorType: 'customer',
          reason: 'proof submitted',
          attachmentReference: proof.fileId,
        } as unknown as OrderTransitionInput,
        new Date(),
        proof.fileId,
        'proof_submitted',
      ),
    ];
    await manager.getRepository(Order).save(order);
    await this.appendEvent(
      manager,
      order,
      order.paymentStatus,
      {
        actorType: 'customer',
        reason: 'proof submitted',
        attachmentReference: proof.fileId,
      } as unknown as OrderTransitionInput,
      new Date(),
      'payment',
      proof.fileId,
      'order.payment_proof_submitted',
    );
    return { order, changed: true };
  }

  async transitionPayment(
    tenantId: string,
    orderId: string,
    input: PaymentTransitionInput,
  ) {
    return (
      await this.orderRepository.manager.transaction((manager) =>
        this.transitionPaymentInManager(manager, tenantId, orderId, input),
      )
    ).order;
  }

  async transitionPaymentInManager(
    manager: EntityManager,
    tenantId: string,
    orderId: string,
    input: PaymentTransitionInput,
  ) {
    const order = await this.lockOrder(manager, tenantId, orderId);
    if (!['pending', 'confirmed'].includes(order.status))
      throw new BadRequestException(
        'Payment status can change only for pending or confirmed orders',
      );
    if (input.to === 'unpaid') {
      return this.markOrderUnpaidInManager(manager, tenantId, orderId, {
        reason: input.reason || '',
        actorId: input.actorId,
        actorType: input.actorType,
        actorName: input.actorName,
        actorAvatarUrl: input.actorAvatarUrl,
        now: input.now,
        metadata: { source: 'legacy_payment_status' },
      });
    }
    if (input.to !== 'paid') {
      throw new BadRequestException(
        `Unsupported payment status: ${String(input.to)}`,
      );
    }
    if (
      input.attachmentReference !== undefined &&
      !(order.attachments || []).some(
        (attachment) =>
          attachment.fileId === input.attachmentReference ||
          attachment.id === input.attachmentReference,
      )
    ) {
      throw new BadRequestException(
        'Payment proof attachment does not belong to this order',
      );
    }
    const netPaid = await this.netPaidInManager(
      manager,
      tenantId,
      orderId,
      order,
    );
    const total = this.roundAmount(Number(order.totalAmount || 0));
    const remaining = this.roundAmount(total - netPaid);
    // Legacy "mark paid" settles the outstanding balance in one ledger entry.
    if (remaining <= 0) return { order, changed: false };
    return this.recordPaymentInManager(manager, tenantId, orderId, {
      amount: remaining,
      proofFileId: input.attachmentReference,
      reason: input.reason,
      actorId: input.actorId,
      actorType: input.actorType,
      actorName: input.actorName,
      actorAvatarUrl: input.actorAvatarUrl,
      now: input.now,
      metadata: { source: 'legacy_payment_status' },
    });
  }

  async recordPayment(
    tenantId: string,
    orderId: string,
    input: RecordPaymentInput,
  ) {
    return (
      await this.orderRepository.manager.transaction((manager) =>
        this.recordPaymentInManager(manager, tenantId, orderId, input),
      )
    ).order;
  }

  async recordPaymentInManager(
    manager: EntityManager,
    tenantId: string,
    orderId: string,
    input: RecordPaymentInput,
  ) {
    const order = await this.lockOrder(manager, tenantId, orderId);
    if (!['pending', 'confirmed'].includes(order.status))
      throw new BadRequestException(
        'Payment can be recorded only for pending or confirmed orders',
      );
    const amount = this.roundAmount(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Payment amount must be greater than zero',
      );
    }
    const repository = manager.getRepository(OrderPaymentTransaction);
    if (input.idempotencyKey) {
      const existing = await repository.findOne({
        where: { tenantId, orderId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        return {
          order,
          transaction: existing,
          changed: false,
          previousStatus: order.paymentStatus,
        };
      }
    }
    const netPaid = await this.netPaidInManager(
      manager,
      tenantId,
      orderId,
      order,
    );
    const total = this.roundAmount(Number(order.totalAmount || 0));
    const remaining = this.roundAmount(total - netPaid);
    if (remaining <= 0) {
      throw new BadRequestException('Order is already fully paid');
    }
    if (amount > remaining) {
      throw new BadRequestException(
        `Payment amount exceeds the remaining balance of ${remaining}`,
      );
    }
    const previousStatus = order.paymentStatus;
    const nextPaid = this.roundAmount(netPaid + amount);
    const nextStatus = this.derivePaymentStatus(nextPaid, total);
    const now = input.now || new Date();
    const transaction = repository.create({
      tenantId,
      orderId,
      type: 'payment',
      amount,
      proofFileId: input.proofFileId ?? null,
      proofContentType: input.proofContentType ?? null,
      proofSizeBytes: input.proofSizeBytes ?? null,
      previousPaymentStatus: previousStatus,
      newPaymentStatus: nextStatus,
      reason: input.reason ?? null,
      actorId: input.actorId ?? null,
      actorType: input.actorType || 'tenant_user',
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: input.metadata || {},
      createdAt: now,
    });
    await repository.save(transaction);
    order.paidAmount = nextPaid;
    order.paymentStatus = nextStatus;
    if (nextStatus === 'paid') order.paymentSubmittedAt = null;
    order.statusHistory = [
      ...(order.statusHistory || []),
      {
        type: 'payment',
        field: 'payment',
        status: nextStatus,
        previousStatus,
        actorId: input.actorId,
        actorType: input.actorType || 'tenant_user',
        actorName: input.actorName ?? null,
        actorAvatarUrl: input.actorAvatarUrl ?? null,
        reason: input.reason,
        attachmentReference: input.proofFileId,
        event: 'payment_recorded',
        metadata: {
          transactionId: transaction.id,
          amount,
          remainingBalance: this.roundAmount(total - nextPaid),
          ...(input.metadata || {}),
        },
        timestamp: now.toISOString(),
      },
    ];
    await manager.getRepository(Order).save(order);
    await this.appendLedgerEvent(manager, order, 'order.payment_recorded', {
      previousStatus,
      nextStatus,
      input,
      now,
      extra: {
        transactionId: transaction.id,
        amount,
        paidAmount: nextPaid,
        remainingBalance: this.roundAmount(total - nextPaid),
      },
    });
    return {
      order,
      transaction,
      changed: true,
      previousStatus,
    };
  }

  async markOrderUnpaid(
    tenantId: string,
    orderId: string,
    input: MarkOrderUnpaidInput,
  ) {
    return (
      await this.orderRepository.manager.transaction((manager) =>
        this.markOrderUnpaidInManager(manager, tenantId, orderId, input),
      )
    ).order;
  }

  async markOrderUnpaidInManager(
    manager: EntityManager,
    tenantId: string,
    orderId: string,
    input: MarkOrderUnpaidInput,
  ) {
    const order = await this.lockOrder(manager, tenantId, orderId);
    if (!['pending', 'confirmed'].includes(order.status))
      throw new BadRequestException(
        'Payment status can change only for pending or confirmed orders',
      );
    if (!input.reason?.trim())
      throw new BadRequestException(
        'A note is required when marking payment unpaid',
      );
    const repository = manager.getRepository(OrderPaymentTransaction);
    if (input.idempotencyKey) {
      const existing = await repository.findOne({
        where: { tenantId, orderId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        return {
          order,
          transaction: existing,
          changed: false,
          previousStatus: order.paymentStatus,
        };
      }
    }
    const netPaid = await this.netPaidInManager(
      manager,
      tenantId,
      orderId,
      order,
    );
    const previousStatus = order.paymentStatus;
    if (netPaid <= 0 && previousStatus === 'unpaid') {
      return { order, transaction: null, changed: false, previousStatus };
    }
    const reversedAmount = netPaid > 0 ? this.roundAmount(-netPaid) : 0;
    const now = input.now || new Date();
    const transaction = repository.create({
      tenantId,
      orderId,
      type: reversedAmount === 0 ? 'status_change' : 'reversal',
      amount: reversedAmount,
      proofFileId: null,
      proofContentType: null,
      proofSizeBytes: null,
      previousPaymentStatus: previousStatus,
      newPaymentStatus: 'unpaid',
      reason: input.reason.trim(),
      actorId: input.actorId ?? null,
      actorType: input.actorType || 'tenant_user',
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: input.metadata || {},
      createdAt: now,
    });
    await repository.save(transaction);
    order.paidAmount = 0;
    order.paymentStatus = 'unpaid';
    order.statusHistory = [
      ...(order.statusHistory || []),
      {
        type: 'payment',
        field: 'payment',
        status: 'unpaid',
        previousStatus,
        actorId: input.actorId,
        actorType: input.actorType || 'tenant_user',
        actorName: input.actorName ?? null,
        actorAvatarUrl: input.actorAvatarUrl ?? null,
        reason: input.reason.trim(),
        event: 'payment_marked_unpaid',
        metadata: {
          transactionId: transaction.id,
          reversedAmount,
          ...(input.metadata || {}),
        },
        timestamp: now.toISOString(),
      },
    ];
    await manager.getRepository(Order).save(order);
    await this.appendLedgerEvent(
      manager,
      order,
      'order.payment_marked_unpaid',
      {
        previousStatus,
        nextStatus: 'unpaid',
        input,
        now,
        extra: {
          transactionId: transaction.id,
          reversedAmount,
          paidAmount: 0,
        },
      },
    );
    return {
      order,
      transaction,
      changed: true,
      previousStatus,
    };
  }

  private derivePaymentStatus(paidAmount: number, totalAmount: number): PaymentStatus {
    if (totalAmount <= 0 || paidAmount <= 0) return 'unpaid';
    if (paidAmount >= totalAmount) return 'paid';
    return 'partially_paid';
  }

  private roundAmount(value: number) {
    return Math.round(value * 100) / 100;
  }

  private async netPaidInManager(
    manager: EntityManager,
    tenantId: string,
    orderId: string,
    order?: Order,
  ) {
    const repository = manager.getRepository(OrderPaymentTransaction);
    const rows = await repository.find({ where: { tenantId, orderId } });
    if (rows.length === 0) {
      const legacyPaid = this.roundAmount(Number(order?.paidAmount || 0));
      if (!order || legacyPaid <= 0) return legacyPaid;
      // Orders created outside the ledger (legacy rows or seeds) carry their
      // already-collected amount into the first ledger write as an explicit
      // opening entry. Without this the new entry would replace the historical
      // balance instead of adding to it.
      const opening = repository.create({
        tenantId,
        orderId,
        type: 'payment',
        amount: legacyPaid,
        proofFileId: null,
        proofContentType: null,
        proofSizeBytes: null,
        previousPaymentStatus: 'unpaid',
        newPaymentStatus: order.paymentStatus,
        reason: 'Opening balance carried from the legacy paid amount',
        actorId: null,
        actorType: 'system',
        idempotencyKey: null,
        metadata: { legacyOpeningBalance: true },
        createdAt: order.createdAt || new Date(),
      });
      await repository.save(opening);
      return legacyPaid;
    }
    return this.roundAmount(
      rows.reduce(
        (total, row) =>
          row.type === 'payment' || row.type === 'reversal'
            ? total + Number(row.amount || 0)
            : total,
        0,
      ),
    );
  }

  private async appendLedgerEvent(
    manager: EntityManager,
    order: Order,
    eventType: string,
    options: {
      previousStatus: string;
      nextStatus: string;
      input: {
        actorId?: string;
        actorType?: string;
        reason?: string;
      };
      now: Date;
      extra: Record<string, unknown>;
    },
  ) {
    const source =
      options.input.actorType === 'customer'
        ? 'telegram'
        : options.input.actorType === 'tenant_user'
          ? 'agent'
          : 'dashboard';
    await this.domainEventService.appendInManager(manager, {
      tenantId: order.tenantId,
      actorId: options.input.actorId,
      actorType: options.input.actorType || 'system',
      entityType: 'order',
      entityId: order.id,
      eventType,
      payload: {
        customerId: order.customerId,
        conversationId: order.conversationId,
        orderNumber: order.orderNumber,
        previousStatus: options.previousStatus,
        status: options.nextStatus,
        reason: options.input.reason,
        source,
        timestamp: options.now.toISOString(),
        field: 'payment',
        ...options.extra,
      },
      source,
    });
  }

  async transitionDelivery(
    tenantId: string,
    orderId: string,
    input: DeliveryTransitionInput & DeliveryFieldUpdates,
  ) {
    return (
      await this.orderRepository.manager.transaction((manager) =>
        this.transitionDeliveryInManager(manager, tenantId, orderId, input),
      )
    ).order;
  }

  async updateDelivery(
    tenantId: string,
    orderId: string,
    input: DeliveryTransitionInput & DeliveryFieldUpdates,
  ) {
    return this.transitionDelivery(tenantId, orderId, input);
  }

  async transitionDeliveryInManager(
    manager: EntityManager,
    tenantId: string,
    orderId: string,
    input: DeliveryTransitionInput & DeliveryFieldUpdates,
  ) {
    const order = await this.lockOrder(manager, tenantId, orderId);
    if (order.status !== 'confirmed')
      throw new BadRequestException(
        'Delivery status requires a confirmed order',
      );
    const statusChanged =
      input.to !== undefined && order.deliveryStatus !== input.to;
    const fieldsChanged =
      input.deliveryAssigneeName !== undefined ||
      input.deliveryAssigneePhone !== undefined ||
      input.deliveryDate !== undefined;
    if (!statusChanged && !fieldsChanged) return { order, changed: false };
    if (statusChanged) {
      if (!DELIVERY_TRANSITIONS[order.deliveryStatus]?.has(input.to!))
        throw new BadRequestException(
          `Invalid delivery transition: ${order.deliveryStatus} -> ${input.to}`,
        );
      if (
        (input.to === 'failed_delivery' || input.to === 'returned') &&
        !input.reason?.trim()
      )
        throw new BadRequestException('A delivery reason is required');
    }
    const previousStatus = order.deliveryStatus;
    const now = input.now || new Date();
    if (statusChanged) {
      order.deliveryStatus = input.to!;
      order.statusHistory = [
        ...(order.statusHistory || []),
        this.history(
          'delivery',
          input.to!,
          previousStatus,
          input as unknown as OrderTransitionInput,
          now,
        ),
      ];
    }
    if (input.deliveryAssigneeName !== undefined)
      order.deliveryAssigneeName = input.deliveryAssigneeName;
    if (input.deliveryAssigneePhone !== undefined)
      order.deliveryAssigneePhone = input.deliveryAssigneePhone;
    if (input.deliveryDate !== undefined)
      order.deliveryDate = input.deliveryDate;
    await manager.getRepository(Order).save(order);
    if (statusChanged)
      await this.appendEvent(
        manager,
        order,
        previousStatus,
        input as unknown as OrderTransitionInput,
        now,
        'delivery',
      );
    return { order, changed: statusChanged || fieldsChanged, previousStatus };
  }

  private async lockOrder(
    manager: EntityManager,
    tenantId: string,
    orderId: string,
  ) {
    const order = await manager.getRepository(Order).findOne({
      where: { id: orderId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async appendEvent(
    manager: EntityManager,
    order: Order,
    previousStatus: string,
    input: OrderTransitionInput,
    now: Date,
    field: 'order' | 'payment' | 'delivery',
    attachmentReference?: string,
    eventTypeOverride?: string,
  ) {
    const eventType =
      eventTypeOverride ||
      (field === 'payment'
        ? 'order.payment_status_changed'
        : field === 'delivery'
          ? 'order.delivery_status_changed'
          : input.to === 'confirmed'
            ? 'order.confirmed'
            : input.to === 'rejected'
              ? 'order.rejected'
              : input.to === 'cancelled'
                ? 'order.cancelled'
                : input.to === 'pending' && previousStatus === 'rejected'
                  ? 'order.rejected_retry'
                  : undefined);
    if (!eventType) return;
    const source =
      input.actorType === 'customer'
        ? 'telegram'
        : input.actorType === 'tenant_user'
          ? 'agent'
          : 'dashboard';
    await this.domainEventService.appendInManager(manager, {
      tenantId: order.tenantId,
      actorId: input.actorId,
      actorType: input.actorType || 'system',
      entityType: 'order',
      entityId: order.id,
      eventType,
      payload: {
        customerId: order.customerId,
        orderNumber: order.orderNumber,
        previousStatus,
        status:
          field === 'order'
            ? order.status
            : field === 'payment'
              ? order.paymentStatus
              : order.deliveryStatus,
        reason: input.reason,
        attachmentReference,
        source,
        timestamp: now.toISOString(),
        field,
      },
      source,
    });
  }

  private async expiryHours(
    manager: EntityManager,
    tenantId: string,
    key: 'pendingPayment' | 'rejected',
  ) {
    const tenant = await manager
      .getRepository(Tenant)
      .findOneBy({ id: tenantId });
    const configured = Number(tenant?.orderExpirySettings?.[key]);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : key === 'pendingPayment'
        ? 2
        : 12;
  }

  private async retryLimit(manager: EntityManager, tenantId: string) {
    const tenant = await manager
      .getRepository(Tenant)
      .findOneBy({ id: tenantId });
    const configured = Number(tenant?.orderExpirySettings?.rejectedRetryMax);
    return Number.isInteger(configured) && configured >= 0 ? configured : 3;
  }

  private retryCount(order: Order) {
    return (order.statusHistory || []).filter(
      (entry) =>
        entry.field === 'order' &&
        entry.previousStatus === 'rejected' &&
        entry.status === 'pending' &&
        entry.actorType === 'customer',
    ).length;
  }

  private history(
    field: 'order' | 'payment' | 'delivery',
    status: string,
    previousStatus: string,
    input: OrderTransitionInput,
    now: Date,
    attachmentReference?: string,
    event?: string,
  ) {
    return {
      field,
      status,
      previousStatus,
      actorId: input.actorId,
      actorType: input.actorType || 'system',
      actorName: input.actorName ?? null,
      actorAvatarUrl: input.actorAvatarUrl ?? null,
      reason: input.reason,
      attachmentReference,
      event,
      timestamp: now.toISOString(),
    };
  }
}
