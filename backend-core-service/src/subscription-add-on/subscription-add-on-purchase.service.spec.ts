/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { SubscriptionAddOnPurchaseService } from './subscription-add-on-purchase.service';

type Row = Record<string, any>;

function createHarness() {
  const purchases: Row[] = [];
  const purchaseComponents: Row[] = [];
  const purchaseEvents: Row[] = [];
  const periods: Row[] = [];
  const billingRecords: Row[] = [];
  const products: Row[] = [];
  const productComponents: Row[] = [];
  const entitlements: Row[] = [];

  const store = (rows: Row[], data: any, entityKey: string) => {
    const list = Array.isArray(data) ? data : [data];
    for (const row of list) {
      if (!row.id) row.id = `${entityKey}-${rows.length + 1}`;
      const existing = rows.find((stored) => stored.id === row.id);
      if (existing) Object.assign(existing, row);
      else rows.push(row);
    }
    return data;
  };
  const findOneIn = (rows: Row[], opts?: any) => {
    const where = opts?.where ?? {};
    return (
      rows.find((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      ) ?? null
    );
  };

  const repository = (entityName: string) => ({
    create: jest.fn((data: any) => ({ ...data, __entityName: entityName })),
    save: jest.fn(async (data: any) => {
      if (entityName === 'TenantSubscriptionAddOnPurchase') {
        return store(purchases, data, 'purchase');
      }
      if (entityName === 'TenantSubscriptionAddOnComponent') {
        return store(purchaseComponents, data, 'component');
      }
      if (entityName === 'TenantSubscriptionAddOnPurchaseEvent') {
        return store(purchaseEvents, data, 'event');
      }
      if (entityName === 'TenantBillingRecord') {
        return store(billingRecords, data, 'billing');
      }
      return data;
    }),
    find: jest.fn(async (opts?: any) => {
      const where = opts?.where ?? {};
      return rowsFor(entityName).filter((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      );
    }),
    findOne: jest.fn(async (opts?: any) =>
      findOneIn(rowsFor(entityName), opts),
    ),
  });

  const rowsFor = (entityName: string): Row[] => {
    if (entityName === 'TenantSubscriptionAddOnPurchase') return purchases;
    if (entityName === 'TenantSubscriptionAddOnComponent')
      return purchaseComponents;
    if (entityName === 'TenantSubscriptionAddOnPurchaseEvent')
      return purchaseEvents;
    if (entityName === 'TenantSubscriptionPeriod') return periods;
    if (entityName === 'TenantBillingRecord') return billingRecords;
    if (entityName === 'TenantEntitlement') return entitlements;
    if (entityName === 'SubscriptionAddOnProduct') return products;
    if (entityName === 'SubscriptionAddOnProductComponent')
      return productComponents;
    return [];
  };

  const periodRepository = repository('TenantSubscriptionPeriod');
  const billingRecordRepository = repository('TenantBillingRecord');
  const entitlementRepository = repository('TenantEntitlement');
  const productRepository = repository('SubscriptionAddOnProduct');
  const productComponentRepository = repository(
    'SubscriptionAddOnProductComponent',
  );

  const manager = {
    getRepository: jest.fn((entity: any) => repository(entity.name)),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback(manager)),
  };

  const service = new SubscriptionAddOnPurchaseService(
    repository('TenantSubscriptionAddOnPurchase') as any,
    repository('TenantSubscriptionAddOnComponent') as any,
    repository('TenantSubscriptionAddOnPurchaseEvent') as any,
    periodRepository as any,
    billingRecordRepository as any,
    entitlementRepository as any,
    productRepository as any,
    productComponentRepository as any,
    dataSource as any,
  );

  return {
    service,
    purchases,
    purchaseComponents,
    purchaseEvents,
    periods,
    billingRecords,
    products,
    productComponents,
    entitlements,
  };
}

const NOW = new Date('2026-09-15T00:00:00.000Z');

const activePeriod = {
  id: 'period-1',
  tenantId: 'tenant-1',
  planId: 'plan-1',
  billingRecordId: 'billing-1',
  periodType: 'paid',
  periodStatus: 'active',
  paymentStatus: 'paid',
  adminActivationStatus: 'approved',
  periodStartAt: new Date('2026-09-01T00:00:00.000Z'),
  periodEndAt: new Date('2026-10-01T00:00:00.000Z'),
  monthStartAt: new Date('2026-09-01T00:00:00.000Z'),
  monthEndAt: new Date('2026-10-01T00:00:00.000Z'),
  startOption: 'current_month',
  sequenceNumber: 1,
};

const product = {
  id: 'product-1',
  code: 'message_boost_10000_2000',
  name: 'Message Boost',
  price: 50000,
  currency: 'MMK',
  status: 'active',
  version: 2,
};

const productComponentRows = [
  {
    id: 'pc-1',
    productId: 'product-1',
    componentType: 'inbound_messages',
    quantity: 10000,
    unit: 'messages',
    displayOrder: 0,
  },
  {
    id: 'pc-2',
    productId: 'product-1',
    componentType: 'outbound_messages',
    quantity: 2000,
    unit: 'messages',
    displayOrder: 1,
  },
];

const billingRecord = {
  id: 'billing-1',
  tenantId: 'tenant-1',
  paymentStatus: 'paid',
  amountDue: 50000,
  billingPeriodStart: new Date('2026-09-01'),
  billingPeriodEnd: new Date('2026-09-30'),
  metadata: {
    purchaseRequestType: 'top_up',
    productId: 'product-1',
    productCode: 'message_boost_10000_2000',
    subscriptionPeriodId: 'period-1',
  },
};

describe('SubscriptionAddOnPurchaseService (Phase 4)', () => {
  describe('task 4.10 — active-period-only targeting', () => {
    it('creates a purchase against the resolved active paid period (proactive)', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push(billingRecord);

      const result = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        now: NOW,
      });

      expect(result.id).toBe('purchase-1');
      expect(result.subscriptionPeriodId).toBe('period-1');
      expect(result.paymentStatus).toBe('pending');
      expect(result.purchaseStatus).toBe('pending');
      expect(result.purchasePrice).toBe(50000);
      expect(result.components).toHaveLength(2);
      expect(result.components[0].componentStatus).toBe('pending');
      expect(result.expiresAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(h.purchases).toHaveLength(1);
      expect(h.purchaseComponents).toHaveLength(2);
      expect(
        h.purchaseEvents.find(
          (event) => event.eventType === 'add_on_purchase_created',
        ),
      ).toBeDefined();
    });

    it('creates an issued unpaid invoice and links it to the pending purchase', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);

      const result = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        idempotencyKey: 'topup-invoice-request',
        now: NOW,
      });

      expect(h.billingRecords).toHaveLength(1);
      expect(h.billingRecords[0]).toMatchObject({
        tenantId: 'tenant-1',
        invoiceStatus: 'issued',
        paymentStatus: 'unpaid',
        amountDue: 50000,
        metadata: expect.objectContaining({
          purchaseRequestType: 'top_up',
          productId: 'product-1',
          subscriptionPeriodId: 'period-1',
          idempotencyKey: 'topup-invoice-request',
        }),
      });
      expect(h.billingRecords[0].invoiceNumber).toMatch(
        /^INV-20260915-[A-Z0-9]+$/,
      );
      expect(result.billingRecordId).toBe(h.billingRecords[0].id);
      expect(h.purchases[0].billingRecordId).toBe(h.billingRecords[0].id);
    });

    it('allows a purchase when quota is exhausted (no quota check in the gate)', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push(billingRecord);
      // No quota state is consulted; the purchase succeeds.
      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          now: NOW,
        }),
      ).resolves.toMatchObject({ id: 'purchase-1' });
    });

    it('ignores a client-supplied period that matches the resolution', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push(billingRecord);

      const result = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        requestedPeriodId: 'period-1',
        now: NOW,
      });
      expect(result.subscriptionPeriodId).toBe('period-1');
    });
  });

  describe('task 4.11 — rejections', () => {
    const base = (h: ReturnType<typeof createHarness>) => {
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push(billingRecord);
    };

    it('rejects trial tenants', async () => {
      const h = createHarness();
      base(h);
      h.entitlements.push({
        id: 'ent-1',
        tenantId: 'tenant-1',
        state: 'trial_active',
      });
      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          now: NOW,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'TOPUP_NOT_AVAILABLE_FOR_TRIAL',
        }),
      });
    });

    it('rejects when there is no active paid period', async () => {
      const h = createHarness();
      base(h);
      h.periods.length = 0;
      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          now: NOW,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'SUBSCRIPTION_PERIOD_NOT_ACTIVE',
        }),
      });
    });

    it('rejects a future/upcoming period', async () => {
      const h = createHarness();
      base(h);
      h.periods[0] = { ...activePeriod, periodStatus: 'upcoming' };
      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          now: NOW,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'SUBSCRIPTION_PERIOD_NOT_ACTIVE',
        }),
      });
    });

    it('rejects an expired period', async () => {
      const h = createHarness();
      base(h);
      h.periods[0] = { ...activePeriod, periodStatus: 'expired' };
      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          now: NOW,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'SUBSCRIPTION_PERIOD_NOT_ACTIVE',
        }),
      });
    });

    it('rejects a cancelled period', async () => {
      const h = createHarness();
      base(h);
      h.periods[0] = { ...activePeriod, periodStatus: 'cancelled' };
      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          now: NOW,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'SUBSCRIPTION_PERIOD_NOT_ACTIVE',
        }),
      });
    });

    it('rejects an unpaid active period', async () => {
      const h = createHarness();
      base(h);
      h.periods[0] = { ...activePeriod, paymentStatus: 'pending' };
      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          now: NOW,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'SUBSCRIPTION_PAYMENT_REQUIRED',
        }),
      });
    });

    it('rejects a client-supplied period that does not match the resolution', async () => {
      const h = createHarness();
      base(h);
      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          requestedPeriodId: 'period-999',
          now: NOW,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'TOPUP_NOT_AVAILABLE_FOR_PERIOD',
        }),
      });
    });

    it('rejects an inactive/archived product', async () => {
      const h = createHarness();
      base(h);
      h.products[0] = { ...product, status: 'inactive' };
      await expect(
        h.service.createPurchase('tenant-1', { productId: 'product-1' }),
      ).rejects.toThrow(/published \(active\)/);
    });

    it('rejects a billing record belonging to another tenant', async () => {
      const h = createHarness();
      base(h);
      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          billingRecordId: 'billing-999',
          now: NOW,
        }),
      ).rejects.toThrow(/same tenant/);
    });

    it('rejects an explicitly supplied billing record with the wrong period window', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push({
        ...billingRecord,
        id: 'billing-wrong-window',
        paymentStatus: 'unpaid',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-08-31'),
      });

      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          billingRecordId: 'billing-wrong-window',
          now: NOW,
        }),
      ).rejects.toThrow(/does not cover the target period/);
      expect(h.purchases).toHaveLength(0);
    });

    it('rejects an explicitly supplied non-top-up billing record', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push({
        ...billingRecord,
        id: 'billing-subscription',
        amountDue: product.price,
        metadata: { purchaseRequestType: 'subscription_period' },
      });

      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          billingRecordId: 'billing-subscription',
          now: NOW,
        }),
      ).rejects.toThrow(/not a top-up invoice/);
      expect(h.purchases).toHaveLength(0);
    });

    it('rejects a top-up whose component targets an unlimited base dimension (task 5.13)', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push({
        ...activePeriod,
        quotaSnapshot: {
          messageQuotaMode: 'combined',
          messageLimit: null,
          inboundMessageLimit: null,
          outboundMessageLimit: 5000,
          apiLimit: 20000,
          allowedProviders: ['messenger'],
          durationDays: 30,
          maxChannels: 3,
          storageLimitGb: 1,
          price: 500000,
        },
      });
      h.billingRecords.push(billingRecord);

      await expect(
        h.service.createPurchase('tenant-1', {
          productId: 'product-1',
          now: NOW,
        }),
      ).rejects.toThrow(/unlimited quota dimension/);
      expect(h.purchases).toHaveLength(0);
    });
  });

  describe('task 4.12 — stacking vs idempotency', () => {
    it('creates separate stacking records for repeated same-product purchases', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push(billingRecord);

      await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        idempotencyKey: 'req-1',
        now: NOW,
      });
      await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        idempotencyKey: 'req-2',
        now: NOW,
      });

      expect(h.purchases).toHaveLength(2);
      expect(h.purchaseComponents).toHaveLength(4);
    });

    it('returns the existing result for a retry of the same request', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push(billingRecord);

      const first = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        idempotencyKey: 'same-request',
        now: NOW,
      });
      const second = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        idempotencyKey: 'same-request',
        now: NOW,
      });

      expect(second.id).toBe(first.id);
      expect(h.purchases).toHaveLength(1);
    });
  });

  describe('task 4.13 — no grant before payment, exactly one grant after', () => {
    const confirmHarness = () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push(billingRecord);
      return h;
    };

    it('confirms payment once and activates every component', async () => {
      const h = confirmHarness();
      const created = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        now: NOW,
      });
      h.billingRecords.find(
        (record) => record.id === created.billingRecordId,
      )!.paymentStatus = 'paid';

      const confirmed = await h.service.confirmPurchasePayment(
        'tenant-1',
        'purchase-1',
        { actor: { type: 'platform_admin', id: 'admin-1' }, now: NOW },
      );

      expect(confirmed.paymentStatus).toBe('paid');
      expect(confirmed.purchaseStatus).toBe('active');
      expect(confirmed.effectiveAt).toBeInstanceOf(Date);
      expect(
        confirmed.components.every((c) => c.componentStatus === 'active'),
      ).toBe(true);
      const confirmedEvents = h.purchaseEvents.filter(
        (event) =>
          event.eventType === 'add_on_payment_confirmed' ||
          event.eventType === 'add_on_activated',
      );
      expect(confirmedEvents).toHaveLength(2);
      // The confirm and activate events use distinct derived keys.
      const keys = confirmedEvents.map((event) => event.idempotencyKey);
      expect(new Set(keys).size).toBe(2);
    });

    it('does not grant capacity before payment (components stay pending)', async () => {
      const h = confirmHarness();
      const pending = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        now: NOW,
      });
      expect(pending.purchaseStatus).toBe('pending');
      expect(
        pending.components.every((c) => c.componentStatus === 'pending'),
      ).toBe(true);
    });

    it('is idempotent for a retried confirmation (one grant only)', async () => {
      const h = confirmHarness();
      const created = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        now: NOW,
      });
      h.billingRecords.find(
        (record) => record.id === created.billingRecordId,
      )!.paymentStatus = 'paid';

      const key = 'confirm-key';
      const first = await h.service.confirmPurchasePayment(
        'tenant-1',
        'purchase-1',
        {
          idempotencyKey: key,
          actor: { type: 'platform_admin', id: 'admin-1' },
          now: NOW,
        },
      );
      const second = await h.service.confirmPurchasePayment(
        'tenant-1',
        'purchase-1',
        {
          idempotencyKey: key,
          actor: { type: 'platform_admin', id: 'admin-1' },
          now: NOW,
        },
      );

      expect(second.purchaseStatus).toBe('active');
      expect(first.id).toBe(second.id);
      expect(
        h.purchaseEvents.filter(
          (event) => event.eventType === 'add_on_payment_confirmed',
        ),
      ).toHaveLength(1);
    });

    it('rejects confirmation when the billing evidence is not paid', async () => {
      const h = confirmHarness();
      h.billingRecords[0] = { ...billingRecord, paymentStatus: 'unpaid' };
      await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        billingRecordId: 'billing-1',
        now: NOW,
      });

      await expect(
        h.service.confirmPurchasePayment('tenant-1', 'purchase-1'),
      ).rejects.toThrow(/not confirmed/i);
      expect(h.purchases[0].purchaseStatus).toBe('pending');
    });

    it('rejects confirmation after the purchase expiry has passed', async () => {
      const h = confirmHarness();
      await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        now: NOW,
      });
      // The bundle expired before confirmation (month ended) — well before
      // the real wall clock the service uses for the confirmation gate.
      h.purchases[0].expiresAt = new Date('2026-01-01T00:00:00.000Z');

      await expect(
        h.service.confirmPurchasePayment('tenant-1', 'purchase-1'),
      ).rejects.toThrow(/expired at .* before payment confirmation/);
      expect(h.purchases[0].purchaseStatus).toBe('pending');
    });

    it('rejects confirmation of an already-cancelled purchase', async () => {
      const h = confirmHarness();
      await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        now: NOW,
      });
      await h.service.cancelPurchase('tenant-1', 'purchase-1');

      await expect(
        h.service.confirmPurchasePayment('tenant-1', 'purchase-1'),
      ).rejects.toThrow(/only pending purchases can be confirmed/);
    });

    it('never activates a subscription period during confirmation', async () => {
      const h = confirmHarness();
      const created = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        now: NOW,
      });
      h.billingRecords.find(
        (record) => record.id === created.billingRecordId,
      )!.paymentStatus = 'paid';
      await h.service.confirmPurchasePayment('tenant-1', 'purchase-1', {
        actor: { type: 'platform_admin', id: 'admin-1' },
        now: NOW,
      });
      // The period row is untouched by purchase confirmation.
      expect(h.periods[0].periodStatus).toBe('active');
      expect(h.periods[0].paymentStatus).toBe('paid');
    });
  });

  describe('task 4.14 — snapshot immutability', () => {
    it('product edits cannot alter an existing purchase snapshot', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push(billingRecord);

      const created = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        now: NOW,
      });
      // Catalog edit after purchase (Phase 3 would bump version).
      h.products[0] = { ...product, price: 999999, version: 3 };
      h.productComponents[0] = {
        ...h.productComponents[0],
        quantity: 999999,
      };

      const afterEdit = await h.service.getPurchaseById(created.id);
      expect(afterEdit.purchasePrice).toBe(50000);
      expect(afterEdit.components[0].quantity).toBe(10000);
    });
  });

  describe('lifecycle', () => {
    it('cancels only pending purchases and records the event', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push(billingRecord);

      await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        now: NOW,
      });
      const cancelled = await h.service.cancelPurchase(
        'tenant-1',
        'purchase-1',
      );
      expect(cancelled.purchaseStatus).toBe('cancelled');
      expect(
        h.purchaseEvents.some(
          (event) => event.eventType === 'add_on_cancelled',
        ),
      ).toBe(true);
    });

    it('refuses to cancel a paid purchase (no refunds)', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push(billingRecord);

      const created = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        now: NOW,
      });
      h.billingRecords.find(
        (record) => record.id === created.billingRecordId,
      )!.paymentStatus = 'paid';
      await h.service.confirmPurchasePayment('tenant-1', 'purchase-1', {
        now: NOW,
      });
      await expect(
        h.service.cancelPurchase('tenant-1', 'purchase-1'),
      ).rejects.toThrow(/refunds are not supported/);
    });

    it('expires an active purchase idempotently', async () => {
      const h = createHarness();
      h.products.push(product);
      h.productComponents.push(...productComponentRows);
      h.periods.push(activePeriod);
      h.billingRecords.push(billingRecord);

      const created = await h.service.createPurchase('tenant-1', {
        productId: 'product-1',
        now: NOW,
      });
      h.billingRecords.find(
        (record) => record.id === created.billingRecordId,
      )!.paymentStatus = 'paid';
      await h.service.confirmPurchasePayment('tenant-1', 'purchase-1', {
        now: NOW,
      });
      const expired = await h.service.expirePurchase('purchase-1');
      expect(expired.purchaseStatus).toBe('expired');
      expect(
        expired.components.every((c) => c.componentStatus === 'expired'),
      ).toBe(true);
      expect(
        h.purchaseEvents.some((event) => event.eventType === 'add_on_expired'),
      ).toBe(true);
    });
  });
});
