import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { Order } from '../order/entities/order.entity';
import { Customer } from '../customer/entities/customer.entity';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { FeatureToggleModule } from '../feature-toggle/feature-toggle.module';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Customer]),
    EntitlementModule,
    FeatureToggleModule,
    OrderModule,
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService],
})
export class DeliveryModule {}
