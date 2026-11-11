import { IsString, IsOptional, IsObject, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum WebSocketMessageType {
  NEW_MESSAGE = 'new_message',
  CONVERSATION_UPDATE = 'conversation_update',
  AGENT_STATUS_CHANGE = 'agent_status_change',
  TYPING_INDICATOR = 'typing_indicator',
  CONVERSATION_ASSIGNED = 'conversation_assigned',
  CUSTOMER_ONLINE = 'customer_online',
  CUSTOMER_OFFLINE = 'customer_offline',
}

export class WebSocketMessageDto {
  @ApiProperty({ enum: WebSocketMessageType })
  @IsEnum(WebSocketMessageType)
  type: WebSocketMessageType;

  @ApiProperty()
  @IsString()
  conversationId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  data?: any;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;
}

export class TypingIndicatorDto {
  @ApiProperty()
  @IsString()
  conversationId: string;

  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty()
  @IsString()
  userType: 'agent' | 'customer';
}
