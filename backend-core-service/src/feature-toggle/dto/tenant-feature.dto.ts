import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class TenantFeatureDto {
  @ApiProperty({ example: 'orders' })
  key: string;

  @ApiProperty({ example: 'Orders' })
  displayName: string;

  @ApiProperty({ nullable: true, example: 'Order capture and pipeline.' })
  description: string | null;

  @ApiProperty({ example: true })
  isEnabled: boolean;

  @ApiProperty({
    example: true,
    description: 'False for modules that can never be disabled.',
  })
  isLockable: boolean;

  @ApiProperty({ nullable: true, example: null })
  dependsOn: string | null;

  @ApiProperty({ example: 20 })
  displayOrder: number;

  @ApiProperty({
    example: true,
    description: 'False while a required dependency is disabled.',
  })
  canDisable: boolean;
}

export class TenantFeatureListDto {
  @ApiProperty({ type: [TenantFeatureDto] })
  features: TenantFeatureDto[];
}

export class UpdateTenantFeatureDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isEnabled: boolean;
}

export class SetTenantFeatureParamDto {
  @ApiProperty({ example: 'orders' })
  @IsString()
  @IsNotEmpty()
  key: string;
}
