import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterTenantUserDto {
  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: ['owner', 'admin', 'supervisor', 'agent'] })
  @IsOptional()
  // Plan 35 shim: accept legacy `csr` input (normalized in AuthService).
  @IsIn(['owner', 'admin', 'supervisor', 'agent', 'csr'])
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;
}
