import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

import { InternalChannelCredentialsController } from './internal-channel-credentials.controller';
import { InternalProviderAppController } from './internal-provider-app.controller';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TelegramManagedBotService } from './telegram-managed-bot.service';
import { InternalTelegramManagedBotController } from './internal-telegram-managed-bot.controller';
import {
  META_OAUTH_REDIS_CLIENT,
  MetaOAuthService,
} from './meta-oauth.service';

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
import { BotTemplateModule } from '../bot-template/bot-template.module';
import { CommerceTemplateGuard } from '../common/guards/commerce-template.guard';
import { TenantChannelSettingsModule } from './tenant-channel-settings.module';
import { TenantChannelSettings } from './entities/tenant-channel-settings.entity';
import { LoggingModule } from '../logging/logging.module';
import { AuthModule } from '../auth/auth.module';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { SubscriptionPeriodModule } from '../subscription-period/subscription-period.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    AuthModule,
    BotTemplateModule,
    // Provides TenantChannelSettingsService for TenantController and the
    // repository CommerceTemplateGuard reads. Safe here: it only imports
    // BotTemplateModule, which TenantModule already imports directly.
    TenantChannelSettingsModule,
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
      // CommerceTemplateGuard reads this repository directly instead of
      // injecting TenantChannelSettingsService, so it must be registered here
      // rather than inherited from TenantChannelSettingsModule.
      TenantChannelSettings,
    ]),
  ],
  controllers: [
    TenantController,
    InternalChannelCredentialsController,
    InternalProviderAppController,
    InternalTelegramManagedBotController,
  ],
  providers: [
    TenantService,
    TelegramManagedBotService,
    CommerceTemplateGuard,
    MetaOAuthService,
    {
      provide: META_OAUTH_REDIS_CLIENT,
      useFactory: async (configService: ConfigService) => {
        const client = createClient({
          url:
            configService.get<string>('REDIS_URL') ||
            `redis://${configService.get<string>('REDIS_HOST') || 'localhost'}:${configService.get<string>('REDIS_PORT') || '6379'}`,
        }) as RedisClientType;
        await client.connect();
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [TenantService, TelegramManagedBotService],
})
export class TenantModule {}
