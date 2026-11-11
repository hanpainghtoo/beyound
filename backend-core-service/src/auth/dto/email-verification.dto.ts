import { IsEmail, IsString, Length } from 'class-validator';

export class ResendEmailVerificationDto {
  @IsEmail()
  email: string;
}

export class VerifyEmailOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;
}
