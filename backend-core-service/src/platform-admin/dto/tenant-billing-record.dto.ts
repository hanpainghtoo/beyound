import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

import type { BillingReviewStatus } from '../entities/tenant-billing-record.entity';

// Plan 25 Phase 6: review outcomes renamed `approved` -> `confirmed` so the
// proof level cannot be confused with the period admin-approval axis.
const paymentProofReviewOutcomes = ['confirmed', 'rejected'] as const;

const paymentProofReviewStatuses = [
  'in_review',
  'confirm',
  'reject',
  'cancelled',
] as const;

export class CreateTenantBillingRecordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subscriptionPlanId?: string;

  // Plan 25: meeting-decision fields.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNo?: string;

  @ApiPropertyOptional({ enum: paymentProofReviewStatuses })
  @IsOptional()
  @IsEnum(paymentProofReviewStatuses)
  reviewStatus?: (typeof paymentProofReviewStatuses)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentProofFileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actionBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  actionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  // Plan 25 (billing-account re-entry, interim): free-text reference to the
  // payer's billing account until the real FK lands.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingAccountRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  billingPeriodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  billingPeriodEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amountDue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amountPaid?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  paidAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateTenantBillingRecordDto extends PartialType(
  CreateTenantBillingRecordDto,
) {}

export class ReviewPaymentProofDto {
  @ApiPropertyOptional({ enum: paymentProofReviewOutcomes })
  @IsEnum(paymentProofReviewOutcomes)
  outcome: (typeof paymentProofReviewOutcomes)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  safeReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amountPaid?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  paidAt?: string;
}

export class ChangeTenantSubscriptionPlanDto {
  @ApiPropertyOptional()
  @IsUUID()
  subscriptionPlanId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  subscriptionStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  subscriptionEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  customAgentLimit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  customChannelLimit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  customMessageLimit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  createBillingRecord?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amountDue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: paymentProofReviewStatuses })
  @IsOptional()
  @IsEnum(paymentProofReviewStatuses)
  reviewStatus?: (typeof paymentProofReviewStatuses)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
