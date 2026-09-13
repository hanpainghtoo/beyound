import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  BILLING_ACCOUNT_TYPES,
  type BillingAccount,
} from '../entities/billing-account.entity';

export class BillingAccountResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ nullable: true })
  icon: string | null;

  @ApiProperty({ maxLength: 100 })
  accountName: string;

  @ApiProperty({ enum: BILLING_ACCOUNT_TYPES })
  type: BillingAccount['type'];

  @ApiPropertyOptional({ nullable: true })
  accountNo: string | null;

  @ApiPropertyOptional({ nullable: true })
  phno: string | null;

  @ApiPropertyOptional({ nullable: true })
  qr: string | null;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdDate: Date;

  @ApiProperty()
  updatedDate: Date;

  @ApiProperty({ format: 'uuid' })
  createdBy: string;

  @ApiProperty({ format: 'uuid' })
  updatedBy: string;
}
