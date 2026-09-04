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
import { Customer } from '../../customer/entities/customer.entity';
import { TenantChannel } from '../../channel/entities/tenant-channel.entity';
import { TenantUser } from '../../auth/entities/tenant-user.entity';

@Entity('conversations')
export class Conversation {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'customer_id' })
  customerId: string;

  @ApiProperty()
  @Column({ name: 'channel_id' })
  channelId: string;

  @ApiProperty()
  @Column({ name: 'assigned_csr_id', nullable: true })
  assignedCsrId: string;

  @ApiProperty()
  @Column({ name: 'assigned_at', nullable: true })
  assignedAt: Date;

  @ApiProperty()
  @Column({ name: 'conversation_id', nullable: true })
  conversationId: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  provider: string | null;

  @ApiProperty()
  @Column({ nullable: true })
  subject: string;

  @ApiProperty({ enum: ['open', 'pending', 'resolved', 'closed'] })
  @Column({ default: 'open' })
  status: string;

  @ApiProperty({ enum: ['low', 'normal', 'high', 'urgent'] })
  @Column({ default: 'normal' })
  priority: string;

  @ApiProperty()
  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @ApiProperty()
  @Column({ name: 'first_message_at', nullable: true })
  firstMessageAt: Date;

  @ApiProperty()
  @Column({ name: 'last_message_at', nullable: true })
  lastMessageAt: Date;

  @ApiProperty()
  @Column({ name: 'last_customer_message_at', nullable: true })
  lastCustomerMessageAt: Date;

  @ApiProperty()
  @Column({ name: 'last_csr_response_at', nullable: true })
  lastCsrResponseAt: Date;

  @ApiProperty()
  @Column({ name: 'first_response_at', nullable: true })
  firstResponseAt: Date;

  @ApiProperty()
  @Column({ name: 'sla_due_at', nullable: true })
  slaDueAt: Date;

  @ApiProperty()
  @Column({ name: 'closed_at', nullable: true })
  closedAt: Date;

  @ApiProperty()
  @Column({ name: 'close_reason', nullable: true })
  closeReason: string;

  @ApiProperty()
  @Column({ name: 'resolved_at', nullable: true })
  resolvedAt: Date;

  @ApiProperty()
  @Column({ name: 'resolution_time_seconds', nullable: true })
  resolutionTimeSeconds: number;

  @ApiProperty()
  @Column({ name: 'customer_satisfaction_rating', nullable: true })
  customerSatisfactionRating: number;

  @ApiProperty()
  @Column({ name: 'customer_feedback', type: 'text', nullable: true })
  customerFeedback: string;

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

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => TenantChannel)
  @JoinColumn({ name: 'channel_id' })
  channel: TenantChannel;

  @ManyToOne(() => TenantUser)
  @JoinColumn({ name: 'assigned_csr_id' })
  assignedCsr: TenantUser;
}
