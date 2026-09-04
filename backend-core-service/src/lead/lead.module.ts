import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Lead } from './entities/lead.entity';
import {
  PlatformLeadController,
  PublicLeadController,
} from './lead.controller';
import { LeadService } from './lead.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lead])],
  controllers: [PublicLeadController, PlatformLeadController],
  providers: [LeadService],
})
export class LeadModule {}
