import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class GenerateOtpDto {
  @ApiProperty({ description: 'Email address to send OTP to' })
  @IsEmail()
  email: string;

  @ApiProperty({
    enum: ['pricing_registration', 'otp_login'],
    description: 'Purpose of the OTP',
  })
  @IsEnum(['pricing_registration', 'otp_login'])
  purpose: 'pricing_registration' | 'otp_login';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  paymentId?: string;
}
