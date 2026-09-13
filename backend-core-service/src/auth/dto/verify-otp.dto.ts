import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '6-digit OTP code', example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({
    enum: ['pricing_registration', 'otp_login'],
    description: 'Purpose of the OTP',
  })
  @IsEnum(['pricing_registration', 'otp_login'])
  purpose: 'pricing_registration' | 'otp_login';
}
