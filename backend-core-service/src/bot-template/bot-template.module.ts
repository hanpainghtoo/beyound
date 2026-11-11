import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LoggingModule } from '../logging/logging.module';

import { TenantBotTemplate } from './entities/tenant-bot-template.entity';
import { TenantBotTemplateField } from './entities/tenant-bot-template-field.entity';
import { TenantBotTemplateChannel } from './entities/tenant-bot-template-channel.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TenantChannelSettings } from '../tenant/entities/tenant-channel-settings.entity';
import { CommerceTemplateGuard } from '../common/guards/commerce-template.guard';
import { BotTemplateService } from './bot-template.service';
import { BotTemplateController } from './bot-template.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantBotTemplate,
      TenantBotTemplateField,
      TenantBotTemplateChannel,
      TenantChannel,
      // Read directly by CommerceTemplateGuard: TenantChannelSettingsModule
      // imports this module, so injecting its service here would cycle.
      TenantChannelSettings,
    ]),
    LoggingModule,
  ],
  controllers: [BotTemplateController],
  providers: [BotTemplateService, CommerceTemplateGuard],
  exports: [BotTemplateService],
})
export class BotTemplateModule {}
