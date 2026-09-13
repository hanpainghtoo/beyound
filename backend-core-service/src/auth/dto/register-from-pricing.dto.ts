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

export class RegisterFromPricingDto {
  @ApiProperty({ description: 'Selected subscription plan ID' })
  @IsUUID()
  subscriptionPlanId: string;

  @ApiProperty({ description: 'Company name' })
  @IsString()
  companyName: string;

  @ApiProperty({ description: 'Work/company email' })
  @IsEmail()
  companyEmail: string;

  @ApiPropertyOptional({ description: 'Business type' })
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional({ description: 'Team size' })
  @IsOptional()
  @IsString()
  teamSize?: string;

  @ApiProperty({ description: 'Full name (owner)' })
  @IsString()
  fullName: string;

  @ApiProperty({ description: 'Personal email (for OTP)' })
  @IsEmail()
  personalEmail: string;

  @ApiProperty()
  @IsString()
  @MinLength(MINIMUM_PASSWORD_LENGTH, { message: PASSWORD_POLICY_MESSAGE })
  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  password: string;

  @ApiProperty({ description: 'Selected payment method option ID' })
  @IsString()
  paymentMethodOptionId: string;

  @ApiPropertyOptional({ description: 'Note for admin' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty()
  @Equals(true, {
    message: 'You must accept the Terms of Service and Privacy Policy.',
  })
  acceptTerms: boolean;
}
