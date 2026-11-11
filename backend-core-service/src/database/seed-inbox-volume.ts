import 'reflect-metadata';
/* eslint-disable @typescript-eslint/no-unsafe-argument --
   Volume seeder writes repository data through dynamic shapes, matching the
   legacy seed.ts helpers. */
import { In } from 'typeorm';

import { AppDataSource } from './data-source';
import { assertDemoSeedAllowed } from '../config/database-safety.util';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Customer } from '../customer/entities/customer.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Order } from '../order/entities/order.entity';
import type {
  DeliveryStatus,
  OrderStatus,
  PaymentStatus,
} from '../order/order-transition.service';

/**
 * Volume seeder for the inbox queue — verification data only.
 *
 * The inbox caps out at showing triage rows the way it does, and its time
 * cursor (`useConversationQueueInfinite`) is the least-exercised code in the
 * workspace. The demo seed creates six hand-built conversations, which cannot
 * exercise paging at all.
 *
 * Deliberately NOT part of `seed:demo`: that seed backs walkthroughs, and
 * 150 generated rows would bury the six curated scenarios (`demo-conv-open-001`
 * and friends) that existing e2e specs assert against.
 *
 * Everything here is deterministic — same rows, same timestamps, every run — so
 * pagination behaves identically across attempts.
 */

const VOLUME_TAG = 'volume-seed';
const DEFAULT_COUNT = 150;
/** Rows per page the inbox requests. Must exceed this for paging to trigger. */
const PAGE_SIZE = 100;

const CHANNELS = ['messenger', 'telegram', 'viber', 'tiktok'] as const;

const STATUSES = [
  'open',
  'pending',
  'pending',
  'open',
  'resolved',
  'closed',
] as const;
const PRIORITIES = ['low', 'normal', 'normal', 'high', 'urgent'] as const;

const CUSTOMER_NAMES = [
  'Aye Chan',
  'Min Htet',
  'Zar Myo',
  'Thiri Win',
  'Kyaw Zin',
  'Hnin Nu',
  'Aung Ko',
  'Mya Than',
  'Nyi Nyi',
  'Phyu May',
  'Tun Tun',
  'Win Hlaing',
];

const SUBJECTS = [
  'Where is my order?',
  'Can I change the delivery address?',
  'Payment not confirmed yet',
  'The charger arrived damaged',
  'Do you have this in black?',
  'Cancel please, ordered by mistake',
  'When will it be delivered?',
  'Is COD available?',
  'Warranty question',
  'Tracking number please',
];

// Simplified commerce model: order status, delivery state, and binary payment
// state are independent. Weight toward `confirmed` so the confirmed-only
// deliveries list and the delivery-state variety stay representative.
const ORDER_STATUSES = [
  'confirmed',
  'confirmed',
  'pending',
  'confirmed',
  'cancelled',
  'confirmed',
  'confirmed',
] as const satisfies readonly OrderStatus[];
const DELIVERY_STATUSES = [
  'packed',
  'out_for_delivery',
  'delivered',
  'packed',
  'failed_delivery',
  'returned',
] as const satisfies readonly DeliveryStatus[];
const PAYMENT_STATUSES = [
  'paid',
  'unpaid',
  'unpaid',
] as const satisfies readonly PaymentStatus[];
const PAYMENT_METHODS = ['cod', 'bank_transfer', 'online'] as const;

/**
 * Timestamps are staggered one minute apart rather than sharing a timestamp.
 *
 * This is the whole point of the script. Rows with an identical `lastMessageAt`
 * are exactly the case where a naive cursor re-requests the same boundary rows
 * on the next page — so if every row here had a distinct timestamp, a
 * duplicated or skipped row after scrolling is a real cursor bug, not a seed
 * artefact.
 */
