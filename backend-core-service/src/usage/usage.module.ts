import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantUsageEvent } from './entities/tenant-usage-event.entity';
import { SubscriptionPeriodModule } from '../subscription-period/subscription-period.module';
import { TenantUsageInterceptor } from './tenant-usage.interceptor';
import { UsageLimitService } from './usage-limit.service';

@Global()
@Module({
  imports: [
    // Provides SubscriptionEntitlementService for period identity dual-writes
    // and feature-flagged period-scoped reads (Plan 9 Phase 5, tasks 5.6/5.10).
    SubscriptionPeriodModule,
    TypeOrmModule.forFeature([
      TenantUsageEvent,
    ]),
  ],
  providers: [
    UsageLimitService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantUsageInterceptor,
    },
  ],
  exports: [UsageLimitService],
})
export class UsageModule {}
