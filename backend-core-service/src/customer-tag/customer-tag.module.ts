import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CustomerTag } from './entities/customer-tag.entity';
import { CustomerTagService } from './customer-tag.service';
import { CustomerTagController } from './customer-tag.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerTag])],
  controllers: [CustomerTagController],
  providers: [CustomerTagService],
  exports: [CustomerTagService],
})
export class CustomerTagModule {}