function buildTimestamps(index: number, now: number) {
  const lastMessageAt = new Date(now - index * 60_000);
  const firstMessageAt = new Date(lastMessageAt.getTime() - 6 * 60 * 60 * 1000);
  const lastCustomerMessageAt = new Date(lastMessageAt.getTime() - 2 * 60_000);
  // A third of rows get an SLA due time in the past so the Overdue filter and
  // the card's danger stripe have something to render.
  const overdue = index % 3 === 0;
  const slaDueAt = new Date(
    lastMessageAt.getTime() + (overdue ? -30 * 60_000 : 90 * 60_000),
  );
  return { firstMessageAt, lastMessageAt, lastCustomerMessageAt, slaDueAt };
}

async function clearPreviousVolumeRows(tenantId: string): Promise<number> {
  const conversations = AppDataSource.getRepository(Conversation);
  const orders = AppDataSource.getRepository(Order);

  // `tags` is jsonb, so containment needs an explicit jsonb operator rather
  // than a plain equality match.
  const previous = await conversations
    .createQueryBuilder('conversation')
    .where('conversation.tenant_id = :tenantId', { tenantId })
    .andWhere('conversation.tags @> :tag::jsonb', {
      tag: JSON.stringify([VOLUME_TAG]),
    })
    .getMany();

  const ids = previous.map((row) => row.id);
  if (ids.length === 0) return 0;

  // Orders carry a conversation_id but no cascade, so they go first.
  for (const id of ids) {
    await orders.delete({ conversationId: id });
  }
  await conversations.delete({ id: In(ids) });

  console.log(
    `[seed-inbox-volume] cleared ${ids.length} previous volume conversation(s)`,
  );
  return ids.length;
}

