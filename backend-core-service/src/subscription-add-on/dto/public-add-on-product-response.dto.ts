import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ADD_ON_COMPONENT_TYPES,
  ADD_ON_COMPONENT_UNITS,
} from '../subscription-add-on.types';

/** Public-safe component shape: no catalog metadata or audit fields. */
export class PublicAddOnComponentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ADD_ON_COMPONENT_TYPES })
  componentType: (typeof ADD_ON_COMPONENT_TYPES)[number];

  @ApiProperty()
  quantity: number;

  @ApiProperty({ enum: ADD_ON_COMPONENT_UNITS })
  unit: (typeof ADD_ON_COMPONENT_UNITS)[number];

  @ApiProperty()
  displayOrder: number;
}

/**
 * Public catalog projection for pricing pages. Keep this intentionally
 * narrower than the tenant/platform DTO: marketing callers need only the
 * sellable offer, never pricing metadata, version data, or audit timestamps.
 */
export class PublicAddOnProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty()
  price: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ type: PublicAddOnComponentResponseDto, isArray: true })
  components: PublicAddOnComponentResponseDto[];
}
