import { IsDateString, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const CONVERSATION_MESSAGES_DEFAULT_LIMIT = 15;
export const CONVERSATION_MESSAGES_MAX_LIMIT = 100;

/**
 * Cursor pagination for one conversation's thread.
 *
 * Newest page first: each page returns messages older than `before`
 * (exclusive), ordered oldest→newest for rendering. `before` is the oldest
 * `createdAt` the client has seen; omit it for the newest page.
 */
export class ConversationMessagesQueryDto {
  @ApiPropertyOptional({
    default: CONVERSATION_MESSAGES_DEFAULT_LIMIT,
    minimum: 1,
    maximum: CONVERSATION_MESSAGES_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(CONVERSATION_MESSAGES_MAX_LIMIT)
  limit?: number = CONVERSATION_MESSAGES_DEFAULT_LIMIT;

  @ApiPropertyOptional({
    description:
      'ISO timestamp cursor. Returns messages strictly older than this instant.',
  })
  @IsOptional()
  @IsDateString()
  before?: string;
}
