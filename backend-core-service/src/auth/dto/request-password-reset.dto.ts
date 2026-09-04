import { IsEmail, IsIn, IsOptional } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(['tenant_user', 'platform_admin'])
  userType?: 'tenant_user' | 'platform_admin';
}
