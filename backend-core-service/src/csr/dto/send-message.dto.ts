import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  conversationId: string;

  @ApiPropertyOptional({
    enum: ['text', 'image', 'video', 'audio', 'file', 'location'],
  })
  @IsOptional()
  @IsIn(['text', 'image', 'video', 'audio', 'file', 'location'])
  messageType?: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  attachments?: Record<string, any>[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cannedResponseId?: string;
}
