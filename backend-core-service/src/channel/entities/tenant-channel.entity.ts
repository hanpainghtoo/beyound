import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('tenant_channels')
@Index('IDX_tenant_channels_tenant_status', ['tenantId', 'status'])
export class TenantChannel {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty({ enum: ['messenger', 'viber', 'telegram', 'tiktok'] })
  @Column({ name: 'channel_type' })
  channelType: string;

  @ApiProperty()
  @Column({ name: 'channel_name' })
  channelName: string;

  @ApiProperty()
  @Column({ name: 'display_name', nullable: true })
  displayName: string;

  @ApiProperty({ enum: ['active', 'inactive', 'error', 'pending', 'disabled'] })
  @Column({ default: 'active' })
  status: string;

  /** Whether this channel is covered by the monthly plan or a temporary slot top-up. */
  @ApiProperty({ enum: ['base_plan', 'top_up'] })
  @Column({ name: 'entitlement_origin', default: 'base_plan' })
  entitlementOrigin: 'base_plan' | 'top_up';

  /** Exclusive month boundary at which a top-up-origin channel may be disabled. */
  @ApiProperty({ nullable: true })
  @Column({
    name: 'entitlement_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  entitlementExpiresAt: Date | null;

  /** Tenant-selected retention preference applied at capacity expiry. */
  @ApiProperty()
  @Column({ name: 'retention_selected', default: false })
  retentionSelected: boolean;

  @ApiProperty({ nullable: true })
  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true })
  disabledAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'disabled_reason', type: 'varchar', nullable: true })
  disabledReason: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'disabled_previous_status', type: 'varchar', nullable: true })
  disabledPreviousStatus: string | null;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'disabled_previous_connection_status',
    type: 'varchar',
    nullable: true,
  })
  disabledPreviousConnectionStatus: string | null;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  configuration: Record<string, any>;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  credentials: Record<string, any>;

  @ApiProperty()
  @Column({ name: 'credential_schema', type: 'jsonb', default: [] })
  credentialSchema: Record<string, any>[];

  @ApiProperty({ enum: ['missing_required', 'configured', 'encrypted'] })
  @Column({ name: 'credential_status', default: 'missing_required' })
  credentialStatus: string;

  @ApiProperty({
    enum: [
      'pending_configuration',
      'credentials_verified',
      'webhook_registering',
      'awaiting_first_event',
      'ready',
      'connected',
      'error',
      'disabled',
      'locally_disabled_provider_cleanup_pending',
    ],
  })
  @Column({ name: 'connection_status', default: 'pending_configuration' })
  connectionStatus: string;

  @ApiProperty()
  @Column({ name: 'provider_account_id', type: 'varchar', nullable: true })
  providerAccountId: string | null;

  @ApiProperty()
  @Column({
    name: 'credentials_verified_at',
    type: 'timestamp',
    nullable: true,
  })
  credentialsVerifiedAt: Date | null;

  @ApiProperty()
  @Column({ name: 'connected_at', nullable: true })
  connectedAt: Date;

  @ApiProperty()
  @Column({ name: 'credential_last_updated_at', nullable: true })
  credentialLastUpdatedAt: Date;

  @ApiProperty()
  @Column({ name: 'last_connection_test_at', nullable: true })
  lastConnectionTestAt: Date;

  @ApiProperty()
  @Column({ name: 'rate_limit_metadata', type: 'jsonb', default: {} })
  rateLimitMetadata: Record<string, any>;

  @ApiProperty()
  @Column({ name: 'webhook_url', type: 'varchar', nullable: true })
  webhookUrl: string | null;

  @ApiProperty({
    enum: [
      'not_required',
      'pending',
      'registered',
      'failed',
      'requires_reregistration',
    ],
  })
  @Column({ name: 'webhook_registration_status', default: 'pending' })
  webhookRegistrationStatus: string;

  @ApiProperty()
  @Column({ name: 'webhook_registered_at', type: 'timestamp', nullable: true })
  webhookRegisteredAt: Date | null;

  @ApiProperty()
  @Column({
    name: 'webhook_registration_checked_at',
    type: 'timestamp',
    nullable: true,
  })
  webhookRegistrationCheckedAt: Date | null;

  @ApiProperty()
  @Column({
    name: 'webhook_registration_error_code',
    type: 'varchar',
    nullable: true,
  })
  webhookRegistrationErrorCode: string | null;

  @ApiProperty()
  @Column({
    name: 'first_inbound_verified_at',
    type: 'timestamp',
    nullable: true,
  })
  firstInboundVerifiedAt: Date | null;

  @ApiProperty()
  @Column({ name: 'last_inbound_at', type: 'timestamp', nullable: true })
  lastInboundAt: Date | null;

  @ApiProperty()
  @Column({ name: 'last_outbound_at', type: 'timestamp', nullable: true })
  lastOutboundAt: Date | null;

  @ApiProperty()
  @Column({ name: 'welcome_message', type: 'text', nullable: true })
  welcomeMessage: string;

  @ApiProperty()
  @Column({ name: 'auto_reply_enabled', default: false })
  autoReplyEnabled: boolean;

  @ApiProperty()
  @Column({ name: 'auto_reply_message', type: 'text', nullable: true })
  autoReplyMessage: string;

  @ApiProperty({ enum: ['round_robin', 'least_busy', 'manual'] })
  @Column({ name: 'assignment_rule', default: 'round_robin' })
  assignmentRule: string;

  @ApiProperty()
  @Column({ name: 'business_hours', type: 'jsonb', default: {} })
  businessHours: Record<string, any>;

  @ApiProperty()
  @Column({ name: 'notification_settings', type: 'jsonb', default: {} })
  notificationSettings: Record<string, any>;

  @ApiProperty()
  @Column({ name: 'last_sync_at', nullable: true })
  lastSyncAt: Date;

  @ApiProperty()
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
