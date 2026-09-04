import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ADD_ON_COMPONENT_TYPES,
  ADD_ON_COMPONENT_UNITS,
  ADD_ON_PRODUCT_STATUSES,
} from '../subscription-add-on.types';

export class AddOnComponentResponseDto {
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

export class AddOnProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty()
  price: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: ADD_ON_PRODUCT_STATUSES })
  status: (typeof ADD_ON_PRODUCT_STATUSES)[number];

  @ApiProperty({ description: 'Monotonic catalog version.' })
  version: number;

  @ApiPropertyOptional()
  metadata: Record<string, unknown>;

  @ApiProperty({ type: AddOnComponentResponseDto, isArray: true })
  components: AddOnComponentResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
