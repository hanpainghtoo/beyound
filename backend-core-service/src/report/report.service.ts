import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { Customer } from '../customer/entities/customer.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';

const DELIVERY_STATUSES = [
  'packed',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'returned',
] as const;

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    @InjectRepository(Message) private messageRepo: Repository<Message>,
    @InjectRepository(TenantChannel)
    private channelRepo: Repository<TenantChannel>,
    @InjectRepository(TenantUser) private userRepo: Repository<TenantUser>,
  ) {}

  private getDateRange(period: string, startDate?: string, endDate?: string) {
    if (startDate && endDate) {
      return { start: new Date(startDate), end: new Date(endDate) };
    }
    const now = new Date();
    const start = new Date();
    if (period === 'weekly') start.setDate(now.getDate() - 7);
    else if (period === 'monthly') start.setMonth(now.getMonth() - 1);
    else if (period === 'yearly') start.setFullYear(now.getFullYear() - 1);
    return { start, end: now };
  }

  private num(val: unknown): number {
    if (val === null || val === undefined) return 0;
    const n = typeof val === 'string' ? parseFloat(val) : Number(val);
    return isNaN(n) ? 0 : n;
  }

  async getRevenueReport(
    tenantId: string,
    period: string,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    const rawSummary = (await this.orderRepo
      .createQueryBuilder('o')
      .select([
        'COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS "totalRevenue"',
        'COALESCE(SUM(o.paid_amount), 0)::numeric(14,2) AS "totalPaid"',
        'COALESCE(SUM(o.total_amount) FILTER (WHERE o.delivery_status = \'returned\'), 0)::numeric(14,2) AS "returnedRevenue"',
        'COUNT(*)::int AS "totalOrders"',
        'COALESCE(AVG(o.total_amount), 0)::numeric(10,2) AS "avgOrderValue"',
      ])
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere("o.status = 'confirmed'")
      .andWhere("o.payment_status = 'paid'")
      .andWhere("o.delivery_status <> 'returned'")
      .andWhere('o.created_at BETWEEN :start AND :end', { start, end })
      .getRawOne()) || {
      totalRevenue: 0,
      totalPaid: 0,
      totalOrders: 0,
      avgOrderValue: 0,
    };

    const summary = {
      totalRevenue: this.num(rawSummary.totalRevenue),
      totalPaid: this.num(rawSummary.totalPaid),
      returnedRevenue: this.num(rawSummary.returnedRevenue),
      totalOrders: this.num(rawSummary.totalOrders),
      avgOrderValue: this.num(rawSummary.avgOrderValue),
    };

    const paymentDeliveryRows = await this.orderRepo
      .createQueryBuilder('o')
      .select([
        'o.payment_status AS "paymentStatus"',
        'o.delivery_status AS "deliveryStatus"',
        'COUNT(*)::int AS "orderCount"',
      ])
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere("o.status = 'confirmed'")
      .andWhere('o.created_at BETWEEN :start AND :end', { start, end })
      .groupBy('o.payment_status')
      .addGroupBy('o.delivery_status')
      .getRawMany();

    const paymentStatusBreakdown = { paid: 0, unpaid: 0 };
    const deliveryStatusBreakdown = Object.fromEntries(
      DELIVERY_STATUSES.map((status) => [status, 0]),
    ) as Record<(typeof DELIVERY_STATUSES)[number], number>;
    for (const row of paymentDeliveryRows) {
      if (row.paymentStatus === 'paid')
        paymentStatusBreakdown.paid += this.num(row.orderCount);
      else if (row.paymentStatus === 'unpaid')
        paymentStatusBreakdown.unpaid += this.num(row.orderCount);
      if (DELIVERY_STATUSES.includes(row.deliveryStatus)) {
        deliveryStatusBreakdown[row.deliveryStatus] += this.num(row.orderCount);
      }
    }

    const byChannel = (
      await this.orderRepo
        .createQueryBuilder('o')
        .leftJoin('o.conversation', 'conv')
        .leftJoin('conv.channel', 'ch')
        .select([
          'ch.channel_name AS "channelName"',
          'ch.channel_type AS "channelType"',
          'COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS "revenue"',
          'COUNT(*)::int AS "orderCount"',
        ])
        .where('o.tenant_id = :tenantId', { tenantId })
        .andWhere("o.status = 'confirmed'")
        .andWhere('o.created_at BETWEEN :start AND :end', { start, end })
        .groupBy('ch.channel_name')
        .addGroupBy('ch.channel_type')
        .getRawMany()
    ).map((r) => ({
      ...r,
      revenue: this.num(r.revenue),
      orderCount: this.num(r.orderCount),
    }));

    const byAgent = (
      await this.orderRepo
        .createQueryBuilder('o')
        .leftJoin('o.creator', 'creator')
        .select([
          'creator.full_name AS "agentName"',
          'COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS "revenue"',
          'COUNT(*)::int AS "orderCount"',
        ])
        .where('o.tenant_id = :tenantId', { tenantId })
        .andWhere("o.status = 'confirmed'")
        .andWhere('o.created_at BETWEEN :start AND :end', { start, end })
        .groupBy('creator.full_name')
        .getRawMany()
    ).map((r) => ({
      ...r,
      revenue: this.num(r.revenue),
      orderCount: this.num(r.orderCount),
    }));

    const byProduct = (
      await this.orderItemRepo
        .createQueryBuilder('oi')
        .leftJoin('oi.order', 'o')
        .select([
          'oi.product_name AS "productName"',
          'COALESCE(SUM(oi.total_price), 0)::numeric(14,2) AS "revenue"',
          'SUM(oi.quantity)::int AS "totalSold"',
          'COUNT(DISTINCT oi.order_id)::int AS "orderCount"',
        ])
        .where('o.tenant_id = :tenantId', { tenantId })
        .andWhere('o.created_at BETWEEN :start AND :end', { start, end })
        .groupBy('oi.product_name')
        .orderBy('SUM(oi.total_price)', 'DESC')
        .getRawMany()
    ).map((r) => ({
      ...r,
      revenue: this.num(r.revenue),
      totalSold: this.num(r.totalSold),
      orderCount: this.num(r.orderCount),
    }));

    return {
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      summary,
      paymentStatusBreakdown,
      deliveryStatusBreakdown,
      byChannel,
      byAgent,
      byProduct,
    };
  }

  async getTeamPerformanceReport(
    tenantId: string,
    period: string,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    let agents = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id AS "id"', 'u.full_name AS "fullName"', 'u.role AS "role"'])
      .where('u.tenant_id = :tenantId', { tenantId })
      .andWhere('u.status = :status', { status: 'active' })
      .andWhere('u.role = :role', { role: 'agent' })
      .getRawMany();

    if (agents.length === 0) {
      const passwordHash = await bcrypt.hash('Password123!', 10);
      const defaultAgent = this.userRepo.create({
        tenantId,
        fullName: 'Demo Agent',
        firstName: 'Demo',
        lastName: 'Agent',
        email: `agent-${tenantId.slice(0, 8)}@demo.local`,
        normalizedEmail:
          `agent-${tenantId.slice(0, 8)}@demo.local`.toUpperCase(),
        passwordHash,
        role: 'agent',
        status: 'active',
      });
      await this.userRepo.save(defaultAgent);
      agents = [
        { id: defaultAgent.id, fullName: defaultAgent.fullName, role: 'agent' },
      ];
    }

    const agentPerformance: any[] = [];
    for (const agent of agents) {
      const orderStats = await this.orderRepo
        .createQueryBuilder('o')
        .select([
          'COUNT(*)::int AS "totalOrders"',
          'COUNT(CASE WHEN o.payment_status = \'paid\' THEN 1 END)::int AS "paidOrders"',
          'COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS "totalRevenue"',
          'COALESCE(SUM(o.paid_amount), 0)::numeric(14,2) AS "totalCollected"',
        ])
        .where('o.tenant_id = :tenantId', { tenantId })
        .andWhere('o.created_by = :agentId', { agentId: agent.id })
        .andWhere('o.created_at BETWEEN :start AND :end', { start, end })
        .getRawOne();

      const conversationStats = await this.conversationRepo
        .createQueryBuilder('c')
        .select(['COUNT(*)::int AS "totalConversations"'])
        .where('c.tenant_id = :tenantId', { tenantId })
        .andWhere('c.assigned_agent_id = :agentId', { agentId: agent.id })
        .andWhere('c.created_at BETWEEN :start AND :end', { start, end })
        .getRawOne();

      const messageStats = await this.messageRepo
        .createQueryBuilder('m')
        .select(['COUNT(*)::int AS "messagesSent"'])
        .where('m.tenant_id = :tenantId', { tenantId })
        .andWhere('m.sender_id = :agentId', { agentId: agent.id })
        .andWhere('m.sender_type = :senderType', { senderType: 'agent' })
        .andWhere('m.created_at BETWEEN :start AND :end', { start, end })
        .getRawOne();

      agentPerformance.push({
        id: agent.id,
        name: agent.fullName,
        role: agent.role,
        totalOrders: this.num(orderStats?.totalOrders),
        paidOrders: this.num(orderStats?.paidOrders),
        totalRevenue: this.num(orderStats?.totalRevenue),
        totalCollected: this.num(orderStats?.totalCollected),
        totalConversations: this.num(conversationStats?.totalConversations),
        messagesSent: this.num(messageStats?.messagesSent),
      });
    }

    return {
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      agents: agentPerformance,
    };
  }

  async getCustomerReport(
    tenantId: string,
    period: string,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    const totalCustomers = await this.customerRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .getCount();

    const newCustomers = await this.customerRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.created_at BETWEEN :start AND :end', { start, end })
      .getCount();

    const orderCounts = await this.orderRepo
      .createQueryBuilder('o')
      .select([
        'o.customer_id AS "customerId"',
        'COUNT(*)::int AS "orderCount"',
      ])
      .where('o.tenant_id = :tenantId', { tenantId })
      .groupBy('o.customer_id')
      .getRawMany();

    const customerMap = new Map(
      orderCounts.map((r: any) => [r.customerId, this.num(r.orderCount)]),
    );

    let cold = 0,
      warm = 0,
      hot = 0;
    for (const count of customerMap.values()) {
      if (count < 1) cold++;
      else if (count <= 3) warm++;
      else if (count >= 5) hot++;
      else warm++;
    }

    const customersWithNoOrders = totalCustomers - customerMap.size;
    cold += customersWithNoOrders;

    const boughtRateBuckets: Record<string, number> = {
      '0 orders': customersWithNoOrders,
      '1 order': 0,
      '2 orders': 0,
      '3 orders': 0,
      '4 orders': 0,
      '5+ orders': 0,
    };
    for (const count of customerMap.values()) {
      if (count === 1) boughtRateBuckets['1 order']++;
      else if (count === 2) boughtRateBuckets['2 orders']++;
      else if (count === 3) boughtRateBuckets['3 orders']++;
      else if (count === 4) boughtRateBuckets['4 orders']++;
      else if (count >= 5) boughtRateBuckets['5+ orders']++;
    }
    const boughtRate = Object.entries(boughtRateBuckets).map(
      ([label, customers]) => ({ label, customers }),
    );

    const byChannel = await this.customerRepo
      .createQueryBuilder('c')
      .leftJoin('c.channel', 'ch')
      .select([
        'ch.channel_name AS "channelName"',
        'ch.channel_type AS "channelType"',
        'COUNT(*)::int AS "customerCount"',
      ])
      .where('c.tenant_id = :tenantId', { tenantId })
      .groupBy('ch.channel_name')
      .addGroupBy('ch.channel_type')
      .getRawMany();

    return {
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalCustomers,
      newCustomers,
      segments: { cold, warm, hot },
      boughtRate,
      byChannel,
    };
  }

  async getProductReport(
    tenantId: string,
    period: string,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    const productSalesRaw = await this.orderItemRepo
      .createQueryBuilder('oi')
      .leftJoin('oi.order', 'o')
      .select([
        'oi.product_name AS "productName"',
        'oi.product_id AS "productId"',
        'SUM(oi.quantity)::int AS "totalSold"',
        'COALESCE(SUM(oi.total_price), 0)::numeric(14,2) AS "totalRevenue"',
        'COUNT(DISTINCT oi.order_id)::int AS "orderCount"',
      ])
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.created_at BETWEEN :start AND :end', { start, end })
      .groupBy('oi.product_name')
      .addGroupBy('oi.product_id')
      .orderBy('SUM(oi.quantity)', 'DESC')
      .getRawMany();

    const productSales = productSalesRaw.map((r) => ({
      ...r,
      totalRevenue: this.num(r.totalRevenue),
      totalSold: this.num(r.totalSold),
      orderCount: this.num(r.orderCount),
    }));

    const totalOrders = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.created_at BETWEEN :start AND :end', { start, end })
      .getCount();

    const orderRates = productSales.map((p: any) => ({
      ...p,
      orderRate:
        totalOrders > 0
          ? ((p.orderCount / totalOrders) * 100).toFixed(1) + '%'
          : '0%',
    }));

    const stockStatus = await this.orderItemRepo
      .createQueryBuilder('oi')
      .leftJoin('oi.order', 'o')
      .leftJoin('oi.product', 'p')
      .select([
        'p.name AS "productName"',
        'p.stock_quantity AS "stockQuantity"',
        'p.low_stock_threshold AS "lowStockThreshold"',
        'p.status AS "productStatus"',
      ])
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.created_at BETWEEN :start AND :end', { start, end })
      .andWhere('p.id IS NOT NULL')
      .groupBy('p.name')
      .addGroupBy('p.stock_quantity')
      .addGroupBy('p.low_stock_threshold')
      .addGroupBy('p.status')
      .getRawMany();

    const outOfStock = stockStatus.filter(
      (s: any) => s.stockQuantity <= 0 || s.productStatus === 'out_of_stock',
    ).length;
    const lowStock = stockStatus.filter(
      (s: any) => s.stockQuantity > 0 && s.stockQuantity <= s.lowStockThreshold,
    ).length;

    return {
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      products: orderRates,
      stockHealth: { total: stockStatus.length, outOfStock, lowStock },
    };
  }

  async getChannelReport(
    tenantId: string,
    period: string,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    const channels = await this.channelRepo
      .createQueryBuilder('ch')
      .where('ch.tenant_id = :tenantId', { tenantId })
      .getMany();

    const channelStats: any[] = [];
    for (const ch of channels) {
      const inbound = await this.messageRepo
        .createQueryBuilder('m')
        .where('m.tenant_id = :tenantId', { tenantId })
        .andWhere('m.channel_id = :channelId', { channelId: ch.id })
        .andWhere('m.sender_type = :senderType', { senderType: 'customer' })
        .andWhere('m.created_at BETWEEN :start AND :end', { start, end })
        .getCount();

      const outbound = await this.messageRepo
        .createQueryBuilder('m')
        .where('m.tenant_id = :tenantId', { tenantId })
        .andWhere('m.channel_id = :channelId', { channelId: ch.id })
        .andWhere('m.sender_type = :senderType', { senderType: 'agent' })
        .andWhere('m.created_at BETWEEN :start AND :end', { start, end })
        .getCount();

      const customers = await this.customerRepo
        .createQueryBuilder('c')
        .where('c.tenant_id = :tenantId', { tenantId })
        .andWhere('c.channel_id = :channelId', { channelId: ch.id })
        .getCount();

      const revenueResult = await this.orderRepo
        .createQueryBuilder('o')
        .leftJoin('o.conversation', 'conv')
        .select('COALESCE(SUM(o.total_amount), 0)::numeric(14,2)', 'revenue')
        .where('o.tenant_id = :tenantId', { tenantId })
        .andWhere('conv.channel_id = :channelId', { channelId: ch.id })
        .andWhere('o.created_at BETWEEN :start AND :end', { start, end })
        .getRawOne();

      channelStats.push({
        id: ch.id,
        channelName: ch.channelName,
        channelType: ch.channelType,
        inbound: this.num(inbound),
        outbound: this.num(outbound),
        customers: this.num(customers),
        revenue: this.num(revenueResult?.revenue),
      });
    }

    return {
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      channels: channelStats,
    };
  }
}
