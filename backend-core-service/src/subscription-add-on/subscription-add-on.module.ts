import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SubscriptionAddOnProduct } from './entities/subscription-add-on-product.entity';
import { SubscriptionAddOnProductComponent } from './entities/subscription-add-on-product-component.entity';
import { SubscriptionAddOnEvent } from './entities/subscription-add-on-event.entity';
import { TenantSubscriptionAddOnPurchase } from './entities/tenant-subscription-add-on-purchase.entity';
import { TenantSubscriptionAddOnComponent } from './entities/tenant-subscription-add-on-component.entity';
import { TenantSubscriptionAddOnPurchaseEvent } from './entities/tenant-subscription-add-on-purchase-event.entity';
import { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { SubscriptionAddOnService } from './subscription-add-on.service';
import { SubscriptionAddOnController } from './subscription-add-on.controller';
import { SubscriptionAddOnPurchaseService } from './subscription-add-on-purchase.service';
import { TenantAddOnCatalogController } from './tenant-add-on-catalog.controller';
import { TenantAddOnPurchaseController } from './tenant-add-on-purchase.controller';
import { PlatformAddOnPurchaseController } from './platform-add-on-purchase.controller';

@Module({
  imports: [
    // TenantAddOnPurchaseController uses EntitlementGuard; the module must
    // provide EntitlementService for the guard to resolve at app boot.
    EntitlementModule,
    TypeOrmModule.forFeature([
      SubscriptionAddOnProduct,
      SubscriptionAddOnProductComponent,
      SubscriptionAddOnEvent,
      TenantSubscriptionAddOnPurchase,
      TenantSubscriptionAddOnComponent,
      TenantSubscriptionAddOnPurchaseEvent,
      TenantSubscriptionPeriod,
      TenantBillingRecord,
      TenantEntitlement,
    ]),
  ],
  controllers: [
    SubscriptionAddOnController,
    TenantAddOnCatalogController,
    TenantAddOnPurchaseController,
    PlatformAddOnPurchaseController,
  ],
  providers: [SubscriptionAddOnService, SubscriptionAddOnPurchaseService],
  exports: [SubscriptionAddOnService, SubscriptionAddOnPurchaseService],
})
export class SubscriptionAddOnModule {}
