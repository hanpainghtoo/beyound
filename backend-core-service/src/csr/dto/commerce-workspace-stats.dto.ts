import { ApiProperty } from '@nestjs/swagger';

export class CommerceWorkspaceStatsDto {
  @ApiProperty()
  assignedConversations: number;

  @ApiProperty()
  unreadConversations: number;

  @ApiProperty()
  todayChatsHandled: number;

  @ApiProperty()
  avgResponseTime: number;

  @ApiProperty()
  resolutionRate: number;

  @ApiProperty()
  customerSatisfactionAvg: number;

  @ApiProperty()
  onlineTime: number;

  @ApiProperty()
  activeCampaigns: number;
}
