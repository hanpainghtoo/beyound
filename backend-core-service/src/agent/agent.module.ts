import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import { OutboundMessageCommand } from '../conversation/entities/outbound-message-command.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { Product } from '../product/entities/product.entity';
import { CannedResponse } from '../common/entities/canned-response.entity';
import { AgentAnalytics } from '../analytics/entities/agent-analytics.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { DomainEventModule } from '../domain-event/domain-event.module';
import { ChannelAdapterModule } from '../channel-adapter/channel-adapter.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { UsageModule } from '../usage/usage.module';
import { OrderModule } from '../order/order.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    DomainEventModule,
    ChannelAdapterModule,
    WebSocketModule,
    EntitlementModule,
    UsageModule,
    OrderModule,
    MediaModule,
    TypeOrmModule.forFeature([
      Conversation,
      Message,
      OutboundMessageCommand,
      Customer,
      TenantUser,
      Order,
      OrderItem,
      Product,
      CannedResponse,
      AgentAnalytics,
      TenantChannel,
    ]),
  ],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
