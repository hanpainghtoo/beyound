import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConversationController } from './conversation.controller';
import { InternalIngestionController } from './internal-ingestion.controller';
import { ConversationService } from './conversation.service';

import { Conversation } from './entities/conversation.entity';
import { InboundProviderEvent } from './entities/inbound-provider-event.entity';
import { Message } from './entities/message.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { Notification } from '../common/entities/notification.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { SubscriptionPeriodModule } from '../subscription-period/subscription-period.module';
import { UsageModule } from '../usage/usage.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    EntitlementModule,
    // Provides SubscriptionEntitlementService for inbound usage dual-writes
    // (Plan 9 Phase 5, task 5.7).
    SubscriptionPeriodModule,
    UsageModule,
    forwardRef(() => WebSocketModule),
    TypeOrmModule.forFeature([
      Conversation,
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
  controllers: [ConversationController, InternalIngestionController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
