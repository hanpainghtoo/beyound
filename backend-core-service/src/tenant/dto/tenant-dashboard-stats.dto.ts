import { ApiProperty } from '@nestjs/swagger';

export class TenantDashboardStatsDto {
  @ApiProperty()
  todaysConversations: number;

  @ApiProperty()
  activeCsrs: number;

  @ApiProperty()
  pendingTickets: number;

  @ApiProperty()
  channelStatus: Record<string, string>;

  @ApiProperty()
  avgResponseTime: number;

  @ApiProperty()
  totalMessages: number;

  @ApiProperty()
  resolvedConversations: number;

  @ApiProperty()
  customerSatisfactionAvg: number;
}
