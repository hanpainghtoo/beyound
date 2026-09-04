import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Tenant } from '../../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../../tenant/entities/subscription-plan.entity';
import { TenantBillingRecord } from '../../platform-admin/entities/tenant-billing-record.entity';
import type {
  SubscriptionUpgradeCarryover,
  SubscriptionUpgradeStatus,
} from '../subscription-period.types';
import { TenantSubscriptionPeriod } from './tenant-subscription-period.entity';

/**
 * Plan 13 Phase 1 (tasks 1.9–1.11): one immutable upgrade revision per current
 * subscription period.
 *
 * The upgrade never overwrites the original period snapshot or resets the
 * usage counter. It records the previous plan, the target plan snapshot, the
 * effective boundary, and the eligible remaining quota carried into the
 * upgraded entitlement (inbound, outbound, API only). The partial unique index
 * `UQ_subscription_upgrade_revisions_period` guarantees at most one
 * non-cancelled upgrade per period; terminal (rejected/stale) revisions remain
 * historical evidence and still consume the monthly slot.
 */
@Entity('subscription_period_upgrade_revisions')
@Index('IDX_subscription_upgrade_revisions_period_created', [
  'subscriptionPeriodId',
  'createdAt',
])
@Index('IDX_subscription_upgrade_revisions_tenant_created', [
  'tenantId',
  'createdAt',
])
export class TenantSubscriptionPeriodUpgradeRevision {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'subscription_period_id', type: 'uuid' })
  subscriptionPeriodId: string;

  @ApiProperty()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'billing_record_id', type: 'uuid', nullable: true })
  billingRecordId: string | null;

  @ApiProperty()
  @Column({ name: 'previous_plan_id', type: 'uuid' })
  previousPlanId: string;

  @ApiProperty()
  @Column({ name: 'upgraded_plan_id', type: 'uuid' })
  upgradedPlanId: string;

  /** Immutable commercial snapshot of the plan in effect before the upgrade. */
  @ApiProperty()
  @Column({ name: 'previous_plan_snapshot', type: 'jsonb' })
  previousPlanSnapshot: Record<string, unknown>;

  /** Immutable commercial snapshot of the target plan being upgraded into. */
  @ApiProperty()
  @Column({ name: 'upgraded_plan_snapshot', type: 'jsonb' })
  upgradedPlanSnapshot: Record<string, unknown>;

  @ApiProperty({
    enum: [
      'requested',
      'pending_payment',
      'approved',
      'rejected',
      'stale',
      'cancelled',
    ],
  })
  @Column({
    name: 'upgrade_status',
    type: 'varchar',
    length: 40,
    default: 'requested',
  })
  upgradeStatus: SubscriptionUpgradeStatus;

  @ApiProperty({ nullable: true })
  @Column({ name: 'upgrade_requested_at', type: 'timestamptz' })
  upgradeRequestedAt: Date;

  /**
   * When the upgrade became effective (approved and activated). Usage at or
   * after this instant is evaluated under the upgraded plan, the carryover
   * grant, and existing valid top-ups.
   */
  @ApiProperty({ nullable: true })
  @Column({ name: 'upgrade_effective_at', type: 'timestamptz', nullable: true })
  upgradeEffectiveAt: Date | null;

  /** Remaining eligible quota at approval: inbound, outbound, API only. */
  @ApiProperty()
  @Column({ name: 'carryover', type: 'jsonb', default: {} })
  carryover: SubscriptionUpgradeCarryover;

  @ApiProperty({ nullable: true })
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 240,
    nullable: true,
  })
  rejectionReason: string | null;

  @ApiProperty()
  @Column({ name: 'metadata', type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => TenantSubscriptionPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_period_id' })
  subscriptionPeriod: TenantSubscriptionPeriod;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'previous_plan_id' })
  previousPlan: SubscriptionPlan;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'upgraded_plan_id' })
  upgradedPlan: SubscriptionPlan;

  @ManyToOne(() => TenantBillingRecord, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'billing_record_id' })
  billingRecord: TenantBillingRecord | null;
}
