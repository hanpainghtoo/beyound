import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

export class LinkOrderAttachmentDto {
  @ApiProperty()
  // File-storage ids are `file-<timestamp>-<random>`, so a UUID check here
  // rejected every uploaded payment proof before the service could persist it.
  @IsString()
  @MaxLength(255)
  fileId: string;

  @ApiProperty({ enum: ['payment_proof'] })
  @IsIn(['payment_proof'])
  role: 'payment_proof';
}
