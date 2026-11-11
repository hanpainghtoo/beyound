import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('stock_movements')
@Index('IDX_stock_movements_tenant_product_created', [
  'tenantId',
  'productId',
  'createdAt',
])
@Index('UQ_stock_movements_order_item_reason', ['orderItemId', 'reason'], {
  unique: true,
  where: '"order_item_id" IS NOT NULL',
})
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ name: 'order_item_id', type: 'uuid', nullable: true })
  orderItemId: string | null;

  @Column({ type: 'integer' })
  delta: number;

  @Column({ type: 'varchar' })
  reason: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
