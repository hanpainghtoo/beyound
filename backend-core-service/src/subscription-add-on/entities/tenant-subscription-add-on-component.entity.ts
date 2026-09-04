import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { AddOnComponentType } from '../subscription-add-on.types';
import type { AddOnPurchaseComponentStatus } from '../subscription-add-on-purchase.types';
import { TenantSubscriptionAddOnPurchase } from './tenant-subscription-add-on-purchase.entity';

/**
 * One normalized component grant snapshotted from the purchased product at
 * purchase time (Plan 9 Phase 4, task 4.2/4.5).
 *
 * Each child row is immutable once created: it records the typed dimension,
 * quantity, unit, and the same target-period expiry as the parent purchase.
 * Editing or archiving the catalog product later never changes these rows.
 */
@Entity('tenant_subscription_add_on_components')
@Index('IDX_subscription_add_on_components_purchase', ['purchaseId'])
export class TenantSubscriptionAddOnComponent {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'purchase_id', type: 'uuid' })
  purchaseId: string;

  @ApiProperty()
  @Column({ name: 'component_type', type: 'varchar', length: 40 })
  componentType: AddOnComponentType;

  /** Immutable granted capacity snapshot. */
  @ApiProperty()
  @Column({ type: 'integer' })
  quantity: number;

  @ApiProperty()
  @Column({ type: 'varchar', length: 20 })
  unit: string;

  /** Same target-period end as the parent purchase, exclusive. */
  @ApiProperty()
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /** Effective component lifecycle: pending until payment confirmed. */
  @ApiProperty({ enum: ['pending', 'active', 'expired'] })
  @Column({ name: 'component_status', default: 'pending' })
  componentStatus: AddOnPurchaseComponentStatus;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => TenantSubscriptionAddOnPurchase, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_id' })
  purchase: TenantSubscriptionAddOnPurchase;
}
