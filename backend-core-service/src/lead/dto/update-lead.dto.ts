import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { LeadStatus } from '../entities/lead.entity';

const leadStatuses = [
  'new',
  'contacted',
  'qualified',
  'converted',
  'closed',
] as const;

export class UpdateLeadDto {
  @ApiPropertyOptional({ enum: leadStatuses })
  @IsOptional()
  @IsEnum(leadStatuses)
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;

  @IsOptional()
  @IsISO8601()
  contactedAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
