import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { FeatureCategory } from './feature-category.entity';

/**
 * Plan 55: per-tenant on/off flag for one {@link FeatureCategory}.
 * One row per (tenant, category) pair. Absent row means enabled.
 */
@Entity('tenant_feature_configs')
@Index(
  'UQ_tenant_feature_configs_tenant_feature',
  ['tenantId', 'featureCategoryId'],
  {
    unique: true,
  },
)
@Index('IDX_tenant_feature_configs_tenant', ['tenantId'])
@Index('IDX_tenant_feature_configs_category', ['featureCategoryId'])
export class TenantFeatureConfig {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'feature_category_id' })
  featureCategoryId: string;

  @ApiProperty()
  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ApiProperty({ type: () => FeatureCategory, required: false })
  category?: FeatureCategory;
}
