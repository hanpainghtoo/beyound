import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CsrController } from './csr.controller';
import { CsrService } from './csr.service';

import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import { OutboundMessageCommand } from '../conversation/entities/outbound-message-command.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { Product } from '../product/entities/product.entity';
import { CannedResponse } from '../common/entities/canned-response.entity';
import { CsrAnalytics } from '../analytics/entities/csr-analytics.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { DomainEventModule } from '../domain-event/domain-event.module';
import { ChannelAdapterModule } from '../channel-adapter/channel-adapter.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [
    DomainEventModule,
    ChannelAdapterModule,
    WebSocketModule,
    EntitlementModule,
    UsageModule,
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
      CsrAnalytics,
      TenantChannel,
    ]),
  ],
  controllers: [CsrController],
  providers: [CsrService],
  exports: [CsrService],
})
export class CsrModule {}
