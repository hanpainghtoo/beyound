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
import { TenantSubscriptionAddOnPurchase } from './tenant-subscription-add-on-purchase.entity';
import type { AddOnPurchaseEventType } from '../subscription-add-on-purchase.types';

/**
 * Purchase lifecycle audit trail (Plan 9 Phase 4, task 4.8).
 *
 * Events: created, payment-confirmed, activated, expired, cancelled.
 * Refund events are deliberately absent in this release. Idempotency keys are
 * unique per event so the same payment/activation cannot be granted twice.
 */
@Entity('tenant_subscription_add_on_purchase_events')
@Index('IDX_subscription_add_on_purchase_events_purchase_created', [
  'purchaseId',
  'createdAt',
])
@Index('IDX_subscription_add_on_purchase_events_tenant_created', [
  'tenantId',
  'createdAt',
])
@Index(
  'UQ_subscription_add_on_purchase_events_idempotency',
  ['tenantId', 'eventType', 'idempotencyKey'],
  {
    unique: true,
    where: 'idempotency_key IS NOT NULL',
  },
)
export class TenantSubscriptionAddOnPurchaseEvent {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'purchase_id', type: 'uuid' })
  purchaseId: string;

  @ApiProperty()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ApiProperty({
    enum: [
      'add_on_purchase_created',
      'add_on_payment_confirmed',
      'add_on_activated',
      'add_on_expired',
      'add_on_cancelled',
    ],
  })
  @Column({ name: 'event_type', type: 'varchar', length: 40 })
  eventType: AddOnPurchaseEventType;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'previous_status',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  previousStatus: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'new_status', type: 'varchar', length: 40, nullable: true })
  newStatus: string | null;

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

  @ManyToOne(() => TenantSubscriptionAddOnPurchase, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_id' })
  purchase: TenantSubscriptionAddOnPurchase;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
