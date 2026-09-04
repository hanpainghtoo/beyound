import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  PlatformAdminController,
  PublicCatalogController,
} from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { ChannelTemplateController } from './channel-template.controller';
import { ChannelTemplateService } from './channel-template.service';

import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { PlatformAdmin } from '../auth/entities/platform-admin.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { TenantAnalytics } from '../analytics/entities/tenant-analytics.entity';
import { ChannelTemplate } from '../channel/entities/channel-template.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Order } from '../order/entities/order.entity';
import { Product } from '../product/entities/product.entity';
import { PlatformSetting } from './entities/platform-setting.entity';
import { TenantRateLimit } from '../tenant/entities/tenant-rate-limit.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { TenantBillingRecord } from './entities/tenant-billing-record.entity';
import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { Lead } from '../lead/entities/lead.entity';
import { NotificationModule } from '../notification/notification.module';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { TenantModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionPeriodModule } from '../subscription-period/subscription-period.module';
import { MediaModule } from '../media/media.module';
import { SubscriptionAddOnModule } from '../subscription-add-on/subscription-add-on.module';

@Module({
  imports: [
    AuthModule,
    NotificationModule,
    SubscriptionPeriodModule,
    MediaModule,
    SubscriptionAddOnModule,
    EntitlementModule,
    TenantModule,
    TypeOrmModule.forFeature([
      Tenant,
      SubscriptionPlan,
      PlatformAdmin,
      TenantUser,
      TenantAnalytics,
      ChannelTemplate,
      TenantChannel,
      Conversation,
      Order,
      Product,
      PlatformSetting,
      TenantRateLimit,
      TenantUsageEvent,
      TenantBillingRecord,
      TenantEntitlement,
      Lead,
    ]),
  ],
  controllers: [
    PublicCatalogController,
    PlatformAdminController,
    ChannelTemplateController,
  ],
  providers: [PlatformAdminService, ChannelTemplateService],
  exports: [PlatformAdminService, ChannelTemplateService],
})
export class PlatformAdminModule {}
