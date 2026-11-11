import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import {
  TenantEntitlement,
  type EntitlementLifecycleState,
} from './tenant-entitlement.entity';

@Entity('tenant_entitlement_events')
@Index('IDX_tenant_entitlement_events_entitlement', [
  'entitlementId',
  'createdAt',
])
@Index('IDX_tenant_entitlement_events_idempotency', ['idempotencyKey'], {
  unique: true,
  where: 'idempotency_key IS NOT NULL',
})
export class TenantEntitlementEvent {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'entitlement_id', type: 'uuid' })
  entitlementId: string;

  @ApiProperty()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ApiProperty()
  @Column({
    name: 'previous_state',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  previousState: EntitlementLifecycleState | null;

  @ApiProperty()
  @Column({ name: 'new_state', type: 'varchar', length: 40 })
  newState: EntitlementLifecycleState;

  @ApiProperty()
  @Column({ name: 'actor_type', type: 'varchar', length: 40 })
  actorType: string;

  @ApiProperty()
  @Column({ name: 'actor_id', type: 'varchar', length: 120, nullable: true })
  actorId: string | null;

  @ApiProperty()
  @Column({ name: 'source', type: 'varchar', length: 80 })
  source: string;

  @ApiProperty()
  @Column({ name: 'reason', type: 'varchar', length: 240 })
  reason: string;

  @ApiProperty()
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  idempotencyKey: string | null;

  @ApiProperty()
  @Column({ name: 'metadata', type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => TenantEntitlement, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entitlement_id' })
  entitlement: TenantEntitlement;
}
