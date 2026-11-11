import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { AddOnProductStatus } from '../subscription-add-on.types';

@Entity('subscription_add_on_products')
@Index('UQ_subscription_add_on_products_code', ['code'], { unique: true })
@Index('IDX_subscription_add_on_products_status', ['status'])
export class SubscriptionAddOnProduct {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable code such as `message_boost_10000_2000`. */
  @ApiProperty()
  @Column()
  code: string;

  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Price for one purchase of the complete bundle. */
  @ApiProperty()
  @Column({
    name: 'price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  price: number;

  @ApiProperty()
  @Column({ default: 'MMK' })
  currency: string;

  @ApiProperty({ enum: ['active', 'inactive', 'archived'] })
  @Column({ default: 'inactive' })
  status: AddOnProductStatus;

  /**
   * Monotonic catalog version. Bumped on every mutation so an edit can never
   * silently rewrite what an earlier purchase snapshot recorded.
   */
  @ApiProperty()
  @Column({ default: 1 })
  version: number;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
