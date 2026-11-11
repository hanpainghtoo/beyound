import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderPaymentStatusDto {
  @ApiProperty({ enum: ['unpaid', 'paid'] })
  @IsIn(['unpaid', 'paid'])
  status: 'unpaid' | 'paid';

  @ApiPropertyOptional({
    description:
      'File reference uploaded through the existing attachment endpoint.',
  })
  @IsOptional()
  @IsString()
  attachmentReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
