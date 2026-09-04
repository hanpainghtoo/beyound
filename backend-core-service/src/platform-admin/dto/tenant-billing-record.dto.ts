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

import type {
  BillingInvoiceStatus,
  BillingPaymentStatus,
} from '../entities/tenant-billing-record.entity';

const invoiceStatuses = ['draft', 'issued', 'void'] as const;
const paymentStatuses = [
  'unpaid',
  'partially_paid',
  'paid',
  'overdue',
  'waived',
] as const;
const paymentProofReviewOutcomes = ['approved', 'rejected'] as const;

export class CreateTenantBillingRecordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subscriptionPlanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  billingPeriodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  billingPeriodEnd?: string;

  @ApiPropertyOptional({ enum: invoiceStatuses })
  @IsOptional()
  @IsEnum(invoiceStatuses)
  invoiceStatus?: BillingInvoiceStatus;

  @ApiPropertyOptional({ enum: paymentStatuses })
  @IsOptional()
  @IsEnum(paymentStatuses)
  paymentStatus?: BillingPaymentStatus;

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
  dueDate?: string;

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

export class SendTenantBillingReminderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  markOverdue?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  suspendTenant?: boolean;
}

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
  customCsrLimit?: number | null;

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
  @IsNumber()
  customApiLimit?: number | null;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ enum: invoiceStatuses })
  @IsOptional()
  @IsEnum(invoiceStatuses)
  invoiceStatus?: BillingInvoiceStatus;

  @ApiPropertyOptional({ enum: paymentStatuses })
  @IsOptional()
  @IsEnum(paymentStatuses)
  paymentStatus?: BillingPaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
