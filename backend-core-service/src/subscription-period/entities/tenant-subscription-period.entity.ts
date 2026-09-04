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
import {
  SUBSCRIPTION_PERIOD_ACTIVATION_REASONS,
  SUBSCRIPTION_PERIOD_ADMIN_ACTIVATION_STATUSES,
  SUBSCRIPTION_PERIOD_END_REASONS,
  SUBSCRIPTION_PERIOD_PAYMENT_STATUSES,
  SUBSCRIPTION_PERIOD_START_OPTIONS,
  SUBSCRIPTION_PERIOD_STATUSES,
  SUBSCRIPTION_PERIOD_TYPES,
  type SubscriptionPeriodActivationReason,
  type SubscriptionPeriodAdminActivationStatus,
  type SubscriptionPeriodEndReason,
  type SubscriptionPeriodPaymentStatus,
  type SubscriptionPeriodStartOption,
  type SubscriptionPeriodStatus,
  type SubscriptionPeriodType,
  type SubscriptionQuotaSnapshot,
} from '../subscription-period.types';

@Entity('tenant_subscription_periods')
// Index names must match the additive migration exactly so dev schema sync
// and future migration:generate runs do not see duplicate indexes.
// Plan 14 Phase 1 (task 1.3): the single one-active invariant is split into
// one-active-paid + one-active-trial so a trial and a paid conversion pair can
// coexist while the paid period awaits admin activation.
@Index('IDX_subscription_periods_tenant_status', ['tenantId', 'periodStatus'])
@Index('IDX_subscription_periods_tenant_sequence', [
  'tenantId',
  'sequenceNumber',
])
@Index('IDX_subscription_periods_status_end', ['periodStatus', 'periodEndAt'])
@Index('IDX_subscription_periods_tenant_admin_activation', [
  'tenantId',
  'adminActivationStatus',
])
@Index('UQ_subscription_periods_billing_record', ['billingRecordId'], {
  unique: true,
  where: 'billing_record_id IS NOT NULL',
})
@Index('UQ_subscription_periods_one_active_paid', ['tenantId'], {
  unique: true,
  where: "period_type = 'paid' AND period_status = 'active'",
})
@Index('UQ_subscription_periods_one_active_trial', ['tenantId'], {
  unique: true,
  where: "period_type = 'trial' AND period_status = 'active'",
})
export class TenantSubscriptionPeriod {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'billing_record_id', type: 'uuid', nullable: true })
  billingRecordId: string | null;

  @ApiProperty({ enum: SUBSCRIPTION_PERIOD_TYPES })
  @Column({ name: 'period_type', type: 'varchar', default: 'paid' })
  periodType: SubscriptionPeriodType;

  @ApiProperty({ enum: SUBSCRIPTION_PERIOD_STATUSES })
  @Column({ name: 'period_status', type: 'varchar', default: 'upcoming' })
  periodStatus: SubscriptionPeriodStatus;

  @ApiProperty({ enum: SUBSCRIPTION_PERIOD_PAYMENT_STATUSES })
  @Column({ name: 'payment_status', type: 'varchar', default: 'pending' })
  paymentStatus: SubscriptionPeriodPaymentStatus;

  @ApiProperty()
  @Column({ name: 'duration_days', type: 'integer' })
  durationDays: number;

  @ApiProperty({ nullable: true })
  @Column({ name: 'period_start_at', type: 'timestamptz', nullable: true })
  periodStartAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'period_end_at', type: 'timestamptz', nullable: true })
  periodEndAt: Date | null;

  // Plan 9 Phase 2: calendar-month contract (task 2.2). The Yangon calendar
  // month window [monthStartAt, monthEndAt) is the authoritative schedule.
  // For aligned periods it equals [periodStartAt, periodEndAt). Legacy rows
  // keep NULL until the forward-only cutover assigns monthly periods.
  @ApiProperty({ nullable: true })
  @Column({ name: 'month_start_at', type: 'timestamptz', nullable: true })
  monthStartAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'month_end_at', type: 'timestamptz', nullable: true })
  monthEndAt: Date | null;

  @ApiProperty({ nullable: true, enum: SUBSCRIPTION_PERIOD_START_OPTIONS })
  @Column({ name: 'start_option', type: 'varchar', length: 40, nullable: true })
  startOption: SubscriptionPeriodStartOption | null;

  // Plan 13 Phase 1 (task 1.1): administrative approval, separate from the
  // calendar `periodStatus` and from `paymentStatus`. Existing operational
  // periods default to `approved` so rollout never blocks current tenants;
  // newly confirmed payments set `pending` until a Platform Admin approves.
  @ApiProperty({
    enum: SUBSCRIPTION_PERIOD_ADMIN_ACTIVATION_STATUSES,
    default: 'approved',
  })
  @Column({
    name: 'admin_activation_status',
    type: 'varchar',
    length: 40,
    default: 'approved',
  })
  adminActivationStatus: SubscriptionPeriodAdminActivationStatus;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'admin_activated_at',
    type: 'timestamptz',
    nullable: true,
  })
  adminActivatedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'admin_activated_by', type: 'uuid', nullable: true })
  adminActivatedBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'admin_activation_reason',
    type: 'varchar',
    length: 240,
    nullable: true,
  })
  adminActivationReason: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'scheduled_start_at', type: 'timestamptz', nullable: true })
  scheduledStartAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'scheduled_end_at', type: 'timestamptz', nullable: true })
  scheduledEndAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'expired_at', type: 'timestamptz', nullable: true })
  expiredAt: Date | null;

  @ApiProperty({ nullable: true, enum: SUBSCRIPTION_PERIOD_END_REASONS })
  @Column({ name: 'end_reason', type: 'varchar', length: 40, nullable: true })
  endReason: SubscriptionPeriodEndReason | null;

  @ApiProperty({
    nullable: true,
    enum: SUBSCRIPTION_PERIOD_ACTIVATION_REASONS,
  })
  @Column({
    name: 'activation_reason',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  activationReason: SubscriptionPeriodActivationReason | null;

  @ApiProperty()
  @Column({ name: 'sequence_number', type: 'integer' })
  sequenceNumber: number;

  @ApiProperty()
  @Column({ name: 'quota_snapshot', type: 'jsonb' })
  quotaSnapshot: SubscriptionQuotaSnapshot;

  // Plan 14 Phase 1 (task 1.2): trial-to-paid conversion linkage. Only set
  // when a conversion exists; both sides stay null otherwise.
  @ApiProperty({ nullable: true })
  @Column({ name: 'converted_to_period_id', type: 'uuid', nullable: true })
  convertedToPeriodId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'converted_from_period_id', type: 'uuid', nullable: true })
  convertedFromPeriodId: string | null;

  @ApiProperty()
  @Column({ name: 'metadata', type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

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

  @ManyToOne(() => TenantBillingRecord, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'billing_record_id' })
  billingRecord: TenantBillingRecord | null;

  // Self-referencing conversion relations (Plan 14 Phase 1, task 1.2).
  @ManyToOne(() => TenantSubscriptionPeriod, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'converted_to_period_id' })
  convertedToPeriod: TenantSubscriptionPeriod | null;

  @ManyToOne(() => TenantSubscriptionPeriod, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'converted_from_period_id' })
  convertedFromPeriod: TenantSubscriptionPeriod | null;
}
