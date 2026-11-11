import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Tenant } from './tenant.entity';

/**
 * Per-tenant channel settings. One row per tenant; a missing row means all
 * template settings are off ( commerce flows stay disabled until a platform
 * admin enables them explicitly).
 */
@Entity('tenant_channel_settings')
@Check(`"telegram_bot_template" IN ('commerce')`)
@Check(`"facebook_mode" IN ('platform_one_click', 'byo_app')`)
export class TenantChannelSettings {
  @ApiProperty()
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ApiProperty({ enum: ['commerce'], nullable: true })
  @Column({ name: 'telegram_bot_template', type: 'varchar', nullable: true })
  telegramBotTemplate: string | null;

  @ApiProperty({
    enum: ['platform_one_click', 'byo_app'],
    default: 'platform_one_click',
  })
  @Column({
    name: 'facebook_mode',
    type: 'varchar',
    default: 'platform_one_click',
  })
  facebookMode: 'platform_one_click' | 'byo_app';

  @ApiProperty({ nullable: true })
  @Column({
    name: 'facebook_business_verified',
    type: 'boolean',
    nullable: true,
  })
  facebookBusinessVerified: boolean | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
