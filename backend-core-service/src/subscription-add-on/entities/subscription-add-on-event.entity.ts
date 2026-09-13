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

import { SubscriptionAddOnProduct } from './subscription-add-on-product.entity';
import type { AddOnEventType } from '../subscription-add-on.types';

@Entity('subscription_add_on_events')
@Index('IDX_subscription_add_on_events_product_created', [
  'productId',
  'createdAt',
])
@Index('UQ_subscription_add_on_events_idempotency', ['idempotencyKey'], {
  unique: true,
  where: 'idempotency_key IS NOT NULL',
})
export class SubscriptionAddOnEvent {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId: string | null;

  @ApiProperty({
    enum: [
      'add_on_product_created',
      'add_on_product_updated',
      'add_on_product_published',
      'add_on_product_archived',
      'add_on_product_deleted',
      'add_on_product_component_changed',
    ],
  })
  @Column({ name: 'event_type', type: 'varchar', length: 40 })
  eventType: AddOnEventType;

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

  /** Before/after product and component snapshots for auditability. */
  @ApiProperty()
  @Column({ name: 'metadata', type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => SubscriptionAddOnProduct, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'product_id' })
  product: SubscriptionAddOnProduct | null;
}
