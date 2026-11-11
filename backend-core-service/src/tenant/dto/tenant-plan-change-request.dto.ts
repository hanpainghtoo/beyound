import { ApiProperty } from '@nestjs/swagger';

export class TenantPlanChangeRequestDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'cancelled'] })
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';

  @ApiProperty()
  requestedAt: string;

  @ApiProperty({ nullable: true })
  resolvedAt?: string | null;

  @ApiProperty({ nullable: true })
  note?: string | null;

  @ApiProperty({ nullable: true })
  currentPlan?: { id: string; name: string } | null;

  @ApiProperty()
  desiredPlan: { id: string; name: string };
}
