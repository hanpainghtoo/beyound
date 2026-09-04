import { Body, Controller, Post } from '@nestjs/common';
import {
  RequireServiceAuth,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
} from '@zayos/internal-service-auth';
import { TelegramManagedBotService } from './telegram-managed-bot.service';
import {
  TelegramManagedBotCreatedDto,
  TelegramManagerStartDto,
} from './dto/telegram-managed-bot.dto';

@Controller('internal/telegram/managed-bot')
export class InternalTelegramManagedBotController {
  constructor(
    private readonly telegramManagedBotService: TelegramManagedBotService,
  ) {}

  @Post('start')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.CHANNEL_CREDENTIALS_WRITE],
    allowedCallers: [SERVICE_IDENTITIES.WEBHOOK_HANDLER],
  })
  handleStart(@Body() body: TelegramManagerStartDto) {
    return this.telegramManagedBotService.handleManagerStart(body);
  }

  @Post('created')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.CHANNEL_CREDENTIALS_WRITE],
    allowedCallers: [SERVICE_IDENTITIES.WEBHOOK_HANDLER],
  })
  handleCreated(@Body() body: TelegramManagedBotCreatedDto) {
    return this.telegramManagedBotService.handleManagedBotCreated(body);
  }

  @Post('readiness/retry')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.CHANNEL_CREDENTIALS_WRITE],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  retryReadiness() {
    return this.telegramManagedBotService.retryManagerReadiness();
  }
}
