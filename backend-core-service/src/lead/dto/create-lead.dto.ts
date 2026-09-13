import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { LeadIntent } from '../entities/lead.entity';

const leadIntents = ['demo', 'sales', 'support', 'general', 'trial'] as const;

export class CreateLeadDto {
  @ApiPropertyOptional({ enum: leadIntents })
  @IsOptional()
  @IsEnum(leadIntents)
  intent?: LeadIntent;

  @IsString()
  @MaxLength(160)
  fullName: string;

  @IsString()
  @MaxLength(180)
  companyName: string;

  @IsEmail()
  @MaxLength(180)
  emailAddress: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  teamSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  interestedIn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
