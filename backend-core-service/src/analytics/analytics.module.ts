import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CsrAnalytics } from './entities/csr-analytics.entity';
import { TenantAnalytics } from './entities/tenant-analytics.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CsrAnalytics, TenantAnalytics])],
  providers: [],
  exports: [],
})
export class AnalyticsModule {}
