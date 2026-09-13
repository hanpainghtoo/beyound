import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsIn,
} from 'class-validator';

export class UpdateOrderItemDto {
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

export class UpdateOrderDetailsDto {
  @ApiPropertyOptional({ enum: ['cod', 'online', 'bank_transfer'] })
  @IsOptional()
  @IsIn(['cod', 'online', 'bank_transfer'])
  paymentMethod?: string;

  @ApiProperty()
  @IsArray()
  items: UpdateOrderItemDto[];

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
