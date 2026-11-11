import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateOrderPaymentProofUploadDto {
  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsString()
  @IsIn([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ])
  contentType: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes: number;

  /**
   * Purpose is forced to `order-payment-proof` by the service. It is declared
   * here because the global ValidationPipe uses `forbidNonWhitelisted`, and the
   * client sends the purpose with every upload request.
   */
  @IsOptional()
  @IsIn(['order-payment-proof'])
  purpose?: string;
}
