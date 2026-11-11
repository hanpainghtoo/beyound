import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FeatureToggleController } from './feature-toggle.controller';
import { FeatureToggleService } from './feature-toggle.service';
import { FeatureCategory } from './entities/feature-category.entity';
import { TenantFeatureConfig } from './entities/tenant-feature-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FeatureCategory, TenantFeatureConfig])],
  controllers: [FeatureToggleController],
  providers: [FeatureToggleService],
  exports: [FeatureToggleService],
})
export class FeatureToggleModule {}
