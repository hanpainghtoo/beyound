import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { PlatformAdmin } from '../../auth/entities/platform-admin.entity';
import { TenantUser } from '../../auth/entities/tenant-user.entity';

@Entity('tenants')
export class Tenant {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_code', unique: true })
  tenantCode: string;

  @ApiProperty()
  @Column({ name: 'company_name' })
  companyName: string;

  @ApiProperty()
  @Column({ nullable: true })
  industry: string;

  @ApiProperty()
  @Column({ name: 'business_type', nullable: true })
  businessType: string;

  @ApiProperty()
  @Column({ name: 'contact_person', nullable: true })
  contactPerson: string;

  @ApiProperty()
  @Column({ name: 'contact_email' })
  contactEmail: string;

  @ApiProperty()
  @Column({ name: 'contact_phone', nullable: true })
  contactPhone: string;

  @ApiProperty()
  @Column({ nullable: true })
  website: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  address: string;

  @ApiProperty()
  @Column({ name: 'logo_url', nullable: true })
  logoUrl: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  description: string;

  @ApiProperty({
    enum: ['pending', 'active', 'suspended', 'rejected', 'deleted'],
  })
  @Column({ default: 'pending' })
  status: string;

  @ApiProperty()
  @Column({ name: 'subscription_plan_id', nullable: true })
  subscriptionPlanId: string;

  @ApiProperty()
  @Column({ name: 'subscription_start_date', type: 'date', nullable: true })
  subscriptionStartDate: Date;

  @ApiProperty()
  @Column({ name: 'subscription_end_date', type: 'date', nullable: true })
  subscriptionEndDate: Date;

  @ApiProperty()
  @Column({ name: 'custom_csr_limit', nullable: true })
  customCsrLimit: number;

  @ApiProperty()
  @Column({ name: 'custom_channel_limit', nullable: true })
  customChannelLimit: number;

  @ApiProperty()
  @Column({ name: 'custom_message_limit', nullable: true })
  customMessageLimit: number;

  @ApiProperty()
  @Column({ name: 'custom_api_limit', nullable: true })
  customApiLimit: number;

  @ApiProperty()
  @Column({ default: 'Asia/Yangon' })
  timezone: string;

  @ApiProperty()
  @Column({ default: 'en' })
  language: string;

  @ApiProperty()
  @Column({ name: 'feature_flags', type: 'jsonb', default: {} })
  featureFlags: Record<string, any>;

  @ApiProperty()
  @Column({ name: 'ai_settings', type: 'jsonb', default: { enabled: false } })
  aiSettings: Record<string, any>;

  /** Last calculated storage-capacity state for operator/reporting use only. */
  @ApiProperty()
  @Column({ name: 'storage_capacity_state', type: 'jsonb', default: {} })
  storageCapacityState: Record<string, any>;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ApiProperty()
  @Column({ name: 'approved_at', nullable: true })
  approvedAt: Date;

  @ApiProperty()
  @Column({ name: 'approved_by', nullable: true })
  approvedBy: string;

  // Relations
  @ManyToOne(() => PlatformAdmin)
  @JoinColumn({ name: 'approved_by' })
  approver: PlatformAdmin;

  @OneToMany(() => TenantUser, (user) => user.tenantId)
  users: TenantUser[];
}
