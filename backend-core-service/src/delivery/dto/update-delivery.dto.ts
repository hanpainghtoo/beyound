import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateDeliveryDto {
  @ApiPropertyOptional({
    enum: [
      'preparing',
      'packed',
      'out_for_delivery',
      'delivered',
      'failed_delivery',
      'returned',
      'cancelled',
    ],
  })
  @IsOptional()
  @IsIn([
    'preparing',
    'packed',
    'out_for_delivery',
    'delivered',
    'failed_delivery',
    'returned',
    'cancelled',
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
  @IsDateString()
  deliveryDate?: string;
}
