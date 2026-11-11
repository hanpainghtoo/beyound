import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { TenantChannel } from '../../channel/entities/tenant-channel.entity';
import { TenantBotTemplate } from './tenant-bot-template.entity';

/**
 * Template → channel integration mapping. One channel renders at most one
 * template (`UNIQUE(channel_id)`); `tenant_id` is denormalized so the
 * tenant-scoping invariant (template.tenant = channel.tenant) is auditable
 * and enforceable at the service layer.
 */
@Entity('tenant_bot_template_channels')
@Unique('uq_tenant_bot_template_channels_channel', ['channelId'])
export class TenantBotTemplateChannel {
  @ApiProperty()
  @PrimaryColumn({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @ApiProperty()
  @PrimaryColumn({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @ApiProperty()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => TenantBotTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: TenantBotTemplate;

  @ManyToOne(() => TenantChannel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel: TenantChannel;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
