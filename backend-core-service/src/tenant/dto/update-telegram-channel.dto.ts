import {
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTelegramChannelDto {
  @ApiPropertyOptional({
    description: 'Bot name (channel name)',
    example: 'Golden Mobile Shop',
    minLength: 2,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  channelName?: string;

  @ApiPropertyOptional({
    description: 'Bot display name shown to customers',
    example: 'Golden Mobile',
    minLength: 2,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Provider credentials containing the new bot token',
    example: { botToken: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz' },
  })
  @IsOptional()
  @IsObject()
  credentials?: Record<string, any>;
}
