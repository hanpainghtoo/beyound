import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OrderCreationService } from './order-creation.service';

@Injectable()
export class OrderCreationCleanupWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OrderCreationCleanupWorker.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly orderCreationService: OrderCreationService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runScheduled(), 60 * 60 * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runScheduled() {
    try {
      const result = await this.orderCreationService.removeExpiredIdempotency();
      this.logger.log(
        JSON.stringify({
          event: 'order_creation_idempotency_cleanup',
          deleted: result.affected || 0,
        }),
      );
      return result.affected || 0;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'order_creation_idempotency_cleanup_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return 0;
    }
  }
}
