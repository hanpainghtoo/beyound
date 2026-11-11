import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class InitiateTelegramManagedBotDto {
  @ApiProperty({ example: 'Golden Mobile' })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  displayName: string;

  @ApiProperty({ example: 'GoldenMobileMMBot' })
  @IsString()
  @MinLength(5)
  @MaxLength(64)
  @Matches(/^[A-Za-z][A-Za-z0-9_]{3,62}[Bb]ot$/)
  suggestedUsername: string;
}

export class TelegramManagerStartDto {
  @ApiProperty()
  @IsString()
  state: string;

  @ApiProperty()
  @IsString()
  telegramUserId: string;

  @ApiProperty()
  @IsString()
  telegramChatId: string;
}

export class TelegramManagedBotCreatedDto {
  @ApiProperty()
  @IsString()
  telegramUserId: string;

  @ApiProperty()
  @IsString()
  telegramChatId: string;

  @ApiProperty()
  @IsString()
  createdBotId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBotUsername?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBotFirstName?: string;
}
