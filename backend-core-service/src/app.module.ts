import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

// Core modules
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';

// Feature modules
import { PlatformAdminModule } from './platform-admin/platform-admin.module';
import { TenantModule } from './tenant/tenant.module';
import { CsrModule } from './csr/csr.module';
import { ConversationModule } from './conversation/conversation.module';
import { ProductModule } from './product/product.module';
import { OrderModule } from './order/order.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationModule } from './notification/notification.module';
import { WebSocketModule } from './websocket/websocket.module';
import { LoggingModule } from './logging/logging.module';
import { DomainEventModule } from './domain-event/domain-event.module';
import { AiModule } from './ai/ai.module';
import { ChannelAdapterModule } from './channel-adapter/channel-adapter.module';
import { MediaModule } from './media/media.module';
import { UsageModule } from './usage/usage.module';
import { LeadModule } from './lead/lead.module';
import { EntitlementModule } from './entitlement/entitlement.module';
import { LegalPolicyModule } from './legal-policy/legal-policy.module';
import { EmailModule } from './email/email.module';
import { SubscriptionPeriodModule } from './subscription-period/subscription-period.module';
import { SubscriptionAddOnModule } from './subscription-add-on/subscription-add-on.module';
import { DeliveryModule } from './delivery/delivery.module';

// Configuration
import { databaseConfig } from './config/database.config';
import { authConfig } from './config/auth.config';
import {
  throttlerAsyncConfig,
  throttlerConfig,
} from './config/throttler.config';
import { cacheAsyncConfig, cacheConfig } from './config/cache.config';
import { validateEnvironment } from './config/environment.validation';
import { RequestLoggingMiddleware } from './logging/middleware/request-logging.middleware';
import { TelegramBotApiExceptionFilter } from './common/filters/telegram-bot-api-exception.filter';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, authConfig, throttlerConfig, cacheConfig],
      validate: validateEnvironment,
    }),

    // Database
    DatabaseModule,

    // Rate limiting
    ThrottlerModule.forRootAsync(throttlerAsyncConfig),

    // Caching
    CacheModule.registerAsync(cacheAsyncConfig),

    // Core modules
    AuthModule,

    // Feature modules
    PlatformAdminModule,
    TenantModule,
    CsrModule,
    ConversationModule,
    ProductModule,
    OrderModule,
    AnalyticsModule,
    NotificationModule,
    WebSocketModule,
    LoggingModule,
    DomainEventModule,
    AiModule,
    ChannelAdapterModule,
    MediaModule,
    UsageModule,
    LeadModule,
    EntitlementModule,
    LegalPolicyModule,
    EmailModule,
    SubscriptionPeriodModule,
    SubscriptionAddOnModule,
    DeliveryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: TelegramBotApiExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
