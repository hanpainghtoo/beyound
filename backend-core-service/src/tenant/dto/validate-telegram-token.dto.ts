import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateTelegramTokenDto {
  @ApiProperty({ description: 'Telegram bot token to validate' })
  @IsString()
  botToken: string;
}
