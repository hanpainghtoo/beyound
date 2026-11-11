import { IsIn, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const PAYMENT_IMAGE_PURPOSE = 'payment-method-image';
export const PAYMENT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PAYMENT_IMAGE_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export class PaymentImageUploadDto {
  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsString()
  @IsIn(PAYMENT_IMAGE_CONTENT_TYPES)
  contentType: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(PAYMENT_IMAGE_MAX_BYTES)
  sizeBytes: number;
}
