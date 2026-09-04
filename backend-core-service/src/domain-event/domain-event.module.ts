import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DomainEventController } from './domain-event.controller';
import { DomainEventService } from './domain-event.service';
import { DomainEvent } from './entities/domain-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DomainEvent])],
  controllers: [DomainEventController],
  providers: [DomainEventService],
  exports: [DomainEventService],
})
export class DomainEventModule {}
