import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { TenantPaymentMethodVersion } from './entities/payment-method-version.entity';
import { TenantPaymentMethod } from './entities/payment-method.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { Order } from '../order/entities/order.entity';
import { LoggingModule } from '../logging/logging.module';
import { NotificationModule } from '../notification/notification.module';
import { MediaModule } from '../media/media.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantPaymentMethodVersion,
      TenantPaymentMethod,
      Tenant,
      TenantUser,
      Order,
    ]),
    LoggingModule,
    NotificationModule,
    MediaModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
