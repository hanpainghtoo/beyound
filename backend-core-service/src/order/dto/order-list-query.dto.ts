import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class OrderListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @ApiPropertyOptional({
    enum: [
      'packed',
      'out_for_delivery',
      'delivered',
      'failed_delivery',
      'returned',
    ],
  })
  @IsOptional()
  @IsString()
  deliveryStatus?: string;

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'Filter orders by submitted payment proof.',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  proofSubmitted?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  channelId?: string;

  @ApiPropertyOptional({ description: 'Orders linked to one conversation.' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
