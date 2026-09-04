import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAddOnPurchaseDto {
  @ApiProperty({ description: 'The top-up catalog product to purchase.' })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({
    description:
      'Optional client-supplied target period. Ignored unless it matches the server-resolved active paid period.',
  })
  @IsOptional()
  @IsUUID()
  subscriptionPeriodId?: string;

  @ApiPropertyOptional({
    description:
      'Optional payment/invoice evidence. When provided it must belong to the same tenant.',
  })
  @IsOptional()
  @IsUUID()
  billingRecordId?: string;

  @ApiPropertyOptional({
    description:
      'Duplicate-purchase protection. A retry with the same key returns the existing purchase.',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
