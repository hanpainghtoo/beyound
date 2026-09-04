import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty()
  @IsString()
  tenantCode: string;

  @ApiProperty()
  @IsString()
  companyName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPerson?: string;

  @ApiProperty()
  @IsEmail()
  contactEmail: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subscriptionPlanId?: string;

  @ApiPropertyOptional({ enum: ['pending', 'active', 'suspended', 'rejected'] })
  @IsOptional()
  @IsIn(['pending', 'active', 'suspended', 'rejected'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Full name of the owner user. Falls back to contactPerson.',
  })
  @IsOptional()
  @IsString()
  ownerFullName?: string;

  @ApiPropertyOptional({
    description: 'Email of the owner user. Falls back to contactEmail.',
  })
  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @ApiPropertyOptional({
    description:
      'When true, onboarding provisions exactly one auto-approved trial period from the configured trial plan. When false (default), no trial state is created and the merchant is blocked until it requests a paid plan.',
  })
  @IsOptional()
  @IsBoolean()
  startWithTrial?: boolean;
}
