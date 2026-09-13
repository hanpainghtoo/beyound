import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const allowedContentTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'application/pdf',
  'text/plain',
] as const;

export class CreateMediaUploadDto {
  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsString()
  @MaxLength(150)
  @IsIn(allowedContentTypes)
  contentType: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(25 * 1024 * 1024)
  sizeBytes: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  purpose?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
