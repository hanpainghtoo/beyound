import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateOrderLifecycleDto {
  @ApiPropertyOptional({
    enum: [
      'new',
      'confirmed',
      'preparing',
      'packed',
      'out_for_delivery',
      'delivered',
      'failed_delivery',
      'cod_collected',
      'cancelled',
      'returned',
    ],
  })
  @IsOptional()
  @IsIn([
    'new',
    'confirmed',
    'preparing',
    'packed',
    'out_for_delivery',
    'delivered',
    'failed_delivery',
    'cod_collected',
    'cancelled',
    'returned',
  ])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

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
  trackingNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  paidAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentNotes?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  attachments?: Record<string, any>[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
