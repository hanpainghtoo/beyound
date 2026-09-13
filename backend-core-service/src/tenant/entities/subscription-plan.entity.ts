import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column()
  name: string;

  /**
   * Plan 13 Phase 1: plan category. `trial` plans are one-time,
   * auto-approved, non-renewable, non-requestable, top-up-ineligible, and use
   * `durationDays` as their trial length in days. `business` plans use Yangon
   * calendar-month periods and must not use `durationDays` for their active
   * period. Defaults to `business` so existing rows remain business plans.
   */
  @ApiProperty({ enum: ['business', 'trial'], default: 'business' })
  @Column({
    name: 'plan_type',
    type: 'varchar',
    length: 20,
    default: 'business',
  })
  planType: 'business' | 'trial';

  /** Business catalog visibility; trial plans must set this to false. */
  @ApiProperty({ default: true })
  @Column({ name: 'requestable', type: 'boolean', default: true })
  requestable: boolean;

  /** Whether the plan renews; trial plans must set this to false. */
  @ApiProperty({ default: true })
  @Column({ name: 'renewable', type: 'boolean', default: true })
  renewable: boolean;

  /** Whether tenants may purchase top-ups against this plan; false for trial. */
  @ApiProperty({ default: true })
  @Column({ name: 'top_up_allowed', type: 'boolean', default: true })
  topUpAllowed: boolean;

  /** Whether a paid period for this plan skips admin activation; true for trial. */
  @ApiProperty({ default: false })
  @Column({ name: 'auto_approve', type: 'boolean', default: false })
  autoApprove: boolean;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  description: string;

  @ApiProperty()
  @Column({
    name: 'monthly_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  monthlyPrice: number;

  /**
   * Plan 13: for `plan_type = trial` this is the trial length in days
   * (the source of truth for trial duration, replacing `features.trialDays`).
   * For `business` plans it is a deprecated legacy purchased-period length;
   * business periods use Yangon calendar months and must not use this value
   * for period boundaries.
   */
  @ApiProperty({
    description:
      'Trial length in days for trial plans; legacy value for business plans.',
  })
  @Column({ name: 'duration_days', default: 30 })
  durationDays: number;

  /**
   * @deprecated Legacy combined/directional selector. New plans always enforce
   * independent inbound and outbound limits.
   */
  @ApiProperty({ enum: ['combined', 'directional'], deprecated: true })
  @Column({ name: 'message_quota_mode', default: 'combined' })
  messageQuotaMode: string;

  @ApiProperty()
  @Column({ name: 'max_csrs', default: 5 })
  maxCsrs: number;

  @ApiProperty()
  @Column({ name: 'max_channels', default: 3 })
  maxChannels: number;

  /**
   * @deprecated Legacy aggregate message cap. New enforcement uses
   * inboundMessageLimit and outboundMessageLimit independently.
   */
  @ApiProperty({ nullable: true, deprecated: true })
  @Column({
    name: 'message_limit',
    type: 'integer',
    nullable: true,
    default: null,
  })
  messageLimit: number | null;

  @ApiProperty({
    nullable: true,
    description:
      'Monthly inbound message limit. null means unlimited; 0 means blocked.',
  })
  @Column({
    name: 'inbound_message_limit',
    type: 'integer',
    nullable: true,
    default: null,
  })
  inboundMessageLimit: number | null;

  @ApiProperty({
    nullable: true,
    description:
      'Monthly outbound message limit. null means unlimited; 0 means blocked.',
  })
  @Column({
    name: 'outbound_message_limit',
    type: 'integer',
    nullable: true,
    default: null,
  })
  outboundMessageLimit: number | null;

  @ApiProperty()
  @Column({
    name: 'allowed_providers',
    type: 'text',
    array: true,
    default: () => "'{messenger}'",
  })
  allowedProviders: string[];

  @ApiProperty({ nullable: true })
  @Column({
    name: 'api_limit',
    type: 'integer',
    nullable: true,
    default: null,
  })
  apiLimit: number | null;

  @ApiProperty()
  @Column({ name: 'storage_limit_gb', default: 1 })
  storageLimitGb: number;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  features: Record<string, any>;

  @ApiProperty({ enum: ['active', 'inactive', 'archived'] })
  @Column({ default: 'active' })
  status: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
