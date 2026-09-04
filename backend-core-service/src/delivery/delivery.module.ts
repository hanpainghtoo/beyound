import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { Order } from '../order/entities/order.entity';
import { Customer } from '../customer/entities/customer.entity';
import { EntitlementModule } from '../entitlement/entitlement.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Customer]), EntitlementModule],
  controllers: [DeliveryController],
  providers: [DeliveryService],
})
export class DeliveryModule {}
