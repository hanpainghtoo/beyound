import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConversationController } from './conversation.controller';
import { InternalIngestionController } from './internal-ingestion.controller';
import { ConversationNoteController } from './conversation-note.controller';
import { ConversationService } from './conversation.service';
import { ConversationNoteService } from './conversation-note.service';

import { Conversation } from './entities/conversation.entity';
import { ConversationNote } from './entities/conversation-note.entity';
import { InboundProviderEvent } from './entities/inbound-provider-event.entity';
import { Message } from './entities/message.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { Notification } from '../common/entities/notification.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { AuthModule } from '../auth/auth.module';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { SubscriptionPeriodModule } from '../subscription-period/subscription-period.module';
import { UsageModule } from '../usage/usage.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { ConversationGateway } from '../websocket/gateways/conversation.gateway';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
import { TenantChannelSettingsModule } from '../tenant/tenant-channel-settings.module';
import { TelegramShoppingActivityScheduler } from './telegram-shopping-activity.scheduler';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    EntitlementModule,
    AuthModule,
    // Provides SubscriptionEntitlementService for inbound usage dual-writes
    // (Plan 9 Phase 5, task 5.7).
    SubscriptionPeriodModule,
    UsageModule,
    WebSocketModule,
    TelegramBotModule,
    TenantChannelSettingsModule,
    MediaModule,
    TypeOrmModule.forFeature([
      Conversation,
      ConversationNote,
      InboundProviderEvent,
      Message,
      Customer,
      TenantChannel,
      Tenant,
      Notification,
      TenantUser,
      TenantUsageEvent,
    ]),
  ],
  controllers: [
    ConversationController,
    InternalIngestionController,
    ConversationNoteController,
  ],
  providers: [
    ConversationService,
    ConversationNoteService,
    ConversationGateway,
    TelegramShoppingActivityScheduler,
  ],
  exports: [ConversationService],
})
export class ConversationModule {}
