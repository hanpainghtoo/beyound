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
  VersionColumn,
} from 'typeorm';

import { Tenant } from '../../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../../tenant/entities/subscription-plan.entity';

export const entitlementLifecycleStates = [
  'trial_active',
  'trial_grace',
  'paid_active',
  'payment_grace',
  'suspended',
  'expired',
  'cancelled',
  'reactivation_pending',
] as const;

export type EntitlementLifecycleState =
  (typeof entitlementLifecycleStates)[number];

@Entity('tenant_entitlements')
@Index('UQ_tenant_entitlements_tenant', ['tenantId'], { unique: true })
@Index('IDX_tenant_entitlements_state_trial_end', ['state', 'trialEndsAt'])
@Index('IDX_tenant_entitlements_state_grace_end', ['state', 'graceEndsAt'])
@Index('IDX_tenant_entitlements_state_paid_end', ['state', 'paidPeriodEndsAt'])
export class TenantEntitlement {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @ApiProperty({ enum: entitlementLifecycleStates })
  @Column({ type: 'varchar', length: 40 })
  state: EntitlementLifecycleState;

  @ApiProperty()
  @Column({ name: 'trial_starts_at', type: 'timestamptz', nullable: true })
  trialStartsAt: Date | null;

  @ApiProperty()
  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  @ApiProperty()
  @Column({ name: 'grace_ends_at', type: 'timestamptz', nullable: true })
  graceEndsAt: Date | null;

  @ApiProperty()
  @Column({
    name: 'paid_period_starts_at',
    type: 'timestamptz',
    nullable: true,
  })
  paidPeriodStartsAt: Date | null;

  @ApiProperty()
  @Column({ name: 'paid_period_ends_at', type: 'timestamptz', nullable: true })
  paidPeriodEndsAt: Date | null;

  @ApiProperty()
  @Column({ name: 'suspended_at', type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  @ApiProperty()
  @Column({
    name: 'suspension_reason',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  suspensionReason: string | null;

  @ApiProperty()
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @ApiProperty()
  @Column({
    name: 'cancellation_reason',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  cancellationReason: string | null;

  @ApiProperty()
  @Column({
    name: 'reactivation_requested_at',
    type: 'timestamptz',
    nullable: true,
  })
  reactivationRequestedAt: Date | null;

  @ApiProperty()
  @Column({ name: 'reactivation_evidence', type: 'jsonb', default: {} })
  reactivationEvidence: Record<string, unknown>;

  @ApiProperty()
  @VersionColumn({ name: 'version' })
  version: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;
}
