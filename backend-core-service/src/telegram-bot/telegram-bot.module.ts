import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { TelegramBotRouter } from './telegram-bot.router';
import {
  REDIS_CLIENT,
  TelegramSessionService,
} from './telegram-session.service';
import { TelegramCommerceService } from './telegram-commerce.service';
import { ProductModule } from '../product/product.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Customer } from '../customer/entities/customer.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { OrderModule } from '../order/order.module';
import { PaymentModule } from '../payment/payment.module';
import { MediaModule } from '../media/media.module';
import { BotTemplateModule } from '../bot-template/bot-template.module';
import { WebSocketModule } from '../websocket/websocket.module';

export const telegramRedisProvider = {
  provide: REDIS_CLIENT,
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
};

@Module({
  imports: [
    ConfigModule,
    ProductModule,
    OrderModule,
    PaymentModule,
    MediaModule,
    BotTemplateModule,
    WebSocketModule,
    TypeOrmModule.forFeature([Tenant, TenantChannel]),
    TypeOrmModule.forFeature([Customer, Order, OrderItem]),
    TypeOrmModule.forFeature([Conversation, Message]),
  ],
  providers: [
    telegramRedisProvider,
    TelegramBotRouter,
    TelegramSessionService,
    TelegramCommerceService,
  ],
  exports: [TelegramBotRouter, TelegramSessionService, TelegramCommerceService],
})
export class TelegramBotModule {}
