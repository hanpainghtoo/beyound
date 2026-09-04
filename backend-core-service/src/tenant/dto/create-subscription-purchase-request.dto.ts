import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export const subscriptionPurchaseStartOptions = [
  'current_month',
  'next_month',
  'after_trial',
] as const;

export type SubscriptionPurchaseStartOption =
  (typeof subscriptionPurchaseStartOptions)[number];

export class CreateSubscriptionPurchaseRequestDto {
  @ApiProperty({
    description: 'Client-generated key used to safely retry the request.',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiProperty({
    enum: subscriptionPurchaseStartOptions,
    description:
      'Purchase timing. after_trial schedules a fresh paid period after an active trial without carrying over trial quota.',
  })
  @IsEnum(subscriptionPurchaseStartOptions)
  startOption: SubscriptionPurchaseStartOption;

  @ApiPropertyOptional({
    description:
      'Selected subscription plan ID for this purchase. When omitted the tenant assigned plan is used as a backward-compatible default.',
  })
  @IsOptional()
  @IsUUID('4')
  subscriptionPlanId?: string;
}
