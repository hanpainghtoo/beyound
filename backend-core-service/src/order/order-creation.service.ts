import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { IsNull, type EntityManager, type Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../product/entities/product.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { OrderCreationIdempotency } from './entities/order-creation-idempotency.entity';
import { OrderNumberService } from './order-number.service';
import { OrderReservationService } from './order-reservation.service';
import { DomainEventService } from '../domain-event/domain-event.service';
import { PaymentService } from '../payment/payment.service';
import { OrderTransitionService } from './order-transition.service';

export type BotOrderCreateInput = {
  tenantId: string;
  channelId: string;
  customerId: string;
  telegramIdentity: { userId: string; chatId?: string };
  idempotencyKey: string;
  checkoutSessionVersion: string;
  productId: string;
  quantity: number;
  deliveryData: string;
  paymentMethod: 'cod' | 'online' | 'bank_transfer';
  displayedPrice: number;
};

export type BotOrderResult =
  | { kind: 'created'; order: Order }
  | { kind: 'price_changed'; currentPrice: number }
  | { kind: 'out_of_stock'; available: number }
  | { kind: 'existing_order'; order: Order };

@Injectable()
export class OrderCreationService {
  private readonly logger = new Logger(OrderCreationService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantChannel)
    private readonly channelRepository: Repository<TenantChannel>,
    @InjectRepository(OrderCreationIdempotency)
    private readonly idempotencyRepository: Repository<OrderCreationIdempotency>,
    private readonly orderNumberService: OrderNumberService,
    private readonly reservationService: OrderReservationService,
    private readonly domainEventService: DomainEventService,
    private readonly transitionService: OrderTransitionService,
    @Optional() private readonly paymentService?: PaymentService,
  ) {}

  async createBotOrder(input: BotOrderCreateInput): Promise<BotOrderResult> {
    const channel = await this.channelRepository.findOne({
      where: { id: input.channelId, tenantId: input.tenantId },
    });
    const settings = (channel?.configuration?.telegramShopping || {}) as Record<
      string,
      any
    >;
    if (settings.orderingEnabled !== true)
      throw new ConflictException('Telegram ordering is disabled');
    if ((settings.currency || 'MMK') !== 'MMK')
      throw new ConflictException('Only MMK ordering is supported');
    if (
      this.paymentService &&
      !(await this.paymentService.hasEnabledMethod(input.tenantId))
    )
      throw new ConflictException('payment_unavailable');
    const product = await this.productRepository.findOne({
      where: { id: input.productId, tenantId: input.tenantId },
    });
    if (!product) throw new ConflictException('Product is unavailable');
    const price = this.money(product.price);
    if (this.money(input.displayedPrice) !== price)
      return { kind: 'price_changed', currentPrice: price / 100 };
    if (!Number.isInteger(input.quantity) || input.quantity < 1)
      throw new ConflictException('Quantity must be positive');
    const deliveryAddress = this.normalizeAddress(input.deliveryData);
    const hash = this.hash({
      ...input,
      deliveryData: deliveryAddress,
      displayedPrice: undefined,
    });
    try {
      return await this.orderRepository.manager.transaction(async (manager) => {
        await this.lockBotCustomer(manager, input.tenantId, input.customerId);
        const existing = await this.claimIdempotency(manager, input, hash);
        if (existing) return existing.result as BotOrderResult;
        const unpaid = await manager.getRepository(Order).findOne({
          where: [
            {
              tenantId: input.tenantId,
              customerId: input.customerId,
              createdBy: IsNull(),
              status: 'pending',
              paymentStatus: 'unpaid',
            },
            {
              tenantId: input.tenantId,
              customerId: input.customerId,
              createdBy: IsNull(),
              status: 'rejected',
              paymentStatus: 'unpaid',
            },
          ],
          order: { createdAt: 'ASC' },
        });
        if (
          unpaid &&
          unpaid.status === 'rejected' &&
          unpaid.expiresAt &&
          unpaid.expiresAt > new Date()
        ) {
          const retryCount = (unpaid.statusHistory || []).filter(
            (entry) =>
              entry.field === 'order' &&
              entry.previousStatus === 'rejected' &&
              entry.status === 'pending' &&
              entry.actorType === 'customer',
          ).length;
          const configuredMax = Number(
            (
              await manager
                .getRepository(Tenant)
                .findOneBy({ id: input.tenantId })
            )?.orderExpirySettings?.rejectedRetryMax,
          );
          const retryMax =
            Number.isInteger(configuredMax) && configuredMax >= 0
              ? configuredMax
              : 3;
          if (retryCount >= retryMax)
            throw new ConflictException(
              'The payment-proof retry limit has been reached',
            );
          return this.persistResult(manager, input, hash, {
            kind: 'existing_order',
            order: unpaid,
          });
        }
        if (unpaid && unpaid.status === 'pending') {
          return this.persistResult(manager, input, hash, {
            kind: 'existing_order',
            order: unpaid,
          });
        }
        const available = await this.available(
          manager,
          product,
          input.tenantId,
        );
        if (product.trackInventory && available < input.quantity) {
          return this.persistResult(manager, input, hash, {
            kind: 'out_of_stock',
            available,
          });
        }
        const order = await this.createManaged(manager, {
          tenantId: input.tenantId,
          customerId: input.customerId,
          channelId: input.channelId,
          product,
          quantity: input.quantity,
          deliveryData: deliveryAddress,
          paymentMethod: input.paymentMethod,
          actorId: undefined,
        });
        return this.persistResult(manager, input, hash, {
          kind: 'created',
          order,
        });
      });
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        const message = error.message.toLowerCase();
        if (
          message.includes('insufficient inventory') ||
          message.includes('stock')
        ) {
          const current = await this.productRepository.findOne({
            where: { id: input.productId, tenantId: input.tenantId },
          });
          return {
            kind: 'out_of_stock',
            available: current?.trackInventory
              ? Number(current.stockQuantity || 0)
              : Number.MAX_SAFE_INTEGER,
          };
        }
      }
      throw error;
    }
  }

  async createManagedAgentOrder(input: {
    tenantId: string;
    agentId: string;
    customerId: string;
    conversationId?: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice?: number;
      notes?: string;
      variation?: Record<string, any>;
    }>;
    paymentMethod?: string;
    shippingAddress: string;
    attachments?: Record<string, any>[];
    permissionSet?: Record<string, any>;
    reason?: string;
  }): Promise<Order> {
    const result = await this.orderRepository.manager.transaction(
      async (manager) => {
        const tenant = await manager
          .getRepository(Tenant)
          .findOne({ where: { id: input.tenantId } });
        const orderSettings = (tenant?.orderSettings || {}) as {
          inventory?: { enforceOnAgentOrders?: boolean };
        };
        const enforce = orderSettings.inventory?.enforceOnAgentOrders === true;
        const mergedItems = new Map<string, (typeof input.items)[number]>();
        for (const item of input.items) {
          const prior = mergedItems.get(item.productId);
          mergedItems.set(
            item.productId,
            prior
              ? { ...prior, quantity: prior.quantity + item.quantity }
              : { ...item },
          );
        }
        const products = [] as Array<{
          product: Product;
          item: (typeof input.items)[number];
          unitPrice: number;
          allowOvercommit: boolean;
        }>;
        for (const item of [...mergedItems.values()].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        )) {
          const product = await manager.getRepository(Product).findOne({
            where: { id: item.productId, tenantId: input.tenantId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!product)
            throw new ConflictException(`Product ${item.productId} not found`);
          const catalogPrice = this.money(product.price);
          const override =
            item.unitPrice !== undefined &&
            this.money(item.unitPrice) !== catalogPrice;
          if (
            override &&
            !this.allowed(input.permissionSet, 'orders.price.override')
          )
            throw new ConflictException(
              'Price override permission is required',
            );
          if (override)
            this.logger.log(
              JSON.stringify({
                event: 'agent_price_override',
                tenantId: input.tenantId,
                productId: product.id,
                actorId: input.agentId,
                requestedPrice: item.unitPrice,
                catalogPrice: Number(product.price),
                reason: input.reason || null,
              }),
            );
          const available = await this.available(
            manager,
            product,
            input.tenantId,
          );
          let allowOvercommit = false;
          if (product.trackInventory && available < item.quantity) {
            const canOverride = this.allowed(
              input.permissionSet,
              'orders.stock.override',
            );
            this.logger.warn(
              JSON.stringify({
                event: 'agent_insufficient_stock',
                tenantId: input.tenantId,
                productId: product.id,
                actorId: input.agentId,
                available,
                requested: item.quantity,
                blocked: enforce && !canOverride,
              }),
            );
            if (enforce && !canOverride)
              throw new ConflictException('Insufficient inventory');
            allowOvercommit = true;
          }
          products.push({
            product,
            item,
            unitPrice: override ? this.money(item.unitPrice!) : catalogPrice,
            allowOvercommit,
          });
        }
        const cents = products.reduce(
          (sum, x) => sum + x.unitPrice * x.item.quantity,
          0,
        );
        const order = await manager.getRepository(Order).save(
          manager.getRepository(Order).create({
            tenantId: input.tenantId,
            customerId: input.customerId,
            conversationId: input.conversationId,
            orderNumber: await this.orderNumberService.allocate(
              manager,
              input.tenantId,
            ),
            status: 'pending',
            paymentStatus: 'unpaid',
            paymentMethod: input.paymentMethod || 'cod',
            subtotal: cents / 100,
            totalAmount: cents / 100,
            shippingAddress: this.normalizeAddress(input.shippingAddress),
            attachments: input.attachments || [],
            createdBy: input.agentId,
            expiresAt: null,
            statusHistory: [
              {
                field: 'order',
                status: 'pending',
                actorId: input.agentId,
                source: 'agent',
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        );
        for (const x of products) {
          const item = await manager.getRepository(OrderItem).save(
            manager.getRepository(OrderItem).create({
              orderId: order.id,
              productId: x.product.id,
              productName: x.product.name,
              productSku: x.product.sku,
              productSnapshot: {
                productId: x.product.id,
                name: x.product.name,
                sku: x.product.sku,
                barcode: x.product.barcode,
                price: x.product.price,
                status: x.product.status,
              },
              variationSnapshot: x.item.variation || {},
              quantity: x.item.quantity,
              unitPrice: x.unitPrice / 100,
              totalPrice: (x.unitPrice * x.item.quantity) / 100,
              notes: x.item.notes,
            }),
          );
          await this.reservationService.reserve(manager, order, item, {
            allowOvercommit: x.allowOvercommit,
          });
        }
        await this.domainEventService.appendInManager(manager, {
          tenantId: input.tenantId,
          actorId: input.agentId,
          actorType: 'tenant_user',
          entityType: 'order',
          entityId: order.id,
          eventType: 'order.placed',
          payload: {
            customerId: order.customerId,
            orderNumber: order.orderNumber,
            status: order.status,
            totalAmount: order.totalAmount,
            currency: order.currency,
            source: 'agent',
          },
          source: 'agent',
        });
        for (const override of products.filter(
          (x) =>
            x.item.unitPrice !== undefined &&
            this.money(x.item.unitPrice) !== this.money(x.product.price),
        )) {
          await this.domainEventService.appendInManager(manager, {
            tenantId: input.tenantId,
            actorId: input.agentId,
            actorType: 'tenant_user',
            entityType: 'order',
            entityId: order.id,
            eventType: 'order.price_override',
            payload: {
              productId: override.product.id,
              requestedPrice: override.item.unitPrice,
              catalogPrice: Number(override.product.price),
              reason: input.reason || null,
            },
            source: 'agent',
          });
        }
        return {
          order,
          overrides: products
            .filter(
              (x) =>
                x.item.unitPrice !== undefined &&
                this.money(x.item.unitPrice) !== this.money(x.product.price),
            )
            .map((x) => ({
              productId: x.product.id,
              requestedPrice: x.item.unitPrice,
              catalogPrice: Number(x.product.price),
            })),
        };
      },
    );
    return result.order;
  }

  /** Replaces an active unpaid managed order atomically; a failure rolls back both sides. */
  async replaceBotOrder(
    input: BotOrderCreateInput & { existingOrderId: string },
  ): Promise<BotOrderResult> {
    if (
      this.paymentService &&
      !(await this.paymentService.hasEnabledMethod(input.tenantId))
    )
      throw new ConflictException('payment_unavailable');
    const product = await this.productRepository.findOne({
      where: { id: input.productId, tenantId: input.tenantId },
    });
    if (!product) throw new ConflictException('Product is unavailable');
    const deliveryAddress = this.normalizeAddress(input.deliveryData);
    const hash = this.hash({ ...input, deliveryData: deliveryAddress });
    return this.orderRepository.manager.transaction(async (manager) => {
      await this.lockBotCustomer(manager, input.tenantId, input.customerId);
      const existingKey = `telegram-replace-order:${input.tenantId}:${input.customerId}:${input.checkoutSessionVersion}:${input.existingOrderId}`;
      const existingIdempotency = await this.claimIdempotency(
        manager,
        { ...input, idempotencyKey: existingKey },
        hash,
      );
      if (existingIdempotency)
        return existingIdempotency.result as BotOrderResult;
      const old = await manager.getRepository(Order).findOne({
        where: {
          id: input.existingOrderId,
          tenantId: input.tenantId,
          customerId: input.customerId,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!old || !['pending', 'rejected'].includes(old.status))
        throw new ConflictException('Existing order is not replaceable');
      await this.transitionService.transitionInManager(
        manager,
        input.tenantId,
        old.id,
        {
          to: 'cancelled',
          reason: 'replaced',
          actorType: 'customer',
        },
      );
      await manager.getRepository(Product).findOne({
        where: { id: product.id, tenantId: input.tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      const order = await this.createManaged(manager, {
        tenantId: input.tenantId,
        customerId: input.customerId,
        channelId: input.channelId,
        product,
        quantity: input.quantity,
        deliveryData: deliveryAddress,
        paymentMethod: input.paymentMethod,
      });
      const result: BotOrderResult = { kind: 'created', order };
      return this.persistResult(
        manager,
        { ...input, idempotencyKey: existingKey },
        hash,
        result,
      );
    });
  }

  async removeExpiredIdempotency(now = new Date()) {
    return this.idempotencyRepository
      .createQueryBuilder()
      .delete()
      .where('expires_at <= :now', { now })
      .execute();
  }

  private async createManaged(
    manager: EntityManager,
    input: {
      tenantId: string;
      customerId: string;
      channelId: string;
      product: Product;
      quantity: number;
      deliveryData: string;
      paymentMethod: string;
      actorId?: string;
      source?: string;
    },
  ) {
    const tenant = await manager
      .getRepository(Tenant)
      .findOne({ where: { id: input.tenantId } });
    const hours = Number(tenant?.orderExpirySettings?.pendingPayment || 2);
    const now = new Date();
    const order = await manager.getRepository(Order).save(
      manager.getRepository(Order).create({
        tenantId: input.tenantId,
        customerId: input.customerId,
        orderNumber: await this.orderNumberService.allocate(
          manager,
          input.tenantId,
        ),
        status: 'pending',
        paymentStatus: 'unpaid',
        paymentMethod: input.paymentMethod,
        subtotal: (this.money(input.product.price) * input.quantity) / 100,
        totalAmount: (this.money(input.product.price) * input.quantity) / 100,
        currency: 'MMK',
        shippingAddress: this.normalizeAddress(input.deliveryData),
        expiresAt: new Date(now.getTime() + hours * 3600000),
        statusHistory: [
          {
            field: 'order',
            status: 'pending',
            source: 'telegram',
            timestamp: now.toISOString(),
          },
        ],
      }),
    );
    const botItems = [
      { product: input.product, quantity: input.quantity },
    ].sort((a, b) => a.product.id.localeCompare(b.product.id));
    const itemInput = botItems[0];
    const item = await manager.getRepository(OrderItem).save(
      manager.getRepository(OrderItem).create({
        orderId: order.id,
        productId: itemInput.product.id,
        productName: itemInput.product.name,
        productSku: itemInput.product.sku,
        productSnapshot: {
          productId: itemInput.product.id,
          name: itemInput.product.name,
          sku: itemInput.product.sku,
          barcode: itemInput.product.barcode,
          price: itemInput.product.price,
          status: itemInput.product.status,
        },
        quantity: itemInput.quantity,
        unitPrice: Number(itemInput.product.price),
        totalPrice: Number(itemInput.product.price) * itemInput.quantity,
      }),
    );
    await this.reservationService.reserve(manager, order, item);
    await this.domainEventService.appendInManager(manager, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorType: input.actorId ? 'tenant_user' : 'system',
      entityType: 'order',
      entityId: order.id,
      eventType: 'order.placed',
      payload: {
        customerId: order.customerId,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
        currency: order.currency,
        source: input.source || 'telegram',
      },
      source: input.source || 'telegram',
    });
    return order;
  }

  private async claimIdempotency(
    manager: EntityManager,
    input: BotOrderCreateInput,
    hash: string,
  ) {
    const repo = manager.getRepository(OrderCreationIdempotency);
    await repo
      .createQueryBuilder()
      .insert()
      .values({
        tenantId: input.tenantId,
        customerId: input.customerId,
        key: input.idempotencyKey,
        requestHash: hash,
        result: {},
        expiresAt: new Date(Date.now() + 30 * 86400000),
      })
      .orIgnore()
      .execute();
    const row = await repo.findOne({
      where: { tenantId: input.tenantId, key: input.idempotencyKey },
      lock: { mode: 'pessimistic_write' },
    });
    if (!row) throw new ConflictException('Unable to claim idempotency key');
    if (row.requestHash !== hash)
      throw new ConflictException(
        'Idempotency key was reused with a different request',
      );
    return Object.keys(row.result || {}).length ? row : null;
  }

  private async lockBotCustomer(
    manager: EntityManager,
    tenantId: string,
    customerId: string,
  ) {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`commerce:bot-order:${tenantId}:${customerId}`],
    );
  }

  private normalizeAddress(value: string) {
    const address = value?.trim();
    if (!address) throw new ConflictException('Shipping address is required');
    if (address.length > 500)
      throw new ConflictException(
        'Shipping address must be 500 characters or fewer',
      );
    return address;
  }

  private async persistResult(
    manager: EntityManager,
    input: BotOrderCreateInput,
    hash: string,
    result: BotOrderResult,
  ) {
    await manager.getRepository(OrderCreationIdempotency).update(
      { tenantId: input.tenantId, key: input.idempotencyKey },
      {
        requestHash: hash,
        orderId:
          result.kind === 'created' || result.kind === 'existing_order'
            ? result.order.id
            : null,
        result: result as unknown as Record<string, any>,
      },
    );
    return result;
  }

  private async available(
    manager: EntityManager,
    product: Product,
    tenantId: string,
  ) {
    if (!product.trackInventory) return Number.MAX_SAFE_INTEGER;
    // TypeORM exposes raw query rows as any; this query is a scalar aggregate.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const rawRows = await manager.query(
      `SELECT COALESCE(SUM(quantity), 0) AS quantity FROM order_item_reservations WHERE tenant_id = $1 AND product_id = $2 AND state = 'active'`,
      [tenantId, product.id],
    );
    const row = rawRows as unknown as Array<{ quantity?: string | number }>;
    return Math.max(
      Number(product.stockQuantity || 0) - Number(row[0]?.quantity || 0),
      0,
    );
  }

  private money(value: number | string) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || Math.round(n * 100) !== n * 100)
      throw new ConflictException('Money must have at most two decimals');
    return Math.round(n * 100);
  }
  private hash(value: unknown) {
    return createHash('sha256')
      .update(this.stableSerialize(value))
      .digest('hex');
  }

  private stableSerialize(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
          ([key, item]) =>
            `${JSON.stringify(key)}:${this.stableSerialize(item)}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }
  private allowed(set: Record<string, any> | undefined, permission: string) {
    return (
      set?.all === true || set?.[permission] === true || set?.orders === true
    );
  }
}
