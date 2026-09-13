import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { TenantChannel } from '../../channel/entities/tenant-channel.entity';
import { TenantSubscriptionPeriod } from '../../subscription-period/entities/tenant-subscription-period.entity';
import { TenantSubscriptionPeriodUpgradeRevision } from '../../subscription-period/entities/tenant-subscription-period-upgrade-revision.entity';

@Entity('tenant_usage_events')
@Index('IDX_tenant_usage_events_tenant_type_time', [
  'tenantId',
  'usageType',
  'occurredAt',
])
@Index('IDX_tenant_usage_events_channel_provider', [
  'tenantId',
  'channelId',
  'provider',
  'occurredAt',
])
export class TenantUsageEvent {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'channel_id', type: 'uuid', nullable: true })
  channelId: string | null;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  provider: string | null;

  @ApiProperty({ enum: ['api_request', 'provider_message'] })
  @Column({ name: 'usage_type' })
  usageType: 'api_request' | 'provider_message';

  @ApiProperty({ enum: ['request', 'inbound', 'outbound', 'callback'] })
  @Column({ type: 'varchar', nullable: true })
  direction: 'request' | 'inbound' | 'outbound' | 'callback' | null;

  @ApiProperty()
  @Column({ default: 1 })
  quantity: number;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  source: string | null;

  @ApiProperty()
  @Column({ name: 'request_path', type: 'varchar', nullable: true })
  requestPath: string | null;

  @ApiProperty()
  @Column({ name: 'request_method', type: 'varchar', nullable: true })
  requestMethod: string | null;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @ApiProperty()
  @Column({ name: 'source_event_id', type: 'uuid', nullable: true })
  sourceEventId: string | null;

  @ApiProperty()
  @Column({ name: 'source_message_id', type: 'uuid', nullable: true })
  sourceMessageId: string | null;

  @ApiProperty()
  @Column({ name: 'source_request_id', type: 'varchar', nullable: true })
  sourceRequestId: string | null;

  @ApiProperty()
  @Column({ name: 'billing_period_start', type: 'date' })
  billingPeriodStart: Date;

  @ApiProperty()
  @Column({ name: 'billing_period_end', type: 'date' })
  billingPeriodEnd: Date;

  @ApiProperty({ nullable: true })
  @Column({ name: 'subscription_period_id', type: 'uuid', nullable: true })
  subscriptionPeriodId: string | null;

  // Plan 14 Phase 1 (task 1.8): upgrade usage boundary. Usage at/after
  // `upgrade_effective_at` records the upgrade revision that authorized it;
  // historical rows keep NULL and remain readable.
  @ApiProperty({ nullable: true })
  @Column({ name: 'upgrade_revision_id', type: 'uuid', nullable: true })
  upgradeRevisionId: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'occurred_at' })
  occurredAt: Date;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => TenantChannel, { nullable: true })
  @JoinColumn({ name: 'channel_id' })
  channel: TenantChannel;

  @ManyToOne(() => TenantSubscriptionPeriod, { nullable: true })
  @JoinColumn({ name: 'subscription_period_id' })
  subscriptionPeriod: TenantSubscriptionPeriod | null;

  @ManyToOne(() => TenantSubscriptionPeriodUpgradeRevision, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'upgrade_revision_id' })
  upgradeRevision: TenantSubscriptionPeriodUpgradeRevision | null;
}
