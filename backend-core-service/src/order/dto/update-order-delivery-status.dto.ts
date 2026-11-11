import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderDeliveryStatusDto {
  @ApiProperty({
    enum: [
      'packed',
      'out_for_delivery',
      'delivered',
      'failed_delivery',
      'returned',
    ],
  })
  @IsIn([
    'packed',
    'out_for_delivery',
    'delivered',
    'failed_delivery',
    'returned',
  ])
  status:
    | 'packed'
    | 'out_for_delivery'
    | 'delivered'
    | 'failed_delivery'
    | 'returned';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
