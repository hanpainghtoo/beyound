import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { Customer } from '../customer/entities/customer.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Customer,
      Conversation,
      Message,
      TenantChannel,
      TenantUser,
    ]),
  ],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
