import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { trimString } from './create-category.dto';

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Smartphones' })
  // ValidateIf (not IsOptional) so an explicit null is a 400 — IsOptional
  // skips null too, and `null.trim()` in the service would throw a 500.
  @ValidateIf((dto: UpdateCategoryDto) => dto.name !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Hide a category from dropdowns without deleting it',
  })
  // product_categories.is_active is NOT NULL: null would reach Postgres and 500.
  @ValidateIf((dto: UpdateCategoryDto) => dto.isActive !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
