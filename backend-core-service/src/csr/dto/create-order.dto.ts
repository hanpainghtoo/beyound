import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderFromChatDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiProperty()
  @IsString()
  customerId: string;

  @ApiPropertyOptional({ enum: ['cod', 'online', 'bank_transfer'] })
  @IsOptional()
  @IsIn(['cod', 'online', 'bank_transfer'])
  paymentMethod?: string;

  @ApiPropertyOptional({
    enum: [
      'pending',
      'partially_paid',
      'paid',
      'failed',
      'refunded',
      'cod_pending',
      'cod_collected',
    ],
  })
  @IsOptional()
  @IsIn([
    'pending',
    'partially_paid',
    'paid',
    'failed',
    'refunded',
    'cod_pending',
    'cod_collected',
  ])
  paymentStatus?: string;

  @ApiProperty()
  @IsArray()
  items: OrderItemDto[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  attachments?: Record<string, any>[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentSourceMessageIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  taxAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  shippingFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  paidAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryAssigneeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryAssigneePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryZone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  shippingAddress?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  billingAddress?: Record<string, any>;
}

export class OrderItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiProperty()
  @IsNumber()
  unitPrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  variation?: Record<string, any>;
}
