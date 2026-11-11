import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Order } from './order.entity';
import { Product } from '../../product/entities/product.entity';

@Entity('order_items')
export class OrderItem {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'order_id' })
  orderId: string;

  @ApiProperty()
  @Column({ name: 'product_id', nullable: true })
  productId: string;

  @ApiProperty()
  @Column({ name: 'product_name' })
  productName: string;

  @ApiProperty()
  @Column({ name: 'product_sku', nullable: true })
  productSku: string;

  @ApiProperty()
  @Column({ name: 'product_snapshot', type: 'jsonb', default: {} })
  productSnapshot: Record<string, any>;

  @ApiProperty()
  @Column({ name: 'variation_snapshot', type: 'jsonb', default: {} })
  variationSnapshot: Record<string, any>;

  @ApiProperty()
  @Column({ default: 1 })
  quantity: number;

  @ApiProperty()
  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @ApiProperty()
  @Column({ name: 'total_price', type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  notes: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
