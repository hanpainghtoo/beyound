import { ApiProperty } from '@nestjs/swagger';

export class RegisterFromPricingResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  paymentId: string;

  @ApiProperty({ description: 'Company email that will receive the OTP' })
  email: string;

  @ApiProperty()
  message: string;
}
