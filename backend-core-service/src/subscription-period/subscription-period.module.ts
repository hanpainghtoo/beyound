import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { TenantEntitlementEvent } from '../entitlement/entities/tenant-entitlement-event.entity';
import { TenantSubscriptionAddOnPurchase } from '../subscription-add-on/entities/tenant-subscription-add-on-purchase.entity';
import { TenantSubscriptionAddOnComponent } from '../subscription-add-on/entities/tenant-subscription-add-on-component.entity';
import { TenantSubscriptionAddOnPurchaseEvent } from '../subscription-add-on/entities/tenant-subscription-add-on-purchase-event.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { TenantSubscriptionPeriod } from './entities/tenant-subscription-period.entity';
import { SubscriptionPeriodEvent } from './entities/subscription-period-event.entity';
import { TenantSubscriptionPeriodUpgradeRevision } from './entities/tenant-subscription-period-upgrade-revision.entity';
import { SubscriptionPeriodService } from './subscription-period.service';
import { SubscriptionPeriodSchedulerService } from './subscription-period-scheduler.service';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';
import { SubscriptionEntitlementReconciliationService } from './subscription-entitlement-reconciliation.service';
import { PlatformSubscriptionController } from './platform-subscription.controller';
import { TenantSubscriptionController } from './tenant-subscription.controller';

@Module({
  imports: [
    EntitlementModule,
    TypeOrmModule.forFeature([
      TenantSubscriptionPeriod,
      SubscriptionPeriodEvent,
      TenantSubscriptionPeriodUpgradeRevision,
      Tenant,
      TenantChannel,
      TenantUser,
      SubscriptionPlan,
      TenantBillingRecord,
      TenantEntitlement,
      TenantEntitlementEvent,
      TenantSubscriptionAddOnPurchase,
      TenantSubscriptionAddOnComponent,
      TenantSubscriptionAddOnPurchaseEvent,
      TenantUsageEvent,
    ]),
  ],
  controllers: [PlatformSubscriptionController, TenantSubscriptionController],
  providers: [
    SubscriptionPeriodService,
    SubscriptionPeriodSchedulerService,
    SubscriptionEntitlementService,
    SubscriptionEntitlementReconciliationService,
  ],
  exports: [
    TypeOrmModule,
    SubscriptionPeriodService,
    SubscriptionPeriodSchedulerService,
    SubscriptionEntitlementService,
    SubscriptionEntitlementReconciliationService,
  ],
})
export class SubscriptionPeriodModule {}
