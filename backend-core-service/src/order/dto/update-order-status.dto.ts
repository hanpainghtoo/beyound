import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['confirmed', 'rejected', 'cancelled'] })
  @IsIn(['confirmed', 'rejected', 'cancelled'])
  status: 'confirmed' | 'rejected' | 'cancelled';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
