import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { OrderTransitionService } from './order-transition.service';
import { ChannelAdapterService } from '../channel-adapter/channel-adapter.service';

@Injectable()
export class OrderExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpiryWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private overdueOrders = 0;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(TenantChannel)
    private readonly channelRepository: Repository<TenantChannel>,
    private readonly transitionService: OrderTransitionService,
    private readonly channelAdapter: ChannelAdapterService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runScheduled(), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(now = new Date()) {
    const expired = await this.orderRepository.manager.transaction(
      async (manager) => {
        const candidates = await manager
          .getRepository(Order)
          .createQueryBuilder('order')
          .where('order.expires_at IS NOT NULL')
          .andWhere('order.expires_at <= :now', { now })
          .andWhere('order.status IN (:...statuses)', {
            statuses: ['pending', 'rejected'],
          })
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .take(100)
          .getMany();
        const results: Order[] = [];
        for (const order of candidates) {
          const result = await this.transitionService.transitionInManager(
            manager,
            order.tenantId,
            order.id,
            {
              to: 'cancelled',
              actorType: 'system',
              reason: 'expired',
              expiry: true,
              now,
            },
          );
          if (result.changed) results.push(result.order);
        }
        return results;
      },
    );

    this.overdueOrders = expired.length;
    this.logger.log(
      JSON.stringify({
        event: 'order_expiry_worker_completed',
        expiredCount: expired.length,
        overdueMetric: this.overdueOrders,
        alert: expired.length > 0 ? 'order_expiry_processed' : null,
      }),
    );
    return { expired: expired.length, overdueOrders: this.overdueOrders };
  }

  async runScheduled() {
    try {
      return await this.runOnce();
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'order_expiry_worker_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return { expired: 0, overdueOrders: this.overdueOrders, failed: true };
    }
  }

  getHealth() {
    return { overdueOrders: this.overdueOrders };
  }

  private async notify(order: Order) {
    const customer =
      order.customer ||
      (await this.customerRepository.findOneBy({ id: order.customerId }));
    if (!customer || customer.botBlockedAt) return;
    if (!customer.channelId) return;
    const channel = await this.channelRepository.findOneBy({
      id: customer.channelId,
      channelType: 'telegram',
    });
    if (!channel || !customer.externalId) return;
    try {
      await this.channelAdapter.sendMessage('telegram', {
        channelId: channel.id,
        conversationId: order.conversationId || '',
        recipientId: customer.externalId,
        content: `Order ${order.orderNumber} expired because its payment deadline passed. You can place a new order from the shop.`,
        messageType: 'text',
        metadata: { source: 'order_expiry_worker', orderId: order.id },
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'order_expiry_customer_notification_failed',
          orderId: order.id,
          tenantId: order.tenantId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
