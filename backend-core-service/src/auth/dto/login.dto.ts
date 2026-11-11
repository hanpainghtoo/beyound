import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@kme.app' })
  @IsString({ message: 'Enter your email address.' })
  @MinLength(1, { message: 'Enter your email address.' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString({ message: 'Enter your password.' })
  @MinLength(6, { message: 'Password must be at least 6 characters.' })
  password: string;
}