async function main() {
  assertDemoSeedAllowed();

  const count = Number.parseInt(process.env.INBOX_VOLUME_COUNT ?? '', 10);
  const total = Number.isFinite(count) && count > 0 ? count : DEFAULT_COUNT;
  const now = Date.now();

  await AppDataSource.initialize();
  console.log('[seed-inbox-volume] data source ready');

  try {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { tenantCode: 'KME-DEMO' },
    });
    if (!tenant) {
      throw new Error(
        'Demo tenant KME-DEMO not found. Run `npm run seed:demo` first.',
      );
    }

    const agents = await AppDataSource.getRepository(TenantUser).find({
      where: { tenantId: tenant.id, status: 'active' },
    });
    const channels = await AppDataSource.getRepository(TenantChannel).find({
      where: { tenantId: tenant.id },
    });
    if (channels.length === 0) {
      throw new Error(
        'No tenant channels found. Run `npm run seed:demo` first.',
      );
    }

    const removed = await clearPreviousVolumeRows(tenant.id);
    if (removed === 0) {
      console.log('[seed-inbox-volume] no previous volume rows to clear');
    }

    const customerRepo = AppDataSource.getRepository(Customer);
    const conversationRepo = AppDataSource.getRepository(Conversation);
    const orderRepo = AppDataSource.getRepository(Order);

    // Reuse any existing demo customers rather than duplicating them.
    const customers = await customerRepo.find({
      where: { tenantId: tenant.id },
      take: CUSTOMER_NAMES.length,
    });
    if (customers.length < CUSTOMER_NAMES.length) {
      const missing = CUSTOMER_NAMES.length - customers.length;
      for (let i = 0; i < missing; i += 1) {
        const name =
          CUSTOMER_NAMES[(customers.length + i) % CUSTOMER_NAMES.length];
        const saved = (await customerRepo.save(
          customerRepo.create({
            tenantId: tenant.id,
            fullName: name,
            email: `volume.${String(customers.length + i + 1).padStart(3, '0')}@volume.demo.local`,
            phone: `+95 9 ${String(20000000 + customers.length + i)}`,
            tags: [VOLUME_TAG],
            status: 'active',
            createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
          } as any),
        )) as unknown as Customer;
        customers.push(saved);
      }
    }

    let ordersCreated = 0;
    const created: string[] = [];

    for (let index = 0; index < total; index += 1) {
      const seq = String(index + 1).padStart(4, '0');
      const customer = customers[index % customers.length];
      const channel = channels[index % channels.length];
      const agent = agents.length > 0 ? agents[index % agents.length] : null;
      const timestamps = buildTimestamps(index, now);

      // ~60% unassigned so the Unassigned filter has rows; the rest rotate
      // through the active agents so "Mine" is non-empty too.
      const assigned = index % 5 < 2 ? null : agent;

      // A tenth of rows are VIP so that filter is non-empty.
      const tags = [VOLUME_TAG];
      if (index % 10 === 0) tags.push('vip');
      if (index % 7 === 0) tags.push('follow-up');

      const conversation = (await conversationRepo.save(
        conversationRepo.create({
          tenantId: tenant.id,
          customerId: customer.id,
          channelId: channel.id,
          assignedAgentId: assigned?.id ?? null,
          assignedAt: assigned ? timestamps.lastMessageAt : null,
          conversationId: `volume-conv-${seq}`,
          subject: SUBJECTS[index % SUBJECTS.length],
          status: STATUSES[index % STATUSES.length],
          priority: PRIORITIES[index % PRIORITIES.length],
          channelType: CHANNELS[index % CHANNELS.length],
          tags,
          metadata: {
            source: VOLUME_TAG,
            // Leave a share of rows unread so the unread filter and the card's
            // unread dot have something to show.
            ...(index % 4 === 0 ? {} : { inboxForceUnread: true }),
          },
          ...timestamps,
        } as any),
      )) as unknown as Conversation;
      created.push(conversation.id);

      // Orders on ~70% of rows. Without a linked order the intent classifier
      // cannot return "Payment review" or "Delivery", so those filters — and
      // the card's urgency stripe — would have nothing to act on.
      if (index % 10 < 7) {
        const totalAmount = 45_000 + ((index * 7_919) % 900_000);
        const orderStatus = ORDER_STATUSES[index % ORDER_STATUSES.length];
        // Delivery state is only meaningful once confirmed; everything else
        // stays at the column default so the delivery badge cannot lie.
        const deliveryStatus =
          orderStatus === 'confirmed'
            ? DELIVERY_STATUSES[index % DELIVERY_STATUSES.length]
            : 'packed';
        const paymentStatus =
          orderStatus === 'confirmed'
            ? PAYMENT_STATUSES[index % PAYMENT_STATUSES.length]
            : 'unpaid';
        await orderRepo.save(
          orderRepo.create({
            tenantId: tenant.id,
            customerId: customer.id,
            conversationId: conversation.id,
            orderNumber: `VOL-${seq}`,
            status: orderStatus,
            deliveryStatus,
            paymentStatus,
            paymentMethod: PAYMENT_METHODS[index % PAYMENT_METHODS.length],
            subtotal: totalAmount,
            taxAmount: 0,
            discountAmount: 0,
            shippingFee: 3_000,
            totalAmount,
            paidAmount: paymentStatus === 'paid' ? totalAmount : 0,
            currency: 'MMK',
            deliveryAssigneeName: index % 3 === 0 ? 'Aung Delivery' : null,
            createdAt: timestamps.firstMessageAt,
            updatedAt: timestamps.lastMessageAt,
          } as any),
        );
        ordersCreated += 1;
      }
    }

    console.log(
      `[seed-inbox-volume] created ${created.length} conversations and ${ordersCreated} orders for ${tenant.tenantCode}`,
    );
    console.log(
      `[seed-inbox-volume] ${created.length} rows vs page size ${PAGE_SIZE} — scrolling past the first page should load ${Math.max(0, created.length - PAGE_SIZE)} more.`,
    );
    console.log('[seed-inbox-volume] done');
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error) => {
  console.error('[seed-inbox-volume] failed:', error);
  process.exitCode = 1;
});
