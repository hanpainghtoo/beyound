import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Product } from '../../product/entities/product.entity';

@Entity('order_item_reservations')
@Index('IDX_order_item_reservations_product_state', [
  'tenantId',
  'productId',
  'state',
])
@Index('UQ_order_item_reservations_item_kind', ['orderItemId', 'kind'], {
  unique: true,
})
export class OrderItemReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'order_id' })
  orderId: string;

  @Column({ name: 'order_item_id' })
  orderItemId: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'varchar', default: 'inventory' })
  kind: string;

  @Column({ type: 'varchar', default: 'active' })
  state: 'active' | 'converted' | 'released';

  @Column({ name: 'release_reason', type: 'varchar', nullable: true })
  releaseReason: string | null;

  @Column({
    name: 'reserved_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  reservedAt: Date;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'converted_at', type: 'timestamptz', nullable: true })
  convertedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne(() => OrderItem)
  @JoinColumn({ name: 'order_item_id' })
  orderItem: OrderItem;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
