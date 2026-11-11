import { ApiPropertyOptional } from '@nestjs/swagger';

export type DeliveryStatus =
  | 'packed'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed_delivery'
  | 'returned';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateDeliveryDto {
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
  @IsIn([
    'packed',
    'out_for_delivery',
    'delivered',
    'failed_delivery',
    'returned',
  ])
  status?: DeliveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

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
  @IsDateString()
  deliveryDate?: string;
}
