import { IsOptional, IsIn, IsString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReportQueryDto {
  @ApiPropertyOptional({
    enum: ['weekly', 'monthly', 'yearly'],
    default: 'monthly',
  })
  @IsOptional()
  @IsIn(['weekly', 'monthly', 'yearly'])
  period?: 'weekly' | 'monthly' | 'yearly' = 'monthly';

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
