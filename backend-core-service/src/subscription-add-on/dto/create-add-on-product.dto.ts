import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ADD_ON_COMPONENT_TYPES,
  ADD_ON_COMPONENT_UNITS,
  ADD_ON_PRODUCT_STATUSES,
} from '../subscription-add-on.types';

export class AddOnComponentInputDto {
  @ApiProperty({
    enum: ADD_ON_COMPONENT_TYPES,
    description: 'Quota/capacity dimension this component grants.',
  })
  @IsIn(ADD_ON_COMPONENT_TYPES)
  componentType: (typeof ADD_ON_COMPONENT_TYPES)[number];

  @ApiProperty({
    description:
      'Positive capacity granted. 0, negative, and null are invalid.',
  })
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  quantity: number;

  @ApiPropertyOptional({
    enum: ADD_ON_COMPONENT_UNITS,
    description:
      'Canonical unit for the component type (validated against the type).',
  })
  @IsOptional()
  @IsIn(ADD_ON_COMPONENT_UNITS)
  unit?: (typeof ADD_ON_COMPONENT_UNITS)[number];

  @ApiPropertyOptional({
    description: 'Stable UI ordering within the product.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class CreateAddOnProductDto {
  @ApiProperty({
    description: 'Stable code such as `message_boost_10000_2000`.',
  })
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Price for one purchase of the complete bundle.',
  })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ default: 'MMK' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    enum: ADD_ON_PRODUCT_STATUSES,
    default: 'inactive',
    description: 'Defaults to inactive (not sellable until published).',
  })
  @IsOptional()
  @IsIn(ADD_ON_PRODUCT_STATUSES)
  status?: (typeof ADD_ON_PRODUCT_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiProperty({
    type: AddOnComponentInputDto,
    isArray: true,
    description: 'One or more typed quota components; a type may occur once.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AddOnComponentInputDto)
  components: AddOnComponentInputDto[];
}
