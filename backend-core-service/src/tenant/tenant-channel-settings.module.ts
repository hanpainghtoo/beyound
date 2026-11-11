import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantChannelSettings } from './entities/tenant-channel-settings.entity';
import { TenantChannelSettingsService } from './tenant-channel-settings.service';
import { BotTemplateModule } from '../bot-template/bot-template.module';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TenantBotTemplateChannel } from '../bot-template/entities/tenant-bot-template-channel.entity';
import { MetaApp } from '../channel/entities/meta-app.entity';
import { MetaAppResolver } from '../channel/meta-app-resolver.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantChannelSettings, MetaApp,
      TenantChannel,
      TenantBotTemplateChannel,
    ]),
    BotTemplateModule,
  ],
  providers: [TenantChannelSettingsService, MetaAppResolver],
  exports: [TenantChannelSettingsService, MetaAppResolver],
})
export class TenantChannelSettingsModule {}
