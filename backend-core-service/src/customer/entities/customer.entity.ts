import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { TenantChannel } from '../../channel/entities/tenant-channel.entity';

@Entity('customers')
export class Customer {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'external_id', nullable: true })
  externalId: string;

  @ApiProperty({ required: false, nullable: true })
  @Column({ name: 'channel_id', nullable: true })
  channelId: string | null;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  provider: string | null;

  @ApiProperty()
  @Column({ name: 'full_name', nullable: true })
  fullName: string;

  @ApiProperty()
  @Column({ nullable: true })
  email: string;

  @ApiProperty()
  @Column({ nullable: true })
  phone: string;

  @ApiProperty()
  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl: string;

  @ApiProperty()
  @Column({ default: 'en' })
  language: string;

  @ApiProperty()
  @Column({ nullable: true })
  timezone: string;

  @ApiProperty()
  @Column({ type: 'jsonb', nullable: true })
  location: Record<string, any>;

  @ApiProperty()
  @Column({ name: 'profile_data', type: 'jsonb', default: {} })
  profileData: Record<string, any>;

  @ApiProperty()
  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  notes: string;

  @ApiProperty()
  @Column({ type: 'jsonb', default: [] })
  attachments: Record<string, any>[];

  @ApiProperty({ enum: ['active', 'blocked', 'archived'] })
  @Column({ default: 'active' })
  status: string;

  @ApiProperty()
  @Column({ name: 'first_contact_at', nullable: true })
  firstContactAt: Date;

  @ApiProperty()
  @Column({ name: 'last_contact_at', nullable: true })
  lastContactAt: Date;

  @ApiProperty()
  @Column({ name: 'total_conversations', default: 0 })
  totalConversations: number;

  @ApiProperty({ required: false, nullable: true })
  @Column({ name: 'bot_blocked_at', type: 'timestamptz', nullable: true })
  botBlockedAt: Date | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ name: 'bot_blocked_reason', type: 'text', nullable: true })
  botBlockedReason: string | null;

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

  @ManyToOne(() => TenantChannel, { nullable: true })
  @JoinColumn({ name: 'channel_id' })
  channel: TenantChannel | null;
}
