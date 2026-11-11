import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateOrderPaymentDto {
  @ApiProperty({ description: 'Amount collected in this transaction.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    description: 'Uploaded order-payment-proof media file id.',
  })
  @IsOptional()
  // Media ids come from the file-storage service (`file-<timestamp>-<random>`),
  // not UUIDs. Validating them as UUIDs rejected every real proof upload.
  @IsString()
  @MaxLength(255)
  proofFileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /**
   * Client-generated key so a retried submission cannot create a second
   * ledger entry. The backend treats a repeat as the original transaction.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class MarkOrderUnpaidDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
