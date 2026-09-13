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
import { Tenant } from '../../tenant/entities/tenant.entity';
import { ProductCategory } from './product-category.entity';

@Entity('products')
export class Product {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'category_id', nullable: true })
  categoryId: string;

  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty()
  @Column({ nullable: true })
  sku: string;

  @ApiProperty({ enum: ['product', 'service'] })
  @Column({ default: 'product' })
  type: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  description: string;

  @ApiProperty()
  @Column({ name: 'short_description', type: 'text', nullable: true })
  shortDescription: string;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @ApiProperty()
  @Column({
    name: 'cost_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  costPrice: number;

  @ApiProperty()
  @Column({ name: 'stock_quantity', default: 0 })
  stockQuantity: number;

  @ApiProperty()
  @Column({ name: 'low_stock_threshold', default: 5 })
  lowStockThreshold: number;

  @ApiProperty()
  @Column({ name: 'track_inventory', default: true })
  trackInventory: boolean;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  weight: number;

  @ApiProperty()
  @Column({ type: 'jsonb', nullable: true })
  dimensions: Record<string, any>;

  @ApiProperty()
  @Column({ type: 'jsonb', default: [] })
  images: string[];

  @ApiProperty()
  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  @ApiProperty({ enum: ['active', 'inactive', 'out_of_stock'] })
  @Column({ default: 'active' })
  status: string;

  @ApiProperty()
  @Column({ name: 'is_featured', default: false })
  isFeatured: boolean;

  @ApiProperty()
  @Column({ name: 'seo_title', nullable: true })
  seoTitle: string;

  @ApiProperty()
  @Column({ name: 'seo_description', type: 'text', nullable: true })
  seoDescription: string;

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

  @ManyToOne(() => ProductCategory)
  @JoinColumn({ name: 'category_id' })
  category: ProductCategory;
}
