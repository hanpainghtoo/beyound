import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeliveriesFilterDto {
  @ApiPropertyOptional({
    description:
      'Search by order number, customer name, assignee, zone, or tracking',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: [
      'all',
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
  @IsString()
  @IsIn([
    'all',
    'preparing',
    'packed',
    'out_for_delivery',
    'delivered',
    'failed_delivery',
    'returned',
    'cancelled',
  ])
  status?: string;

  @ApiPropertyOptional({
    enum: [
      'createdAt',
      'orderNumber',
      'deliveryAssigneeName',
      'deliveryZone',
      'trackingNumber',
      'status',
    ],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  limit?: number;
}
