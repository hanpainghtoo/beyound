import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('tenant_analytics')
export class TenantAnalytics {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ type: 'date' })
  date: Date;

  @ApiProperty()
  @Column({ name: 'total_conversations', default: 0 })
  totalConversations: number;

  @ApiProperty()
  @Column({ name: 'new_conversations', default: 0 })
  newConversations: number;

  @ApiProperty()
  @Column({ name: 'resolved_conversations', default: 0 })
  resolvedConversations: number;

  @ApiProperty()
  @Column({ name: 'total_messages', default: 0 })
  totalMessages: number;

  @ApiProperty()
  @Column({ name: 'avg_response_time_seconds', default: 0 })
  avgResponseTimeSeconds: number;

  @ApiProperty()
  @Column({ name: 'avg_resolution_time_seconds', default: 0 })
  avgResolutionTimeSeconds: number;

  @ApiProperty()
  @Column({ name: 'active_csrs', default: 0 })
  activeCsrs: number;

  @ApiProperty()
  @Column({
    name: 'customer_satisfaction_avg',
    type: 'decimal',
    precision: 3,
    scale: 2,
    nullable: true,
  })
  customerSatisfactionAvg: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
