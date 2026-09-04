import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const paymentMethods = ['bank_transfer', 'kbzpay', 'wavepay', 'cash'] as const;
const mediaScanStatuses = ['clean'] as const;

export class SubmitPaymentProofDto {
  @ApiProperty({ enum: paymentMethods })
  @IsEnum(paymentMethods)
  paymentMethod: (typeof paymentMethods)[number];

  @ApiProperty()
  @IsNumber()
  @Min(1)
  paidAmount: number;

  @ApiProperty()
  @IsDateString()
  paidDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transactionReference?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  mediaFileId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ enum: mediaScanStatuses })
  @IsEnum(mediaScanStatuses)
  mediaScanStatus: (typeof mediaScanStatuses)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
