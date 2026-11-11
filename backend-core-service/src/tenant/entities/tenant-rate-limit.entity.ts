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
import { Tenant } from './tenant.entity';

@Entity('tenant_rate_limits')
export class TenantRateLimit {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'messages_per_minute', default: 60 })
  messagesPerMinute: number;

  @ApiProperty()
  @Column({ name: 'api_requests_per_minute', default: 100 })
  apiRequestsPerMinute: number;

  @ApiProperty()
  @Column({ name: 'webhook_events_per_minute', default: 50 })
  webhookEventsPerMinute: number;

  @ApiProperty({ enum: ['hard_limit', 'soft_warning', 'grace_limit'] })
  @Column({ name: 'throttling_mode', default: 'soft_warning' })
  throttlingMode: string;

  @ApiProperty()
  @Column({ name: 'grace_limit_percentage', default: 20 })
  graceLimitPercentage: number;

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
