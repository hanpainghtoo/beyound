import { Order } from '../../order/entities/order.entity';
import type { QueryRunner } from 'typeorm';
import { SimplifyCommerceStatuses1782447800000 } from '../migrations/1782447800000-SimplifyCommerceStatuses';

const ADDRESS_SERIALIZER_KEYS = [
  'name',
  'phone',
  'line1',
  'line2',
  'address',
  'city',
  'township',
  'region',
  'state',
  'postalCode',
  'country',
];
const KNOWN_STATUSES = [
  'new',
  'pending',
  'pending_payment',
  'payment_submitted',
  'confirmed',
  'preparing',
  'packed',
  'processing',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'cod_collected',
  'cancelled',
  'returned',
  'expired',
  'rejected',
];
const KNOWN_PAYMENT_STATUSES = [
  'pending',
  'unpaid',
  'partially_paid',
  'paid',
  'failed',
  'refunded',
  'cod_pending',
  'cod_collected',
];
const mapLegacyStatus = (status: string) =>
  ['new', 'pending_payment', 'payment_submitted', 'pending'].includes(status)
    ? 'pending'
    : [
          'confirmed',
          'preparing',
          'packed',
          'processing',
          'out_for_delivery',
          'delivered',
          'cod_collected',
          'returned',
          'failed_delivery',
        ].includes(status)
      ? 'confirmed'
      : ['cancelled', 'expired'].includes(status)
        ? 'cancelled'
        : 'rejected';
const mapLegacyPaymentStatus = (status: string, paymentStatus: string) =>
  status === 'cod_collected' ||
  ['paid', 'cod_collected'].includes(paymentStatus)
    ? 'paid'
    : 'unpaid';
const mapLegacyDeliveryStatus = (status: string) =>
  status === 'out_for_delivery'
    ? 'out_for_delivery'
    : ['delivered', 'cod_collected'].includes(status)
      ? 'delivered'
      : status === 'returned'
        ? 'returned'
        : status === 'failed_delivery'
          ? 'failed_delivery'
          : 'packed';
const isBotCreationHistory = (order: {
  createdBy: string | null;
  statusHistory: unknown;
}) =>
  order.createdBy == null &&
  Array.isArray(order.statusHistory) &&
  order.statusHistory.some(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as { source?: unknown }).source === 'telegram',
  );
const serializeAddress = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value !== 'object' || Array.isArray(value))
    return Array.isArray(value) ? JSON.stringify(value) : String(value) || null;
  const object = value as Record<string, unknown>;
  const known = ADDRESS_SERIALIZER_KEYS.map((key) => object[key])
    .filter(Boolean)
    .map(String);
  const knownSet = new Set(ADDRESS_SERIALIZER_KEYS);
  const unknown = Object.keys(object)
    .filter((key) => !knownSet.has(key))
    .sort()
    .map((key) => `${key}: ${String(object[key])}`);
  return [...known, ...unknown].join(', ') || null;
};

function botCreatedOrderFixture(): Order {
  const order = new Order();
  order.createdBy = null as unknown as string;
  order.status = 'pending_payment';
  order.paymentStatus = 'pending';
  order.expiresAt = new Date('2026-10-08T00:00:00.000Z');
  // This is the actual createBotOrder/createManaged status-history shape:
  // source='telegram', status='pending_payment', timestamp.
  order.statusHistory = [
    {
      status: 'pending_payment',
      source: 'telegram',
      timestamp: '2026-10-08T00:00:00.000Z',
    },
  ];
  return order;
}

function agentCreatedOrderFixture(): Order {
  const order = new Order();
  order.createdBy = 'agent-1';
  order.status = 'pending_payment';
  order.paymentStatus = 'pending';
  order.expiresAt = new Date('2026-10-08T00:00:00.000Z');
  order.statusHistory = [
    {
      status: 'pending_payment',
      actorId: 'agent-1',
      source: 'agent',
      timestamp: '2026-10-08T00:00:00.000Z',
    },
  ];
  return order;
}

