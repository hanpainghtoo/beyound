import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrderController } from './order.controller';
import { OrderService } from './order.service';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { DomainEventModule } from '../domain-event/domain-event.module';
import { Product } from '../product/entities/product.entity';
import { EntitlementModule } from '../entitlement/entitlement.module';

@Module({
  imports: [
    DomainEventModule,
    EntitlementModule,
    TypeOrmModule.forFeature([Order, OrderItem, Product]),
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
