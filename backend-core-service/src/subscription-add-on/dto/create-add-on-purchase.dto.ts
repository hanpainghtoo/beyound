import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const addOnPaymentMethods = [
  'bank_transfer',
  'kbzpay',
  'wavepay',
  'cash',
] as const;

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

  // Plan 30 add-on parity: same payment selections as subscription
  // purchases, persisted to the top-up record metadata.
  @ApiPropertyOptional({ enum: addOnPaymentMethods })
  @IsOptional()
  @IsEnum(addOnPaymentMethods)
  paymentMethod?: (typeof addOnPaymentMethods)[number];

  @ApiPropertyOptional({
    description: 'Free-text reference to the selected payment account.',
  })
  @IsOptional()
  @IsString()
  paymentAccount?: string;

  @ApiPropertyOptional({
    description: 'Real billing-account id for FK backfill matching.',
  })
  @IsOptional()
  @IsUUID('4')
  paymentAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
