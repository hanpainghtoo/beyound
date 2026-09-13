import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InternalChannelCredentialsController } from './internal-channel-credentials.controller';
import { InternalProviderAppController } from './internal-provider-app.controller';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TelegramManagedBotService } from './telegram-managed-bot.service';
import { InternalTelegramManagedBotController } from './internal-telegram-managed-bot.controller';

import { TenantUser } from '../auth/entities/tenant-user.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TelegramManagedBotOnboardingRequest } from '../channel/entities/telegram-managed-bot-onboarding-request.entity';
import { CannedResponse } from '../common/entities/canned-response.entity';
import { Product } from '../product/entities/product.entity';
import { ProductCategory } from '../product/entities/product-category.entity';
import { TenantAnalytics } from '../analytics/entities/tenant-analytics.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Tenant } from './entities/tenant.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { TenantRateLimit } from './entities/tenant-rate-limit.entity';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { Lead } from '../lead/entities/lead.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { ChannelAdapterModule } from '../channel-adapter/channel-adapter.module';
import { LoggingModule } from '../logging/logging.module';
import { AuthModule } from '../auth/auth.module';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { SubscriptionPeriodModule } from '../subscription-period/subscription-period.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    AuthModule,
    ChannelAdapterModule,
    EntitlementModule,
    SubscriptionPeriodModule,
    MediaModule,
    LoggingModule,
    TypeOrmModule.forFeature([
      TenantUser,
      TenantChannel,
      TelegramManagedBotOnboardingRequest,
      CannedResponse,
      Product,
      ProductCategory,
      TenantAnalytics,
      Conversation,
      Tenant,
      SubscriptionPlan,
      TenantRateLimit,
      TenantBillingRecord,
      Lead,
      TenantUsageEvent,
    ]),
  ],
  controllers: [
    TenantController,
    InternalChannelCredentialsController,
    InternalProviderAppController,
    InternalTelegramManagedBotController,
  ],
  providers: [TenantService, TelegramManagedBotService],
  exports: [TenantService, TelegramManagedBotService],
})
export class TenantModule {}
