import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentAnalytics } from './entities/agent-analytics.entity';
import { TenantAnalytics } from './entities/tenant-analytics.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AgentAnalytics, TenantAnalytics])],
  providers: [],
  exports: [],
})
export class AnalyticsModule {}
