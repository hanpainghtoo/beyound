import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    type: 'platform_admin' | 'tenant_user';
    tenantId?: string;
    emailVerifiedAt?: Date | null;
  };

  @ApiProperty({ required: false })
  emailVerificationRequired?: boolean;

  @ApiProperty({ required: false })
  emailVerificationDelivery?: 'requested' | 'unavailable';
}
