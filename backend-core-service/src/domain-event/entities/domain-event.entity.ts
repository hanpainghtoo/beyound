import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('domain_events')
export class DomainEvent {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'actor_id', nullable: true })
  actorId: string;

  @ApiProperty()
  @Column({ name: 'actor_type', nullable: true })
  actorType: string;

  @ApiProperty()
  @Column({ name: 'entity_type' })
  entityType: string;

  @ApiProperty()
  @Column({ name: 'entity_id' })
  entityId: string;

  @ApiProperty()
  @Column({ name: 'event_type' })
  eventType: string;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, any>;

  @ApiProperty()
  @Column({ nullable: true })
  source: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
