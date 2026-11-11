import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MediaCallbackController } from './media-callback.controller';
import { MediaCallbackService } from './media-callback.service';
import { MediaLibraryController } from './media-library.controller';
import { MediaLibraryService } from './media-library.service';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { SubscriptionPeriodModule } from '../subscription-period/subscription-period.module';
import { Order } from '../order/entities/order.entity';
import { TenantPaymentMethod } from '../payment/entities/payment-method.entity';

@Module({
  imports: [
    EntitlementModule,
    SubscriptionPeriodModule,
    TypeOrmModule.forFeature([
      Tenant,
      SubscriptionPlan,
      TenantEntitlement,
      Order,
      TenantPaymentMethod,
    ]),
  ],
  controllers: [MediaCallbackController, MediaLibraryController],
  providers: [MediaCallbackService, MediaLibraryService],
  exports: [MediaLibraryService],
})
export class MediaModule {}
