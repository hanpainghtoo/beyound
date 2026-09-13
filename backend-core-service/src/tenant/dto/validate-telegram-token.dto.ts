import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateTelegramTokenDto {
  @ApiProperty({ description: 'Telegram bot token to validate' })
  @IsString()
  botToken: string;

  @ApiProperty({
    description: 'Expected bot username (without @) to compare against getMe',
    required: false,
  })
  @IsOptional()
  @IsString()
  expectedUsername?: string;
}
