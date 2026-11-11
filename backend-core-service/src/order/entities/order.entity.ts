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
import { Customer } from '../../customer/entities/customer.entity';
import { Conversation } from '../../conversation/entities/conversation.entity';
import { TenantUser } from '../../auth/entities/tenant-user.entity';

@Entity('orders')
export class Order {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'customer_id', nullable: true })
  customerId: string;

  @ApiProperty()
  @Column({ name: 'conversation_id', nullable: true })
  conversationId: string;

  @ApiProperty()
  @Column({ name: 'order_number' })
  orderNumber: string;

  @ApiProperty({ enum: ['pending', 'confirmed', 'rejected', 'cancelled'] })
  @Column({ default: 'pending' })
  status: string;

  @ApiProperty({
    enum: [
      'packed',
      'out_for_delivery',
      'delivered',
      'failed_delivery',
      'returned',
    ],
  })
  @Column({ name: 'delivery_status', default: 'packed' })
  deliveryStatus: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @ApiProperty({
    enum: ['unpaid', 'paid'],
  })
  @Column({ name: 'payment_status', default: 'unpaid' })
  paymentStatus: string;

  @ApiProperty({ enum: ['cod', 'online', 'bank_transfer'] })
  @Column({ name: 'payment_method', nullable: true })
  paymentMethod: string;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number;

  @ApiProperty()
  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  taxAmount: number;

  @ApiProperty()
  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  discountAmount: number;

  @ApiProperty()
  @Column({
    name: 'shipping_fee',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  shippingFee: number;

  @ApiProperty()
  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  totalAmount: number;

  @ApiProperty()
  @Column({
    name: 'paid_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  paidAmount: number;

  @ApiProperty()
  @Column({ default: 'MMK' })
  currency: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  notes: string;

  @ApiProperty()
  @Column({ name: 'shipping_address', type: 'text', nullable: true })
  shippingAddress: string | null;

  @ApiProperty()
  @Column({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate: Date;

  @ApiProperty()
  @Column({ name: 'delivery_assignee_name', nullable: true })
  deliveryAssigneeName: string;

  @ApiProperty()
  @Column({ name: 'delivery_assignee_phone', nullable: true })
  deliveryAssigneePhone: string;

  @ApiProperty()
  @Column({ name: 'payment_notes', type: 'text', nullable: true })
  paymentNotes: string;

  @Column({ name: 'payment_method_id', type: 'uuid', nullable: true })
  paymentMethodId: string | null;

  @Column({
    name: 'payment_method_config_version',
    type: 'int',
    nullable: true,
  })
  paymentMethodConfigVersion: number | null;

  @Column({ name: 'payment_method_snapshot', type: 'jsonb', nullable: true })
  paymentMethodSnapshot: Record<string, unknown> | null;

  @Column({ name: 'payment_total_snapshot', type: 'jsonb', nullable: true })
  paymentTotalSnapshot: { amount: string; currency: string } | null;

  @Column({
    name: 'payment_method_selected_at',
    type: 'timestamptz',
    nullable: true,
  })
  paymentMethodSelectedAt: Date | null;

  @Column({ name: 'payment_method_selected_by', type: 'uuid', nullable: true })
  paymentMethodSelectedBy: string | null;

  @Column({ name: 'payment_submitted_at', type: 'timestamptz', nullable: true })
  paymentSubmittedAt: Date | null;

  @ApiProperty()
  @Column({ name: 'status_history', type: 'jsonb', default: [] })
  statusHistory: Record<string, any>[];

  @ApiProperty()
  @Column({ type: 'jsonb', default: [] })
  attachments: Record<string, any>[];

  @ApiProperty()
  @Column({ name: 'created_by', nullable: true })
  createdBy: string;

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

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => Conversation)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => TenantUser)
  @JoinColumn({ name: 'created_by' })
  creator: TenantUser;
}
