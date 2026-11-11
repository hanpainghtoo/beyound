import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrderController } from './order.controller';
import { OrderService } from './order.service';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { TenantOrderCounter } from './entities/tenant-order-counter.entity';
import { OrderItemReservation } from './entities/order-item-reservation.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { DomainEventModule } from '../domain-event/domain-event.module';
import { Product } from '../product/entities/product.entity';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { FeatureToggleModule } from '../feature-toggle/feature-toggle.module';
import { ChannelAdapterModule } from '../channel-adapter/channel-adapter.module';
import { Customer } from '../customer/entities/customer.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { OrderNumberService } from './order-number.service';
import { OrderReservationService } from './order-reservation.service';
import { OrderTransitionService } from './order-transition.service';
import { OrderExpiryWorker } from './order-expiry.worker';
import { Tenant } from '../tenant/entities/tenant.entity';
import { OrderPaymentProof } from './entities/order-payment-proof.entity';
import { OrderCreationIdempotency } from './entities/order-creation-idempotency.entity';
import { OrderCreationService } from './order-creation.service';
import { OrderCreationCleanupWorker } from './order-creation-cleanup.worker';
import { OrderActivityProjector } from './order-activity.projector';
import { DomainEvent } from '../domain-event/entities/domain-event.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import { WebSocketModule } from '../websocket/websocket.module';
import { PaymentModule } from '../payment/payment.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    DomainEventModule,
    EntitlementModule,
    FeatureToggleModule,
    ChannelAdapterModule,
    WebSocketModule,
    PaymentModule,
    MediaModule,
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Product,
      TenantOrderCounter,
      OrderItemReservation,
      StockMovement,
      Customer,
      TenantChannel,
      Tenant,
      OrderPaymentProof,
      OrderCreationIdempotency,
      DomainEvent,
      Conversation,
      Message,
    ]),
  ],
  controllers: [OrderController],
  providers: [
    OrderService,
    OrderNumberService,
    OrderReservationService,
    OrderTransitionService,
    OrderExpiryWorker,
    OrderCreationService,
    OrderCreationCleanupWorker,
    OrderActivityProjector,
  ],
  exports: [
    OrderService,
    OrderNumberService,
    OrderCreationService,
    OrderTransitionService,
  ],
})
export class OrderModule {}
