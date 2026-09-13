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

import { SubscriptionAddOnProduct } from './subscription-add-on-product.entity';
import type {
  AddOnComponentType,
  AddOnComponentUnit,
} from '../subscription-add-on.types';

@Entity('subscription_add_on_product_components')
@Index(
  'UQ_subscription_add_on_product_components_product_type',
  ['productId', 'componentType'],
  { unique: true },
)
@Index('IDX_subscription_add_on_product_components_product', ['productId'])
export class SubscriptionAddOnProductComponent {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ApiProperty({
    enum: [
      'inbound_messages',
      'outbound_messages',
      'api_requests',
      'channel_slots',
      'storage_gb',
    ],
  })
  @Column({ name: 'component_type', type: 'varchar', length: 40 })
  componentType: AddOnComponentType;

  /** Positive capacity granted by this component. */
  @ApiProperty()
  @Column({ type: 'integer' })
  quantity: number;

  @ApiProperty({ enum: ['messages', 'requests', 'channels', 'gb'] })
  @Column({ type: 'varchar', length: 20 })
  unit: AddOnComponentUnit;

  @ApiProperty()
  @Column({ name: 'display_order', default: 0 })
  displayOrder: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => SubscriptionAddOnProduct, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: SubscriptionAddOnProduct;
}
