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

  /**
   * Ceiling matches Telegram's own bot document limit (50 MB), which is the
   * real constraint on inbound chat media — phone-shot video exceeds any
   * smaller figure. Must stay in step with file-storage's `MAX_FILE_SIZE`
   * (default 52428800); the narrower of the two silently rejects the upload,
   * and for inbound attachments that rejection is swallowed by a fail-soft
   * catch. Per-tenant storage quotas are enforced separately in
   * MediaLibraryService, so this cap is not the quota.
   */
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50 * 1024 * 1024)
  sizeBytes: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  purpose?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
