import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Tenant } from '../../tenant/entities/tenant.entity';
import type { SubscriptionPeriodStatus } from '../subscription-period.types';
import { TenantSubscriptionPeriod } from './tenant-subscription-period.entity';

export const SUBSCRIPTION_PERIOD_EVENT_TYPES = [
  'period_created',
  'payment_confirmed',
  'period_activated',
  'period_expired',
  'period_cancelled',
  'early_renewal_promoted',
  'period_backfilled',
  // Plan 13 Phase 1: administrative approval and upgrade lifecycle events.
  'period_admin_activation_approved',
  'upgrade_requested',
  'upgrade_payment_confirmed',
  'upgrade_approved',
  'upgrade_rejected',
  'upgrade_stale',
  'upgrade_cancelled',
  'upgrade_revision_created',
  // Plan 14 Phase 1 (task 1.4): trial lifecycle + upgrade-effective events.
  'trial_period_created',
  'trial_period_expired',
  'trial_conversion_requested',
  'trial_conversion_payment_confirmed',
  'trial_conversion_approved',
  'trial_period_closed_on_conversion',
  'trial_conversion_stale',
  'upgrade_effective_applied',
] as const;
export type SubscriptionPeriodEventType =
  (typeof SUBSCRIPTION_PERIOD_EVENT_TYPES)[number];

@Entity('subscription_period_events')
@Index('IDX_subscription_period_events_period_created', [
  'subscriptionPeriodId',
  'createdAt',
])
@Index('IDX_subscription_period_events_tenant_created', [
  'tenantId',
  'createdAt',
])
@Index('UQ_subscription_period_events_idempotency', ['idempotencyKey'], {
  unique: true,
  where: 'idempotency_key IS NOT NULL',
})
export class SubscriptionPeriodEvent {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'subscription_period_id', type: 'uuid' })
  subscriptionPeriodId: string;

  @ApiProperty()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ApiProperty({ enum: SUBSCRIPTION_PERIOD_EVENT_TYPES })
  @Column({ name: 'event_type', type: 'varchar', length: 40 })
  eventType: SubscriptionPeriodEventType;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'previous_status',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  previousStatus: SubscriptionPeriodStatus | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'new_status', type: 'varchar', length: 40, nullable: true })
  newStatus: SubscriptionPeriodStatus | null;

  @ApiProperty()
  @Column({ name: 'actor_type', type: 'varchar', length: 40 })
  actorType: string;

  @ApiProperty()
  @Column({ name: 'actor_id', type: 'varchar', length: 120, nullable: true })
  actorId: string | null;

  @ApiProperty()
  @Column({ name: 'source', type: 'varchar', length: 80 })
  source: string;

  @ApiProperty()
  @Column({ name: 'reason', type: 'varchar', length: 240 })
  reason: string;

  @ApiProperty()
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  idempotencyKey: string | null;

  @ApiProperty()
  @Column({ name: 'metadata', type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => TenantSubscriptionPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_period_id' })
  subscriptionPeriod: TenantSubscriptionPeriod;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
