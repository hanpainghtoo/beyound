import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangeTenantStatusDto {
  @ApiProperty({
    description: 'Operational reason recorded in the platform audit trail',
    minLength: 3,
  })
  @IsString()
  @MinLength(3)
  reason: string;
}
