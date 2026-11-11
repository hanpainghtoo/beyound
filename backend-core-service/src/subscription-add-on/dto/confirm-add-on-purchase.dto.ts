import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmAddOnPurchaseDto {
  @ApiPropertyOptional({
    description:
      'Duplicate-confirmation protection. A retry with the same key returns the existing confirmation result.',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Operator note recorded in the event.' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CancelAddOnPurchaseDto {
  @ApiPropertyOptional({
    description: 'Cancellation reason for the audit trail.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
