import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChannelAdapterService } from './channel-adapter.service';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TenantChannel])],
  providers: [ChannelAdapterService],
  exports: [ChannelAdapterService],
})
export class ChannelAdapterModule {}
