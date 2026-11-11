import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import {
  DEFAULT_PAGE,
  MAX_LIMIT,
} from '../../common/pagination/pagination-constants';

const DEFAULT_DELIVERY_LIMIT = 50;

export class DeliveriesFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search by order number, customer name, or assignee',
  })
  @IsOptional()
  @IsString()
  declare search?: string;

  @ApiPropertyOptional({
    enum: [
      'all',
      'packed',
      'out_for_delivery',
      'delivered',
      'failed_delivery',
      'returned',
    ],
  })
  @IsOptional()
  @IsString()
  @IsIn([
    'all',
    'packed',
    'out_for_delivery',
    'delivered',
    'failed_delivery',
    'returned',
  ])
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by delivery assignee name' })
  @IsOptional()
  @IsString()
  assignee?: string;

  @ApiPropertyOptional({
    description: 'Deliveries linked to one conversation (order).',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Deliveries for one customer (via order).',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    enum: ['createdAt', 'orderNumber', 'deliveryAssigneeName', 'status'],
  })
  @IsOptional()
  @IsString()
  declare sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  declare sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({ minimum: 1, default: DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_LIMIT,
    default: DEFAULT_DELIVERY_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  declare limit?: number;
}
