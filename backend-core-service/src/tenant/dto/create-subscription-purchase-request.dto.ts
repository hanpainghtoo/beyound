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

export const subscriptionPaymentMethods = [
  'bank_transfer',
  'kbzpay',
  'wavepay',
  'cash',
] as const;

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

  // Plan 30: workspace request-payment page collects these; persisted to
  // record metadata (selectedPaymentMethod/selectedPaymentAccount/requestNote).
  @ApiPropertyOptional({ enum: subscriptionPaymentMethods })
  @IsOptional()
  @IsEnum(subscriptionPaymentMethods)
  paymentMethod?: (typeof subscriptionPaymentMethods)[number];

  @ApiPropertyOptional({
    description:
      'Free-text reference to the selected payment account (hardcoded until the account module lands).',
  })
  @IsOptional()
  @IsString()
  paymentAccount?: string;

  @ApiPropertyOptional({
    description:
      'Real billing-account id (Plan 31: selected from the live billing-accounts module).',
  })
  @IsOptional()
  @IsUUID('4')
  paymentAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  // Plan 30 wrap-up R4: requesting tenant user, stamped to requested_by.
  // Optional so older clients keep working (records stay NULL).
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  requestedBy?: string;
}
