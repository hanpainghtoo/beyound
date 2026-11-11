import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

import {
  MINIMUM_PASSWORD_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_POLICY_REGEX,
} from '../password-policy';

export class RegisterWorkspaceDto {
  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiProperty()
  @IsString()
  companyName: string;

  @ApiProperty()
  @IsEmail()
  workEmail: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  companyEmail?: string;

  @ApiProperty()
  @IsString()
  @MinLength(MINIMUM_PASSWORD_LENGTH, { message: PASSWORD_POLICY_MESSAGE })
  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  password: string;

  @ApiProperty()
  @Equals(true, {
    message: 'You must accept the Terms of Service and Privacy Policy.',
  })
  acceptTerms: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teamSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subscriptionPlanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
