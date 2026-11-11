import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { URL } from 'node:url';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { Product } from '../product/entities/product.entity';
import { Order } from '../order/entities/order.entity';
import { TenantPaymentMethod } from './entities/payment-method.entity';
import { TenantPaymentMethodVersion } from './entities/payment-method-version.entity';
import { PaymentService } from './payment.service';
import { OrderCreationService } from '../order/order-creation.service';
import { MediaLibraryService } from '../media/media-library.service';
import { TenantService } from '../tenant/tenant.service';
import { BackfillPaymentMethodEditPermission1782447700000 } from '../database/migrations/1782447700000-BackfillPaymentMethodEditPermission';

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl)
  throw new Error('TEST_DATABASE_URL is required for integration tests');
const parsedUrl = new URL(rawUrl);
const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
if (!databaseName.toLowerCase().includes('test'))
  throw new Error(
    `Refusing integration tests: database name must contain "test", got "${databaseName}"`,
  );

describe('Step 4 Stage 1 payment screen (real PostgreSQL)', () => {
  let dataSource: DataSource;
  let tenants: Repository<Tenant>;
  let users: Repository<TenantUser>;
  let products: Repository<Product>;
  let channels: Repository<TenantChannel>;
  let customers: Repository<Customer>;
  let orders: Repository<Order>;
  let versions: Repository<TenantPaymentMethodVersion>;
  let methods: Repository<TenantPaymentMethod>;

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
    users = dataSource.getRepository(TenantUser);
    products = dataSource.getRepository(Product);
    channels = dataSource.getRepository(TenantChannel);
    customers = dataSource.getRepository(Customer);
    orders = dataSource.getRepository(Order);
    versions = dataSource.getRepository(TenantPaymentMethodVersion);
    methods = dataSource.getRepository(TenantPaymentMethod);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  async function fixture() {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tenant = await tenants.save(
      tenants.create({
        tenantCode: `pay-${suffix}`,
        companyName: 'Payment test',
        contactEmail: `${suffix}@example.test`,
        status: 'active',
        orderSettings: {},
        orderExpirySettings: {},
      }),
    );
    const role = async (name: string) =>
      users.save(
        users.create({
          tenantId: tenant.id,
          fullName: name,
          firstName: name,
          lastName: 'Test',
          email: `${name.toLowerCase()}-${suffix}@example.test`,
          normalizedEmail: `${name.toLowerCase()}-${suffix}@example.test`,
          passwordHash: 'test',
          role: name.toLowerCase(),
          status: 'active',
          permissions: {},
        }),
      );
    const owner = await role('owner');
    const admin = await role('admin');
    const supervisor = await role('supervisor');
    const agent = await role('agent');
    const channel = await channels.save(
      channels.create({
        tenantId: tenant.id,
        channelType: 'telegram',
        channelName: `pay-${suffix}`,
        configuration: {},
      }),
    );
    const customer = await customers.save(
      customers.create({
        tenantId: tenant.id,
        channelId: channel.id,
        externalId: `customer-${suffix}`,
        fullName: 'Payment customer',
      }),
    );
    const product = await products.save(
      products.create({
        tenantId: tenant.id,
        name: 'Priceable item',
        sku: `p-${suffix}`,
        price: 100,
        stockQuantity: 10,
        trackInventory: true,
        status: 'active',
      }),
    );
    return { tenant, owner, admin, supervisor, agent, product, customer };
  }

  async function cleanup(tenantId: string) {
    await dataSource.query('DELETE FROM orders WHERE tenant_id = $1', [
      tenantId,
    ]);
    await dataSource.query(
      'DELETE FROM tenant_payment_method_versions WHERE tenant_id = $1',
      [tenantId],
    );
    await dataSource.query('DELETE FROM products WHERE tenant_id = $1', [
      tenantId,
    ]);
    await dataSource.query('DELETE FROM customers WHERE tenant_id = $1', [
      tenantId,
    ]);
    await dataSource.query('DELETE FROM tenant_channels WHERE tenant_id = $1', [
      tenantId,
    ]);
    await dataSource.query('DELETE FROM tenant_users WHERE tenant_id = $1', [
      tenantId,
    ]);
    await dataSource.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  }

  function service(
    emailService?: any,
    audit = { logTenantUserAction: jest.fn() },
  ) {
    return new PaymentService(
      versions,
      methods,
      tenants,
      users,
      orders,
      dataSource,
      audit as any,
      { createMany: jest.fn().mockResolvedValue([]) } as any,
      emailService,
    );
  }

  async function publish(
    f: Awaited<ReturnType<typeof fixture>>,
    actor = f.owner,
    inputs = [
      {
        kind: 'kbzpay' as const,
        enabled: true,
        displayOrder: 0,
        accountName: 'Shop',
        accountNumber: '09781234567',
        qrMediaId: 'qr-a',
      },
    ],
  ) {
    return service().saveAndPublish(f.tenant.id, actor.id, actor.role, {
      expectedVersion: null,
      methods: inputs,
    });
  }

  it('allows unlimited database-level methods while rejecting stale publication conflicts', async () => {
    const f = await fixture();
    try {
      const version = await versions.save(
        versions.create({ tenantId: f.tenant.id, version: 1, status: 'draft' }),
      );
      await methods.save(
        methods.create({
          tenantId: f.tenant.id,
          versionId: version.id,
          kind: 'other',
          name: 'One',
          enabled: true,
          displayOrder: 0,
          accountName: 'A',
          accountNumber: '1',
        }),
      );
      await methods.save(
        methods.create({
          tenantId: f.tenant.id,
          versionId: version.id,
          kind: 'other',
          name: 'Two',
          enabled: true,
          displayOrder: 1,
          accountName: 'B',
          accountNumber: '2',
        }),
      );
      await expect(
        methods.save(
          methods.create({
            tenantId: f.tenant.id,
            versionId: version.id,
            kind: 'other',
            name: 'Three',
            enabled: false,
            displayOrder: 2,
            accountName: 'C',
            accountNumber: '3',
          }),
        ),
      ).resolves.toBeDefined();
      await expect(
        methods.save(
          methods.create({
            tenantId: f.tenant.id,
            versionId: version.id,
            kind: 'kbzpay',
            name: 'KBZPay',
            enabled: true,
            displayOrder: 3,
            accountName: 'D',
            accountNumber: '4',
          }),
        ),
      ).resolves.toBeDefined();
      await expect(
        methods.save(
          methods.create({
            tenantId: f.tenant.id,
            versionId: version.id,
            kind: 'kbzpay',
            name: 'KBZPay',
            enabled: true,
            displayOrder: 4,
            accountName: 'E',
            accountNumber: '5',
          }),
        ),
      ).resolves.toBeDefined();
      await expect(
        service().saveAndPublish(f.tenant.id, f.owner.id, 'owner', {
          expectedVersion: null,
          methods: [
            {
              kind: 'kbzpay',
              enabled: true,
              displayOrder: 0,
              accountName: 'Shop',
              accountNumber: '1',
            },
          ],
        }),
      ).rejects.toThrow('config_version_conflict');
    } finally {
      await cleanup(f.tenant.id);
    }
  });

  it('isolates tenants, masks secrets, sends owner email, and preserves snapshots across versions', async () => {
    const a = await fixture();
    const b = await fixture();
    try {
      const email = {
        sendPaymentMethodsPublished: jest.fn().mockResolvedValue(true),
      };
      const audit = { logTenantUserAction: jest.fn() };
      const published = await service(email, audit).saveAndPublish(
        a.tenant.id,
        a.admin.id,
        'admin',
        {
          expectedVersion: null,
          methods: [
            {
              kind: 'kbzpay',
              enabled: true,
              displayOrder: 0,
              accountName: 'Shop',
              accountNumber: '09781234567',
              qrMediaId: 'qr-a',
            },
          ],
        },
      );
      expect(published.methods[0].accountNumber).toBe('09781234567');
      expect(email.sendPaymentMethodsPublished).toHaveBeenCalledWith(
        expect.stringContaining('@example.test'),
        expect.objectContaining({ version: 1 }),
      );
      expect(
        JSON.stringify(audit.logTenantUserAction.mock.calls),
      ).not.toContain('09781234567');
      expect(
        (await service().getSettings(a.tenant.id)).methods[0].accountNumber,
      ).toBe('•••••••4567');
      expect((await service().getSettings(b.tenant.id)).methods).toHaveLength(
        0,
      );
      const order = await orders.save(
        orders.create({
          tenantId: a.tenant.id,
          orderNumber: `o-${Date.now()}`,
          status: 'pending',
          totalAmount: 100,
          currency: 'MMK',
          paymentStatus: 'unpaid',
        }),
      );
      const first = await service().selectMethod(
        a.tenant.id,
        order.id,
        published.methods[0].id,
        undefined,
      );
      expect(first.paymentMethodSnapshot?.accountNumber).toBe('09781234567');
      await products.update({ id: a.product.id }, { price: 999 });
      const next = await service().saveAndPublish(
        a.tenant.id,
        a.owner.id,
        'owner',
        {
          expectedVersion: 1,
          methods: [
            {
              kind: 'kbzpay',
              enabled: true,
              displayOrder: 0,
              accountName: 'New shop',
              accountNumber: '11112222',
              qrMediaId: 'qr-b',
            },
          ],
        },
      );
      const unchanged = await orders.findOneByOrFail({ id: order.id });
      expect(unchanged.paymentTotalSnapshot).toEqual({
        amount: '100.00',
        currency: 'MMK',
      });
      const replaced = await service().selectMethod(
        a.tenant.id,
        order.id,
        next.methods[0].id,
        undefined,
      );
      expect(replaced.paymentMethodSnapshot?.accountNumber).toBe('11112222');
      expect(
        (await service().getSettings(a.tenant.id)).methods[0].accountNumber,
      ).toBe('••••2222');
    } finally {
      await cleanup(a.tenant.id);
      await cleanup(b.tenant.id);
    }
  });

  it('applies the permission matrix and refuses cross-tenant order selection', async () => {
    const f = await fixture();
    const other = await fixture();
    try {
      const inputs = [
        {
          kind: 'kbzpay' as const,
          enabled: true,
          displayOrder: 0,
          accountName: 'Shop',
          accountNumber: '12345678',
        },
      ];
      await expect(
        service().saveAndPublish(f.tenant.id, f.agent.id, 'agent', {
          expectedVersion: null,
          methods: inputs,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service().saveAndPublish(f.tenant.id, f.supervisor.id, 'supervisor', {
          expectedVersion: null,
          methods: inputs,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      f.tenant.orderSettings = { paymentMethodsEdit: true };
      await tenants.save(f.tenant);
      await expect(
        service().saveAndPublish(f.tenant.id, f.supervisor.id, 'supervisor', {
          expectedVersion: null,
          methods: inputs,
        }),
      ).resolves.toBeDefined();
      const otherSettings = await publish(other);
      const order = await orders.save(
        orders.create({
          tenantId: f.tenant.id,
          orderNumber: `o-${Date.now()}`,
          status: 'pending',
          totalAmount: 100,
          currency: 'MMK',
          paymentStatus: 'unpaid',
        }),
      );
      await expect(
        service().selectMethod(
          f.tenant.id,
          order.id,
          otherSettings.methods[0].id,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      const presets = TenantService.prototype.getAvailableRoles.call(
        {},
      ) as Array<{ role: string; permissions: string[] }>;
      expect(
        presets.find((preset) => preset.role === 'owner')?.permissions,
      ).toContain('tenant.payment_methods.edit');
      expect(
        presets.find((preset) => preset.role === 'admin')?.permissions,
      ).toContain('tenant.payment_methods.edit');
      expect(
        presets.find((preset) => preset.role === 'supervisor')?.permissions,
      ).not.toContain('tenant.payment_methods.edit');
      expect(
        presets.find((preset) => preset.role === 'agent')?.permissions,
      ).not.toContain('tenant.payment_methods.edit');
    } finally {
      await cleanup(f.tenant.id);
      await cleanup(other.tenant.id);
    }
  });

  it('protects QR files referenced by enabled methods or order snapshots', async () => {
    const f = await fixture();
    try {
      const published = await publish(f);
      const order = await orders.save(
        orders.create({
          tenantId: f.tenant.id,
          orderNumber: `o-${Date.now()}`,
          status: 'pending',
          totalAmount: 100,
          currency: 'MMK',
          paymentStatus: 'unpaid',
        }),
      );
      await service().selectMethod(
        f.tenant.id,
        order.id,
        published.methods[0].id,
      );
      const media = new MediaLibraryService(
        tenants,
        {} as any,
        orders,
        methods,
      );
      await expect(media.archiveFile(f.tenant.id, 'qr-a')).rejects.toThrow(
        'media_file_referenced_by_payment_method',
      );
      await methods.update(
        { tenantId: f.tenant.id, qrMediaId: 'qr-a' },
        { enabled: false },
      );
      await expect(media.archiveFile(f.tenant.id, 'qr-a')).rejects.toThrow(
        'media_file_referenced_by_payment_snapshot',
      );
    } finally {
      await cleanup(f.tenant.id);
    }
  });

  it('payment_unavailable creates no order when Telegram ordering is enabled', async () => {
    const f = await fixture();
    try {
      const before = await orders.count({ where: { tenantId: f.tenant.id } });
      const creator = new OrderCreationService(
        orders,
        products,
        tenants,
        {
          findOne: jest.fn().mockResolvedValue({
            configuration: {
              telegramShopping: { orderingEnabled: true, currency: 'MMK' },
            },
          }),
        } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { hasEnabledMethod: jest.fn().mockResolvedValue(false) } as any,
      );
      await expect(
        creator.createBotOrder({
          tenantId: f.tenant.id,
          channelId: '00000000-0000-4000-8000-000000000000',
          customerId: f.customer.id,
          telegramIdentity: { userId: '1' },
          idempotencyKey: 'unavailable',
          checkoutSessionVersion: '1',
          productId: f.product.id,
          quantity: 1,
          deliveryData: 'Test address, Yangon',
          paymentMethod: 'online',
          displayedPrice: 100,
        }),
      ).rejects.toThrow('payment_unavailable');
      expect(await orders.count({ where: { tenantId: f.tenant.id } })).toBe(
        before,
      );
    } finally {
      await cleanup(f.tenant.id);
    }
  });

  it('backfills the edit permission onto pre-existing owner and admin rows', async () => {
    const f = await fixture();
    try {
      await users.update({ id: f.owner.id }, { permissions: {} });
      await users.update({ id: f.admin.id }, { permissions: {} });
      const migration = new BackfillPaymentMethodEditPermission1782447700000();
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await migration.up(queryRunner);
      await queryRunner.release();
      const owner = await users.findOneByOrFail({ id: f.owner.id });
      const admin = await users.findOneByOrFail({ id: f.admin.id });
      expect(owner.permissions['tenant.payment_methods.edit']).toBe(true);
      expect(admin.permissions['tenant.payment_methods.edit']).toBe(true);
      const secondQueryRunner = dataSource.createQueryRunner();
      await secondQueryRunner.connect();
      await migration.up(secondQueryRunner);
      await secondQueryRunner.release();
      expect(
        (await users.findOneByOrFail({ id: f.owner.id })).permissions[
          'tenant.payment_methods.edit'
        ],
      ).toBe(true);
    } finally {
      await cleanup(f.tenant.id);
    }
  });
});
