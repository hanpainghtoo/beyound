import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConversationService } from './conversation.service';

@Injectable()
export class TelegramShoppingActivityScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly conversationService: ConversationService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.conversationService.flushDueTelegramBrowseSummaries();
    }, 15_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
