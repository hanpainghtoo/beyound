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

import { Tenant } from '../../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../../tenant/entities/subscription-plan.entity';

export type BillingInvoiceStatus = 'draft' | 'issued' | 'void';
export type BillingPaymentStatus =
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'waived';

@Entity('tenant_billing_records')
@Index('IDX_tenant_billing_records_tenant_period', [
  'tenantId',
  'billingPeriodStart',
  'billingPeriodEnd',
])
@Index('IDX_tenant_billing_records_invoice_status', [
  'invoiceStatus',
  'paymentStatus',
])
@Index('UQ_tenant_billing_records_invoice_number', ['invoiceNumber'], {
  unique: true,
  where: 'invoice_number IS NOT NULL',
})
export class TenantBillingRecord {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'subscription_plan_id', type: 'uuid', nullable: true })
  subscriptionPlanId: string | null;

  @ApiProperty()
  @Column({ name: 'invoice_number', type: 'varchar', nullable: true })
  invoiceNumber: string | null;

  @ApiProperty()
  @Column({ name: 'billing_period_start', type: 'date' })
  billingPeriodStart: Date;

  @ApiProperty()
  @Column({ name: 'billing_period_end', type: 'date' })
  billingPeriodEnd: Date;

  @ApiProperty({ enum: ['draft', 'issued', 'void'] })
  @Column({ name: 'invoice_status', default: 'draft' })
  invoiceStatus: BillingInvoiceStatus;

  @ApiProperty({
    enum: ['unpaid', 'partially_paid', 'paid', 'overdue', 'waived'],
  })
  @Column({ name: 'payment_status', default: 'unpaid' })
  paymentStatus: BillingPaymentStatus;

  @ApiProperty()
  @Column({
    name: 'amount_due',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  amountDue: number;

  @ApiProperty()
  @Column({
    name: 'amount_paid',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  amountPaid: number;

  @ApiProperty()
  @Column({ default: 'MMK' })
  currency: string;

  @ApiProperty()
  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date | null;

  @ApiProperty()
  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => SubscriptionPlan, { nullable: true })
  @JoinColumn({ name: 'subscription_plan_id' })
  subscriptionPlan: SubscriptionPlan | null;
}
