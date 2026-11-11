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
import { TenantUser } from '../../auth/entities/tenant-user.entity';

@Entity('agent_analytics')
export class AgentAnalytics {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'agent_id' })
  agentId: string;

  @ApiProperty()
  @Column({ type: 'date' })
  date: Date;

  @ApiProperty()
  @Column({ name: 'conversations_handled', default: 0 })
  conversationsHandled: number;

  @ApiProperty()
  @Column({ name: 'messages_sent', default: 0 })
  messagesSent: number;

  @ApiProperty()
  @Column({ name: 'avg_response_time_seconds', default: 0 })
  avgResponseTimeSeconds: number;

  @ApiProperty()
  @Column({ name: 'avg_resolution_time_seconds', default: 0 })
  avgResolutionTimeSeconds: number;

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
  @Column({ name: 'online_time_minutes', default: 0 })
  onlineTimeMinutes: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => TenantUser)
  @JoinColumn({ name: 'agent_id' })
  agent: TenantUser;
}
