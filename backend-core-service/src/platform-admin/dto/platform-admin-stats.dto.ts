import { ApiProperty } from '@nestjs/swagger';

export class PlatformAdminStatsDto {
  @ApiProperty()
  totalTenants: number;

  @ApiProperty()
  activeTenants: number;

  @ApiProperty()
  pendingTenants: number;

  @ApiProperty()
  suspendedTenants: number;

  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  activeUsers: number;

  @ApiProperty()
  monthlyMessageVolume: number;

  @ApiProperty()
  connectedChannels: number;

  @ApiProperty()
  totalRevenue: number;

  @ApiProperty()
  monthlyRevenue: number;
}
