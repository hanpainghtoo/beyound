import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const CONVERSATION_NOTE_MAX_LENGTH = 2000;

export class CreateConversationNoteDto {
  @ApiProperty({ description: 'Note body, plain text.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CONVERSATION_NOTE_MAX_LENGTH)
  content: string;
}

export class UpdateConversationNoteDto {
  @ApiPropertyOptional({ description: 'Replacement note body.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CONVERSATION_NOTE_MAX_LENGTH)
  content?: string;

  @ApiPropertyOptional({ description: 'Pin to the top of the note list.' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ description: 'Mark the follow-up resolved.' })
  @IsOptional()
  @IsBoolean()
  isResolved?: boolean;
}
