import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { URL } from 'node:url';
import { Customer } from '../customer/entities/customer.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { Product } from '../product/entities/product.entity';
import { Order } from './entities/order.entity';
import { OrderItemReservation } from './entities/order-item-reservation.entity';
import { OrderItem } from './entities/order-item.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { DomainEvent } from '../domain-event/entities/domain-event.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { OrderCreationIdempotency } from './entities/order-creation-idempotency.entity';
import { OrderCreationService } from './order-creation.service';
import { OrderNumberService } from './order-number.service';
import { OrderReservationService } from './order-reservation.service';
import { OrderTransitionService } from './order-transition.service';
import { OrderExpiryWorker } from './order-expiry.worker';
import { DomainEventService } from '../domain-event/domain-event.service';
import { OrderCreationCleanupWorker } from './order-creation-cleanup.worker';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import { OrderActivityProjector } from './order-activity.projector';
import { OrderService } from './order.service';

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl)
  throw new Error('TEST_DATABASE_URL is required for integration tests');
const parsedUrl = new URL(rawUrl);
const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
if (!databaseName.toLowerCase().includes('test')) {
  throw new Error(
    `Refusing integration tests: database name must contain "test", got "${databaseName}"`,
  );
}

describe('Stage 2 order infrastructure (real PostgreSQL)', () => {
  let dataSource: DataSource;
  let tenants: Repository<Tenant>;
  let channels: Repository<TenantChannel>;
  let customers: Repository<Customer>;
  let products: Repository<Product>;
  let orders: Repository<Order>;
  let reservations: Repository<OrderItemReservation>;
  let movements: Repository<StockMovement>;
  let events: Repository<DomainEvent>;
  let idempotencies: Repository<OrderCreationIdempotency>;
  let conversations: Repository<Conversation>;
  let messages: Repository<Message>;
  let tenantUsers: Repository<TenantUser>;

  beforeAll(async () => {
    process.env.DB_HOST = parsedUrl.hostname;
    process.env.DB_PORT = parsedUrl.port || '5432';
    process.env.DB_USERNAME = decodeURIComponent(parsedUrl.username);
    process.env.DB_PASSWORD = decodeURIComponent(parsedUrl.password);
    process.env.DB_NAME = databaseName;
    process.env.DB_SYNCHRONIZE = 'false';
    process.env.NODE_ENV = 'test';
    const module = await import('../database/data-source');
    dataSource = module.AppDataSource;
    await dataSource.initialize();
    tenants = dataSource.getRepository(Tenant);
    channels = dataSource.getRepository(TenantChannel);
    customers = dataSource.getRepository(Customer);
    products = dataSource.getRepository(Product);
    orders = dataSource.getRepository(Order);
    reservations = dataSource.getRepository(OrderItemReservation);
    movements = dataSource.getRepository(StockMovement);
    events = dataSource.getRepository(DomainEvent);
    idempotencies = dataSource.getRepository(OrderCreationIdempotency);
    conversations = dataSource.getRepository(Conversation);
    messages = dataSource.getRepository(Message);
    tenantUsers = dataSource.getRepository(TenantUser);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  async function fixture(stock: number, orderingEnabled = true) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tenant = await tenants.save(
      tenants.create({
        tenantCode: `it-${suffix}`,
        companyName: 'Integration tenant',
        contactEmail: `${suffix}@example.test`,
        status: 'active',
        orderSettings: {},
        orderExpirySettings: {},
      }),
    );
    const channel = await channels.save(
      channels.create({
        tenantId: tenant.id,
        channelType: 'telegram',
        channelName: `it-${suffix}`,
        configuration: {
          telegramShopping: {
            shopEnabled: true,
            orderingEnabled,
            currency: 'MMK',
          },
        },
      }),
    );
    const product = await products.save(
      products.create({
        tenantId: tenant.id,
        name: 'Integration product',
        sku: `SKU-${suffix}`,
        price: 100,
        stockQuantity: stock,
        trackInventory: true,
        status: 'active',
      }),
    );
    const agent = await tenantUsers.save(
      tenantUsers.create({
        tenantId: tenant.id,
        fullName: 'Integration agent',
        firstName: 'Integration',
        lastName: 'Agent',
        email: `${suffix}.agent@example.test`,
        normalizedEmail: `${suffix}.agent@example.test`,
        passwordHash: 'test-only',
        role: 'agent',
        status: 'active',
        permissions: { orders: true },
      }),
    );
    const makeCustomer = async () =>
      customers.save(
        customers.create({
          tenantId: tenant.id,
          channelId: channel.id,
          externalId: `tg-${suffix}-${Math.random()}`,
          fullName: 'Integration customer',
        }),
      );
    return { tenant, channel, product, agent, makeCustomer };
  }

  function service() {
    return new OrderCreationService(
      orders,
      products,
      tenants,
      channels,
      idempotencies,
      new OrderNumberService(),
      new OrderReservationService(),
      new DomainEventService(events),
      new OrderTransitionService(
        orders,
        tenants,
        new OrderReservationService(),
        new DomainEventService(events),
      ),
    );
  }

  function botInput(
    f: Awaited<ReturnType<typeof fixture>>,
    customerId: string,
    key: string,
    quantity = 1,
  ) {
    return {
      tenantId: f.tenant.id,
      channelId: f.channel.id,
      customerId,
      telegramIdentity: { userId: customerId, chatId: customerId },
      idempotencyKey: key,
      checkoutSessionVersion: key,
      productId: f.product.id,
      quantity,
      deliveryData: 'Test address, Yangon',
      paymentMethod: 'online' as const,
      displayedPrice: 100,
    };
  }

  async function cleanup(tenantId: string) {
    await dataSource.transaction(async (manager) => {
      await manager.query(
        'DELETE FROM order_payment_proofs WHERE tenant_id = $1',
        [tenantId],
      );
      await manager.query(
        'DELETE FROM order_creation_idempotencies WHERE tenant_id = $1',
        [tenantId],
      );
      await manager.query('DELETE FROM domain_events WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query('DELETE FROM stock_movements WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query(
        'DELETE FROM order_item_reservations WHERE tenant_id = $1',
        [tenantId],
      );
      await manager.query(
        'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = $1)',
        [tenantId],
      );
      await manager.query('DELETE FROM orders WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query('DELETE FROM messages WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query('DELETE FROM conversations WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query(
        'DELETE FROM tenant_order_counters WHERE tenant_id = $1',
        [tenantId],
      );
      await manager.query('DELETE FROM customers WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query('DELETE FROM tenant_users WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query('DELETE FROM products WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query('DELETE FROM tenant_channels WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    });
  }

  async function withFixture<T>(
    stock: number,
    fn: (f: Awaited<ReturnType<typeof fixture>>) => Promise<T>,
    ordering = true,
  ) {
    const f = await fixture(stock, ordering);
    try {
      return await fn(f);
    } finally {
      await cleanup(f.tenant.id);
    }
  }

  it('allows exactly one buyer to reserve the last unit', async () =>
    withFixture(1, async (f) => {
      const a = await f.makeCustomer();
      const b = await f.makeCustomer();
      const creator = service();
      const results = await Promise.all([
        creator.createBotOrder(botInput(f, a.id, 'buyer-a')),
        creator.createBotOrder(botInput(f, b.id, 'buyer-b')),
      ]);
      expect(results.filter((x) => x.kind === 'created')).toHaveLength(1);
      expect(results.filter((x) => x.kind === 'out_of_stock')).toHaveLength(1);
      expect(
        await reservations.count({
          where: { tenantId: f.tenant.id, state: 'active' },
        }),
      ).toBe(1);
    }));

  it('links an uploaded payment proof idempotently on the real disposable database', async () =>
    withFixture(2, async (f) => {
      const customer = await f.makeCustomer();
      const created = await service().createBotOrder(
        botInput(f, customer.id, 'proof-link'),
      );
      if (created.kind !== 'created')
        throw new Error('fixture order was not created');
      const fileId = '11111111-1111-4111-8111-111111111111';
      const media = {
        getDownloadUrl: jest.fn().mockResolvedValue({
          file: {
            id: fileId,
            purpose: 'order-payment-proof',
            uploadedAt: new Date().toISOString(),
            contentType: 'image/png',
            sizeBytes: 1000,
          },
        }),
      };
      const transition = new OrderTransitionService(
        orders,
        tenants,
        new OrderReservationService(),
        new DomainEventService(events),
      );
      const orderService = new OrderService(
        orders,
        dataSource.getRepository(OrderItem),
        products,
        new DomainEventService(events),
        transition,
        media as never,
      );
      await orderService.linkAttachment(f.tenant.id, created.order.id, {
        fileId,
        role: 'payment_proof',
      });
      await orderService.linkAttachment(f.tenant.id, created.order.id, {
        fileId,
        role: 'payment_proof',
      });
      const linked = await orders.findOneByOrFail({ id: created.order.id });
      expect(
        linked.attachments.filter((entry) => entry.fileId === fileId),
      ).toHaveLength(1);
      expect(media.getDownloadUrl).toHaveBeenCalledWith(f.tenant.id, fileId);
    }));

  it('deduplicates double-tap confirmation into one order, reservation, and number', async () =>
    withFixture(2, async (f) => {
      const c = await f.makeCustomer();
      const input = botInput(
        f,
        c.id,
        `telegram-order:${f.tenant.id}:${c.id}:1`,
      );
      const creator = service();
      const results = await Promise.all([
        creator.createBotOrder(input),
        creator.createBotOrder(input),
      ]);
      expect(results.map((x) => x.kind).sort()).toEqual(['created', 'created']);
      expect(
        await orders.count({
          where: { tenantId: f.tenant.id, customerId: c.id },
        }),
      ).toBe(1);
      expect(
        await reservations.count({
          where: { tenantId: f.tenant.id, state: 'active' },
        }),
      ).toBe(1);
      expect(
        new Set(
          results.map((x) => (x.kind === 'created' ? x.order.orderNumber : '')),
        ).size,
      ).toBe(1);
      const created = results.find((x) => x.kind === 'created');
      expect(
        created?.kind === 'created' ? created.order.expiresAt : null,
      ).not.toBeNull();
    }));

  it('rejects same idempotency key with a different request hash', async () =>
    withFixture(2, async (f) => {
      const c = await f.makeCustomer();
      const creator = service();
      const input = botInput(f, c.id, 'same-key');
      await creator.createBotOrder(input);
      await expect(
        creator.createBotOrder({ ...input, quantity: 2 }),
      ).rejects.toBeInstanceOf(ConflictException);
    }));

  it('handles bot versus agent competition for the last unit without negative stock', async () =>
    withFixture(1, async (f) => {
      const botCustomer = await f.makeCustomer();
      const agentCustomer = await f.makeCustomer();
      const creator = service();
      const [bot, agent] = await Promise.allSettled([
        creator.createBotOrder(botInput(f, botCustomer.id, 'bot-race')),
        creator.createManagedAgentOrder({
          tenantId: f.tenant.id,
          agentId: f.agent.id,
          customerId: agentCustomer.id,
          items: [{ productId: f.product.id, quantity: 1 }],
          shippingAddress: 'Test address, Yangon',
          paymentMethod: 'online',
        }),
      ]);
      expect([bot.status, agent.status]).toContain('fulfilled');
      expect(
        Number(
          (await products.findOneByOrFail({ id: f.product.id })).stockQuantity,
        ),
      ).toBeGreaterThanOrEqual(0);
    }));

  it('returns the existing order after an active-unpaid unique race', async () =>
    withFixture(2, async (f) => {
      const c = await f.makeCustomer();
      const creator = service();
      const results = await Promise.all([
        creator.createBotOrder(botInput(f, c.id, 'race-1')),
        creator.createBotOrder(botInput(f, c.id, 'race-2')),
      ]);
      expect(
        results.filter(
          (x) => x.kind === 'created' || x.kind === 'existing_order',
        ),
      ).toHaveLength(2);
      expect(
        await orders.count({
          where: { tenantId: f.tenant.id, customerId: c.id },
        }),
      ).toBe(1);
    }));

  it('rolls back cancel-first replacement on failure and releases old reservation on success', async () =>
    withFixture(2, async (f) => {
      const c = await f.makeCustomer();
      const creator = service();
      const old = await creator.createBotOrder(botInput(f, c.id, 'old'));
      if (old.kind !== 'created')
        throw new Error('fixture order was not created');
      await expect(
        creator.replaceBotOrder({
          ...botInput(f, c.id, 'replace-fail', 99),
          existingOrderId: old.order.id,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect((await orders.findOneByOrFail({ id: old.order.id })).status).toBe(
        'pending',
      );
      const replacement = await creator.replaceBotOrder({
        ...botInput(f, c.id, 'replace-ok'),
        existingOrderId: old.order.id,
      });
      expect(replacement.kind).toBe('created');
      expect((await orders.findOneByOrFail({ id: old.order.id })).status).toBe(
        'cancelled',
      );
      expect(
        await reservations.count({
          where: { orderId: old.order.id, state: 'active' },
        }),
      ).toBe(0);
    }));

  it('does not deadlock when replacement races staff confirmation on the same product', async () =>
    withFixture(2, async (f) => {
      const c = await f.makeCustomer();
      const creator = service();
      const old = await creator.createBotOrder(botInput(f, c.id, 'race-old'));
      if (old.kind !== 'created')
        throw new Error('fixture order was not created');
      const transition = new OrderTransitionService(
        orders,
        tenants,
        new OrderReservationService(),
        new DomainEventService(events),
      );
      const results = await Promise.race([
        Promise.allSettled([
          creator.replaceBotOrder({
            ...botInput(f, c.id, 'race-replace'),
            existingOrderId: old.order.id,
          }),
          transition.transition(f.tenant.id, old.order.id, {
            to: 'confirmed',
            actorType: 'tenant_user',
            actorId: f.agent.id,
          }),
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('replacement/confirmation deadlock')),
            5000,
          ),
        ),
      ]);
      expect(results).toHaveLength(2);
      const finalOld = await orders.findOneByOrFail({ id: old.order.id });
      expect(['cancelled', 'confirmed']).toContain(finalOld.status);
      const currentProduct = await products.findOneByOrFail({
        id: f.product.id,
      });
      expect(Number(currentProduct.stockQuantity)).toBeGreaterThanOrEqual(0);
    }));

  it('returns price_changed and out_of_stock without creating orders', async () =>
    withFixture(0, async (f) => {
      const c = await f.makeCustomer();
      const creator = service();
      expect(
        (
          await creator.createBotOrder({
            ...botInput(f, c.id, 'price'),
            displayedPrice: 99,
          })
        ).kind,
      ).toBe('price_changed');
      expect(
        (await creator.createBotOrder(botInput(f, c.id, 'stock'))).kind,
      ).toBe('out_of_stock');
      expect(await orders.count({ where: { tenantId: f.tenant.id } })).toBe(0);
    }));

  it('releases and converts reservations exactly once', async () =>
    withFixture(2, async (f) => {
      const c = await f.makeCustomer();
      const creator = service();
      const created = await creator.createBotOrder(
        botInput(f, c.id, 'release'),
      );
      if (created.kind !== 'created')
        throw new Error('fixture order was not created');
      const reservationService = new OrderReservationService();
      expect(
        await dataSource.transaction((m) =>
          reservationService.release(m, created.order.id, f.tenant.id, 'test'),
        ),
      ).toBe(1);
      expect(
        await dataSource.transaction((m) =>
          reservationService.release(m, created.order.id, f.tenant.id, 'test'),
        ),
      ).toBe(0);
      const c2 = await f.makeCustomer();
      const converted = await creator.createBotOrder(
        botInput(f, c2.id, 'convert'),
      );
      if (converted.kind !== 'created')
        throw new Error('fixture order was not created');
      await dataSource.transaction((m) =>
        reservationService.convert(m, converted.order),
      );
      await dataSource.transaction((m) =>
        reservationService.convert(m, converted.order),
      );
      expect(
        Number(
          (await products.findOneByOrFail({ id: f.product.id })).stockQuantity,
        ),
      ).toBe(1);
      expect(
        await movements.count({
          where: {
            orderId: converted.order.id,
            reason: 'reservation_converted',
          },
        }),
      ).toBe(1);
    }));

  it('runs two expiry workers safely and expires each due order once', async () =>
    withFixture(3, async (f) => {
      const c = await f.makeCustomer();
      const created = await service().createBotOrder(
        botInput(f, c.id, 'expiry'),
      );
      if (created.kind !== 'created')
        throw new Error('fixture order was not created');
      await orders.update(
        { id: created.order.id },
        { expiresAt: new Date(Date.now() - 1000) },
      );
      const transition = new OrderTransitionService(
        orders,
        tenants,
        new OrderReservationService(),
        new DomainEventService(events),
      );
      const worker = () =>
        new OrderExpiryWorker(orders, customers, channels, transition, {
          sendMessage: jest.fn(),
        } as never);
      await Promise.all([worker().runOnce(), worker().runOnce()]);
      expect(
        (await orders.findOneByOrFail({ id: created.order.id })).status,
      ).toBe('cancelled');
      expect(
        await reservations.count({
          where: { orderId: created.order.id, state: 'active' },
        }),
      ).toBe(0);
    }));

  it('expires only the expired bot order and never an agent order', async () =>
    withFixture(3, async (f) => {
      const botCustomer = await f.makeCustomer();
      const agentCustomer = await f.makeCustomer();
      const creator = service();
      const bot = await creator.createBotOrder(
        botInput(f, botCustomer.id, 'expiry-bot'),
      );
      if (bot.kind !== 'created')
        throw new Error('bot fixture order was not created');
      const agent = await creator.createManagedAgentOrder({
        tenantId: f.tenant.id,
        agentId: f.agent.id,
        customerId: agentCustomer.id,
        items: [{ productId: f.product.id, quantity: 1 }],
        shippingAddress: 'Agent address, Yangon',
        paymentMethod: 'cod',
      });
      expect(agent.expiresAt).toBeNull();
      await orders.update(
        { id: bot.order.id },
        { expiresAt: new Date(Date.now() - 1000) },
      );
      const transition = new OrderTransitionService(
        orders,
        tenants,
        new OrderReservationService(),
        new DomainEventService(events),
      );
      const worker = new OrderExpiryWorker(
        orders,
        customers,
        channels,
        transition,
        { sendMessage: jest.fn() } as never,
      );
      await worker.runOnce();
      expect((await orders.findOneByOrFail({ id: bot.order.id })).status).toBe(
        'cancelled',
      );
      const unchangedAgent = await orders.findOneByOrFail({ id: agent.id });
      expect(unchangedAgent.status).toBe('pending');
      expect(unchangedAgent.expiresAt).toBeNull();
    }));

  it('increments and enforces the rejected-to-pending retry cap in the database', async () =>
    withFixture(3, async (f) => {
      const customer = await f.makeCustomer();
      f.tenant.orderExpirySettings = {
        pendingPayment: 2,
        rejected: 12,
        rejectedRetryMax: 1,
      };
      await tenants.save(f.tenant);
      const creator = service();
      const created = await creator.createBotOrder(
        botInput(f, customer.id, 'retry-cap'),
      );
      if (created.kind !== 'created')
        throw new Error('fixture order was not created');
      const transition = new OrderTransitionService(
        orders,
        tenants,
        new OrderReservationService(),
        new DomainEventService(events),
      );
      await transition.transition(f.tenant.id, created.order.id, {
        to: 'rejected',
        reason: 'proof is wrong',
        actorType: 'tenant_user',
        actorId: f.agent.id,
      });
      await transition.transition(f.tenant.id, created.order.id, {
        to: 'pending',
        actorType: 'customer',
      });
      let retried = await orders.findOneByOrFail({ id: created.order.id });
      expect(retried.status).toBe('pending');
      expect(
        retried.statusHistory.filter(
          (entry) =>
            entry.previousStatus === 'rejected' && entry.status === 'pending',
        ),
      ).toHaveLength(1);
      await transition.transition(f.tenant.id, created.order.id, {
        to: 'rejected',
        reason: 'second proof is wrong',
        actorType: 'tenant_user',
        actorId: f.agent.id,
      });
      await expect(
        transition.transition(f.tenant.id, created.order.id, {
          to: 'pending',
          actorType: 'customer',
        }),
      ).rejects.toThrow('retry limit');
      retried = await orders.findOneByOrFail({ id: created.order.id });
      expect(retried.status).toBe('rejected');
    }));

  it('records Telegram proof submission and clears the signal on staff rejection', async () =>
    withFixture(3, async (f) => {
      const customer = await f.makeCustomer();
      const created = await service().createBotOrder(
        botInput(f, customer.id, 'proof-signal'),
      );
      if (created.kind !== 'created')
        throw new Error('fixture order was not created');
      const transition = new OrderTransitionService(
        orders,
        tenants,
        new OrderReservationService(),
        new DomainEventService(events),
      );
      await transition.submitPaymentProof(
        f.tenant.id,
        created.order.id,
        customer.id,
        {
          fileId: 'storage-proof-real',
          telegramFileId: 'telegram-proof-real',
          sourceMessageId: 'message-real',
          contentType: 'image/jpeg',
        },
      );
      let order = await orders.findOneByOrFail({ id: created.order.id });
      expect(order.paymentSubmittedAt).not.toBeNull();
      expect(order.attachments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fileId: 'storage-proof-real',
            role: 'payment_proof',
            metadata: { telegramFileId: 'telegram-proof-real' },
          }),
        ]),
      );
      expect(
        await events.count({
          where: {
            entityId: order.id,
            eventType: 'order.payment_proof_submitted',
          },
        }),
      ).toBe(1);
      await transition.transition(f.tenant.id, order.id, {
        to: 'rejected',
        reason: 'proof is wrong',
        actorType: 'tenant_user',
        actorId: f.agent.id,
      });
      order = await orders.findOneByOrFail({ id: created.order.id });
      expect(order.paymentSubmittedAt).toBeNull();
    }));

  it('restores confirmed-order stock exactly once when cancelled', async () =>
    withFixture(2, async (f) => {
      const customer = await f.makeCustomer();
      const created = await service().createBotOrder(
        botInput(f, customer.id, 'confirm-cancel'),
      );
      if (created.kind !== 'created')
        throw new Error('fixture order was not created');
      const transition = new OrderTransitionService(
        orders,
        tenants,
        new OrderReservationService(),
        new DomainEventService(events),
      );
      await transition.transition(f.tenant.id, created.order.id, {
        to: 'confirmed',
        actorType: 'tenant_user',
        actorId: f.agent.id,
      });
      expect(
        Number(
          (await products.findOneByOrFail({ id: f.product.id })).stockQuantity,
        ),
      ).toBe(1);
      await transition.transition(f.tenant.id, created.order.id, {
        to: 'cancelled',
        reason: 'customer cancelled',
        actorType: 'tenant_user',
        actorId: f.agent.id,
      });
      expect(
        Number(
          (await products.findOneByOrFail({ id: f.product.id })).stockQuantity,
        ),
      ).toBe(2);
      expect(
        await movements.count({
          where: {
            orderId: created.order.id,
            reason: 'confirmed_order_cancelled_restocked',
          },
        }),
      ).toBe(1);
      await transition.transition(f.tenant.id, created.order.id, {
        to: 'cancelled',
        reason: 'already cancelled',
        actorType: 'tenant_user',
        actorId: f.agent.id,
      });
      expect(
        Number(
          (await products.findOneByOrFail({ id: f.product.id })).stockQuantity,
        ),
      ).toBe(2);
      expect(
        await movements.count({
          where: {
            orderId: created.order.id,
            reason: 'confirmed_order_cancelled_restocked',
          },
        }),
      ).toBe(1);
    }));

  it('allocates unique counters concurrently, including an unseeded tenant', async () =>
    withFixture(2, async (f) => {
      await dataSource.query(
        'DELETE FROM tenant_order_counters WHERE tenant_id = $1',
        [f.tenant.id],
      );
      const numbers = await Promise.all(
        Array.from({ length: 12 }, () =>
          dataSource.transaction((m) =>
            new OrderNumberService().allocate(m, f.tenant.id),
          ),
        ),
      );
      expect(new Set(numbers).size).toBe(12);
    }));

  it('isolates tenant product and idempotency queries', async () => {
    const a = await fixture(1);
    const b = await fixture(1);
    try {
      const customerB = await b.makeCustomer();
      await expect(
        service().createBotOrder({
          ...botInput(b, customerB.id, 'isolation'),
          productId: a.product.id,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      const result = await service().createBotOrder(
        botInput(b, customerB.id, 'isolation'),
      );
      expect(result.kind).toBe('created');
      expect(await orders.count({ where: { tenantId: a.tenant.id } })).toBe(0);
    } finally {
      await cleanup(a.tenant.id);
      await cleanup(b.tenant.id);
    }
  });

  it('warns instead of blocking agent stock shortage and audits price override', async () =>
    withFixture(0, async (f) => {
      const c = await f.makeCustomer();
      const created = await service().createManagedAgentOrder({
        tenantId: f.tenant.id,
        agentId: f.agent.id,
        customerId: c.id,
        items: [{ productId: f.product.id, quantity: 1, unitPrice: 120 }],
        shippingAddress: 'Test address, Yangon',
        paymentMethod: 'online',
        permissionSet: { 'orders.price.override': true },
        reason: 'approved test override',
      });
      expect(created.createdBy).toBe(f.agent.id);
      expect(created.expiresAt).toBeNull();
      expect(
        (
          await events.find({
            where: { tenantId: f.tenant.id, eventType: 'order.price_override' },
          })
        ).length,
      ).toBe(1);
    }));

  it('rejects Telegram creation when orderingEnabled is false and cleans expired idempotency', async () =>
    withFixture(1, async (f) => {
      const disabled = await fixture(1, false);
      const c = await disabled.makeCustomer();
      try {
        await expect(
          service().createBotOrder(botInput(disabled, c.id, 'disabled')),
        ).rejects.toBeInstanceOf(ConflictException);
      } finally {
        await cleanup(disabled.tenant.id);
      }
      const c2 = await f.makeCustomer();
      const created = await service().createBotOrder(
        botInput(f, c2.id, 'retention'),
      );
      if (created.kind !== 'created')
        throw new Error('fixture order was not created');
      await idempotencies.update(
        { tenantId: f.tenant.id, key: 'retention' },
        { expiresAt: new Date(Date.now() - 1000) },
      );
      await new OrderCreationCleanupWorker(service()).runScheduled();
      expect(
        await idempotencies.count({
          where: { tenantId: f.tenant.id, key: 'retention' },
        }),
      ).toBe(0);
    }));

  it('projects order events exactly once, survives replay/races, isolates tenants, and never creates Telegram output', async () => {
    const a = await fixture(2);
    const b = await fixture(2);
    try {
      const customer = await a.makeCustomer();
      const conversation = await conversations.save(
        conversations.create({
          tenantId: a.tenant.id,
          customerId: customer.id,
          channelId: a.channel.id,
          status: 'open',
          metadata: {},
        }),
      );
      await events.save(
        events.create({
          tenantId: a.tenant.id,
          entityType: 'order',
          entityId: 'order-activity-test',
          eventType: 'order.placed',
          source: 'telegram',
          payload: {
            customerId: customer.id,
            orderNumber: 'MM-ORD-TEST',
            source: 'telegram',
          },
          processedAt: null,
        }),
      );
      const websocket = {
        emitNewMessage: jest.fn(),
        emitConversationUpdate: jest.fn(),
      };
      const projector = () =>
        new OrderActivityProjector(
          events,
          customers,
          channels,
          conversations,
          messages,
          websocket as never,
          { sendMessage: jest.fn() } as never,
        );
      await Promise.all([projector().runOnce(), projector().runOnce()]);
      expect(
        await messages.count({
          where: {
            conversationId: conversation.id,
            messageType: 'system_event',
            isInternal: true,
          },
        }),
      ).toBe(1);
      expect(
        await messages.count({
          where: { conversationId: conversation.id, provider: 'telegram' },
        }),
      ).toBe(0);
      expect(websocket.emitNewMessage).toHaveBeenCalledTimes(1);
      expect(websocket.emitConversationUpdate).toHaveBeenCalledTimes(1);
      await projector().runOnce();
      expect(
        await messages.count({
          where: {
            conversationId: conversation.id,
            messageType: 'system_event',
            isInternal: true,
          },
        }),
      ).toBe(1);
      await events.save(
        events.create({
          tenantId: a.tenant.id,
          entityType: 'order',
          entityId: 'payment-submitted',
          eventType: 'order.payment_submitted',
          source: 'telegram',
          payload: {
            customerId: customer.id,
            orderNumber: 'MM-ORD-TEST',
            source: 'telegram',
          },
        }),
      );
      await projector().runOnce();
      const updatedConversation = await conversations.findOneByOrFail({
        id: conversation.id,
      });
      expect(updatedConversation.metadata).toEqual(
        expect.objectContaining({
          shoppingStage: 'payment_submitted',
          needsAttention: true,
          attentionReason: 'order.payment_submitted',
        }),
      );
      await events.save(
        events.create({
          tenantId: a.tenant.id,
          entityType: 'order',
          entityId: 'confirmed',
          eventType: 'order.confirmed',
          source: 'telegram',
          payload: {
            customerId: customer.id,
            orderNumber: 'MM-ORD-TEST',
            source: 'telegram',
          },
        }),
      );
      await projector().runOnce();
      expect(
        (await conversations.findOneByOrFail({ id: conversation.id })).metadata,
      ).toEqual(
        expect.objectContaining({
          shoppingStage: 'confirmed',
          needsAttention: false,
        }),
      );
      const unlinked = await customers.save(
        customers.create({
          tenantId: a.tenant.id,
          channelId: null,
          externalId: 'unlinked',
          fullName: 'Unlinked',
        }),
      );
      await events.save(
        events.create({
          tenantId: a.tenant.id,
          entityType: 'order',
          entityId: 'unlinked-order',
          eventType: 'order.placed',
          source: 'telegram',
          payload: { customerId: unlinked.id },
        }),
      );
      await projector().runOnce();
      expect(
        await messages.count({
          where: {
            tenantId: a.tenant.id,
            messageType: 'system_event',
            isInternal: true,
          },
        }),
      ).toBe(3);
      const other = await b.makeCustomer();
      await events.save(
        events.create({
          tenantId: a.tenant.id,
          entityType: 'order',
          entityId: 'other-tenant-order',
          eventType: 'order.placed',
          source: 'telegram',
          payload: { customerId: other.id },
        }),
      );
      await projector().runOnce();
      expect(await messages.count({ where: { tenantId: b.tenant.id } })).toBe(
        0,
      );
    } finally {
      await cleanup(a.tenant.id);
      await cleanup(b.tenant.id);
    }
  });
});
