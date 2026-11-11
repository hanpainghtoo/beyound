import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterPaymentProofUploadDto {
  @ApiProperty({ description: 'Receipt file name' })
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    description: 'Receipt image content type (JPG, PNG, WebP, or GIF)',
  })
  @IsString()
  @Matches(/^image\/(jpeg|png|webp|gif)$/, {
    message: 'Payment receipt must be a JPG, PNG, WebP, or GIF image.',
  })
  contentType: string;

  @ApiProperty({ description: 'Receipt file size in bytes (max 5 MB)' })
  @Type(() => Number)
  @Min(1)
  @Max(5 * 1024 * 1024)
  sizeBytes: number;
}
