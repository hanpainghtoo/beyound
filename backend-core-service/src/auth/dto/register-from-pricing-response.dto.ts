import { ApiProperty } from '@nestjs/swagger';

export class RegisterFromPricingResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  paymentId: string;

  @ApiProperty({
    description: 'Sequential invoice number (INV-xxxxx) for display',
  })
  invoiceNo: string;

  @ApiProperty({ description: 'Company email that will receive the OTP' })
  email: string;

  @ApiProperty({
    description:
      'Expiry of the email_verification OTP (same contract as trial registration)',
  })
  emailVerificationExpiresAt: string;

  @ApiProperty({ description: 'Earliest time a new OTP can be requested' })
  resendAvailableAt: string;

  @ApiProperty()
  message: string;
}
