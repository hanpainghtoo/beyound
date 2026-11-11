import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { EntitlementService } from './entitlement.service';
import { TenantEntitlement } from './entities/tenant-entitlement.entity';
import { TenantEntitlementEvent } from './entities/tenant-entitlement-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionPlan,
      TenantEntitlement,
      TenantEntitlementEvent,
    ]),
  ],
  providers: [EntitlementService, EntitlementGuard],
  exports: [EntitlementService, EntitlementGuard],
})
export class EntitlementModule {}