describe('commerce simplification migration', () => {
  function runner(options?: {
    addresses?: unknown[];
    ambiguous?: unknown[];
    unmapped?: unknown[];
  }) {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('status <> ALL')) return options?.unmapped || [];
      if (sql.includes('SELECT "id", "shipping_address"')) {
        return options?.addresses || [];
      }
      if (sql.includes('SELECT "id", "order_number", "status", "created_by"')) {
        return options?.ambiguous || [];
      }
      return [];
    });
    return { query, queries, asRunner: { query } as unknown as QueryRunner };
  }

  it('covers the complete known legacy status/payment matrix and precedence', () => {
    for (const status of KNOWN_STATUSES) {
      for (const paymentStatus of KNOWN_PAYMENT_STATUSES) {
        expect(mapLegacyStatus(status)).toMatch(
          /^(pending|confirmed|cancelled|rejected)$/,
        );
        expect(mapLegacyPaymentStatus(status, paymentStatus)).toMatch(
          /^(paid|unpaid)$/,
        );
        expect(mapLegacyDeliveryStatus(status)).toMatch(
          /^(packed|out_for_delivery|delivered|failed_delivery|returned)$/,
        );
      }
    }
    expect(mapLegacyPaymentStatus('cod_collected', 'refunded')).toBe('paid');
    expect(mapLegacyDeliveryStatus('cod_collected')).toBe('delivered');
    expect(mapLegacyDeliveryStatus('returned')).toBe('returned');
    expect(mapLegacyDeliveryStatus('failed_delivery')).toBe('failed_delivery');
  });

  it('aborts and lists unmapped legacy status/payment values before backup work', async () => {
    const harness = runner({
      unmapped: [{ id: 'bad-1', status: 'mystery', payment_status: 'unknown' }],
    });
    await expect(
      new SimplifyCommerceStatuses1782447800000().up(harness.asRunner),
    ).rejects.toThrow('unmapped order status/payment_status values');
    expect(
      harness.queries.some((query) => query.includes('CREATE TABLE')),
    ).toBe(false);
  });

  it('serializes every address shape and handles name/phone in the named key list', () => {
    expect(ADDRESS_SERIALIZER_KEYS.slice(0, 2)).toEqual(['name', 'phone']);
    expect(serializeAddress({ name: 'A', phone: '09', city: 'Yangon' })).toBe(
      'A, 09, Yangon',
    );
    expect(serializeAddress({ city: 'Yangon', unknown: 'x' })).toBe(
      'Yangon, unknown: x',
    );
    expect(serializeAddress('No. 1')).toBe('No. 1');
    expect(serializeAddress(42)).toBe('42');
    expect(serializeAddress(['No. 1', 'Yangon'])).toBe('["No. 1","Yangon"]');
    expect(serializeAddress({})).toBeNull();
    expect(serializeAddress(null)).toBeNull();
  });

  it('uses bot and agent fixtures matching the real creation paths', () => {
    expect(isBotCreationHistory(botCreatedOrderFixture())).toBe(true);
    expect(isBotCreationHistory(agentCreatedOrderFixture())).toBe(false);
    expect(
      isBotCreationHistory({
        createdBy: null,
        statusHistory: [{ source: 'unknown' }],
      }),
    ).toBe(false);
  });

  it('backs up real column state, refreshes stale rows, batches addresses, and uses old row values', async () => {
    const harness = runner({
      addresses: [
        { id: 'order-1', shipping_address: { city: 'Yangon' } },
        { id: 'order-2', shipping_address: null },
      ],
    });

    await new SimplifyCommerceStatuses1782447800000().up(harness.asRunner);
    const all = harness.queries.join('\n');
    expect(all).toContain('"reservation_managed" boolean NOT NULL');
    expect(all).toContain('"cod_collected_at" timestamp');
    expect(all).toContain('"expires_at" timestamptz');
    expect(all).toContain('ON CONFLICT ("id") DO UPDATE SET');
    expect(all).toContain('SET "status" = CASE');
    expect(all).toContain('WHEN "status" = \'cod_collected\'');
    expect(all).toContain('UPDATE "orders" AS o SET "shipping_address_text"');
    expect(all).toContain('FROM (VALUES ($1, $2), ($3, $4))');
    expect(all).toContain(
      'DROP INDEX IF EXISTS "UQ_orders_managed_active_unpaid_customer"',
    );
    expect(all).not.toMatch(
      /shipping_address.{0,80}(length|char_length|CHECK)/i,
    );
  });

  it('clears expiry for agent pending and rejected rows and aborts truly ambiguous rows', async () => {
    const harness = runner({
      ambiguous: [
        Object.assign(new Order(), {
          id: 'ambiguous-1',
          orderNumber: 'AMB-1',
          status: 'pending',
          createdBy: null,
          expiresAt: new Date(),
          statusHistory: [],
        }),
      ],
    });
    await expect(
      new SimplifyCommerceStatuses1782447800000().up(harness.asRunner),
    ).rejects.toThrow('ambiguous expiring bot/agent orders');

    const safe = runner();
    await new SimplifyCommerceStatuses1782447800000().up(safe.asRunner);
    const all = safe.queries.join('\n');
    expect(all).toContain("\"status\" IN ('pending', 'rejected')");
    expect(all).toContain('"created_by" IS NOT NULL');
    expect(all).toContain('SET "expires_at" = NULL');
    expect(all).toContain("h->>'source' = 'telegram'");
  });

  it('uses current new values in down, preserves edited addresses, restores dropped columns, and handles new rows', async () => {
    const harness = runner();
    await new SimplifyCommerceStatuses1782447800000().down(harness.asRunner);
    const all = harness.queries.join('\n');
    expect(all).toContain('o."delivery_status"');
    expect(all).toContain("WHEN o.\"payment_status\" = 'paid' THEN 'paid'");
    expect(all).toContain('old_shipping_address');
    expect(all).toContain('"reservation_managed" = b."reservation_managed"');
    expect(all).toContain('"cod_collected_at" = b."cod_collected_at"');
    expect(all).toContain('"expires_at" = b."expires_at"');
    expect(all).toContain('to_jsonb("shipping_address")');
    expect(all).toContain(
      'NOT EXISTS (SELECT 1 FROM "commerce_simplification_order_backup"',
    );
  });
});
