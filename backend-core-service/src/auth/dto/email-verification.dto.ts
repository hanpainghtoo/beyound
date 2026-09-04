import { IsEmail, IsString } from 'class-validator';

export class ResendEmailVerificationDto {
  @IsEmail()
  email: string;
}

export class ConfirmEmailVerificationDto {
  @IsString()
  token: string;
}
