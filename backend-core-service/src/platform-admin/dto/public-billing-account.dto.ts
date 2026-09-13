import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicBankAccountItemDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ format: 'uri' })
  icon?: string;

  @ApiProperty()
  account_name: string;

  @ApiProperty()
  account_no: string;
}

export class PublicDigitalWalletItemDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ format: 'uri' })
  icon?: string;

  @ApiProperty()
  account_name: string;

  @ApiProperty()
  ph_no: string;

  @ApiProperty({ format: 'uri' })
  qr: string;
}

export class PublicBillingAccountGroupDto {
  @ApiProperty({ enum: ['bank_account', 'digital_wallet'] })
  type: 'bank_account' | 'digital_wallet';

  @ApiProperty({ enum: ['Bank Account', 'Digital Wallet'] })
  name: 'Bank Account' | 'Digital Wallet';

  @ApiProperty({ type: [Object] })
  items: Array<PublicBankAccountItemDto | PublicDigitalWalletItemDto>;
}
