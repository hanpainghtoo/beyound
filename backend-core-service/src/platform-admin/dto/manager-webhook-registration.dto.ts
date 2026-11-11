import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ManagerWebhookRegistrationDto {
  @ApiPropertyOptional({
    description:
      'Public HTTPS URL where Telegram sends manager bot updates. Falls back to TELEGRAM_MANAGER_WEBHOOK_URL env var.',
    example: 'https://example.com/webhooks/telegram/manager',
  })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({
    description:
      'Secret token for X-Telegram-Bot-Api-Secret-Token header validation. Falls back to TELEGRAM_MANAGER_WEBHOOK_SECRET env var.',
    example: 'qF3mX8pL2zR5vN7b',
  })
  @IsOptional()
  @IsString()
  secretToken?: string;
}
