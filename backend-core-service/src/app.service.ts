import { Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { EntitlementService } from './entitlement/entitlement.service';
import { SubscriptionPeriodSchedulerService } from './subscription-period/subscription-period-scheduler.service';
import { TelegramManagedBotService } from './tenant/telegram-managed-bot.service';

@Injectable()
export class AppService {
  constructor(
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
    @Optional() private readonly entitlementService?: EntitlementService,
    @Optional()
    private readonly telegramManagedBotService?: TelegramManagedBotService,
    @Optional()
    private readonly subscriptionPeriodScheduler?: SubscriptionPeriodSchedulerService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  getHealth() {
    return {
      service: 'core-api',
      status: 'ok',
      entitlementExpiryScheduler:
        this.entitlementService?.getExpirySchedulerHealth() ?? null,
      subscriptionPeriodScheduler:
        this.subscriptionPeriodScheduler?.getHealth() ?? null,
      telegramManager:
        this.telegramManagedBotService?.getManagerReadiness() ?? null,
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    let database = false;
    try {
      if (this.dataSource?.isInitialized) {
        await this.dataSource.query('SELECT 1');
        database = true;
      }
    } catch {
      database = false;
    }

    return {
      service: 'core-api',
      ready:
        database &&
        !this.entitlementService?.getExpirySchedulerHealth().lastError &&
        !this.subscriptionPeriodScheduler?.getHealth().lastError,
      dependencies: {
        database,
        entitlementExpiryScheduler:
          this.entitlementService?.getExpirySchedulerHealth() ?? null,
        subscriptionPeriodScheduler:
          this.subscriptionPeriodScheduler?.getHealth() ?? null,
        telegramManager:
          this.telegramManagedBotService?.getManagerReadiness() ?? null,
      },
      timestamp: new Date().toISOString(),
    };
  }

  getMetrics() {
    const memory = process.memoryUsage();
    return {
      service: 'core-api',
      uptimeSeconds: process.uptime(),
      memoryBytes: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
      },
      entitlementExpiryScheduler:
        this.entitlementService?.getExpirySchedulerHealth() ?? null,
      subscriptionPeriodScheduler:
        this.subscriptionPeriodScheduler?.getHealth() ?? null,
      timestamp: new Date().toISOString(),
    };
  }
}
