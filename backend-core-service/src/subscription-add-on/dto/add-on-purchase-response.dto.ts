import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ADD_ON_COMPONENT_TYPES,
  ADD_ON_COMPONENT_UNITS,
} from '../subscription-add-on.types';

export class AddOnPurchaseComponentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ADD_ON_COMPONENT_TYPES })
  componentType: (typeof ADD_ON_COMPONENT_TYPES)[number];

  @ApiProperty()
  quantity: number;

  @ApiProperty({ enum: ADD_ON_COMPONENT_UNITS })
  unit: string;

  @ApiProperty({
    description: 'Same target-period end as the parent purchase.',
  })
  expiresAt: Date;

  @ApiProperty({ enum: ['pending', 'active', 'expired'] })
  componentStatus: string;
}

export class AddOnPurchaseTargetPeriodDto {
  @ApiPropertyOptional({ nullable: true })
  monthStartAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  monthEndAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  periodStartAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  periodEndAt: Date | null;
}

/**
 * Tenant and operator purchase view (task 4.9): every bundle component, the
 * target month, status, purchase time, and Yangon expiry are visible.
 */
export class AddOnPurchaseResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  subscriptionPeriodId: string;

  @ApiProperty()
  productId: string;

  @ApiPropertyOptional({ nullable: true })
  billingRecordId: string | null;

  @ApiPropertyOptional({ nullable: true })
  productCode: string | null;

  @ApiPropertyOptional({ nullable: true })
  productName: string | null;

  @ApiProperty()
  purchasePrice: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: ['pending', 'paid', 'failed'] })
  paymentStatus: string;

  @ApiProperty({ enum: ['pending', 'active', 'expired', 'cancelled'] })
  purchaseStatus: string;

  @ApiPropertyOptional({ nullable: true })
  effectiveAt: Date | null;

  @ApiProperty({
    description: 'Target period end, exclusive (Yangon boundary).',
  })
  expiresAt: Date;

  @ApiPropertyOptional({ type: AddOnPurchaseTargetPeriodDto, nullable: true })
  targetPeriod: AddOnPurchaseTargetPeriodDto | null;

  @ApiProperty({ type: AddOnPurchaseComponentResponseDto, isArray: true })
  components: AddOnPurchaseComponentResponseDto[];

  @ApiPropertyOptional()
  metadata: Record<string, unknown>;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
