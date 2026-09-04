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
import { TenantBillingRecord } from '../../platform-admin/entities/tenant-billing-record.entity';
import { TenantSubscriptionPeriod } from '../../subscription-period/entities/tenant-subscription-period.entity';
import { SubscriptionAddOnProduct } from './subscription-add-on-product.entity';
import type {
  AddOnPurchasePaymentStatus,
  AddOnPurchaseStatus,
} from '../subscription-add-on-purchase.types';

/**
 * One immutable top-up bundle purchase (Plan 9 Phase 4, task 4.2).
 *
 * A purchase belongs to exactly one tenant and is attached to exactly one
 * target active paid period. It snapshots the product identity, price and
 * currency at purchase time so later catalog edits can never rewrite what a
 * tenant paid for. There is intentionally no unique constraint on
 * (tenant, period, product): the same product may be purchased repeatedly and
 * each confirmed purchase is an independent stacking grant.
 */
@Entity('tenant_subscription_add_on_purchases')
@Index('IDX_subscription_add_on_purchases_tenant_created', [
  'tenantId',
  'createdAt',
])
@Index('IDX_subscription_add_on_purchases_period', ['subscriptionPeriodId'])
@Index('IDX_subscription_add_on_purchases_product', ['productId'])
@Index('IDX_subscription_add_on_purchases_status_end', [
  'purchaseStatus',
  'expiresAt',
])
// Matches the migration's partial unique index exactly so dev schema sync and
// future migration:generate runs never see drift (one purchase request/payment
// event is idempotent; repeated purchases of the same product stay allowed).
@Index(
  'UQ_subscription_add_on_purchases_idempotency',
  ['tenantId', 'idempotencyKey'],
  {
    unique: true,
    where: 'idempotency_key IS NOT NULL',
  },
)
@Index('UQ_subscription_add_on_purchases_billing_record', ['billingRecordId'], {
  unique: true,
  where: 'billing_record_id IS NOT NULL',
})
export class TenantSubscriptionAddOnPurchase {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Target active calendar-month period (server-resolved, never client-picked). */
  @ApiProperty()
  @Column({ name: 'subscription_period_id', type: 'uuid' })
  subscriptionPeriodId: string;

  @ApiProperty()
  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  /** Payment/invoice evidence when the purchase is funded through billing. */
  @ApiProperty({ nullable: true })
  @Column({ name: 'billing_record_id', type: 'uuid', nullable: true })
  billingRecordId: string | null;

  /** Snapshot of the complete bundle price at purchase time. */
  @ApiProperty()
  @Column({
    name: 'purchase_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  purchasePrice: number;

  /** Snapshot of currency at purchase time. */
  @ApiProperty()
  @Column({ default: 'MMK' })
  currency: string;

  @ApiProperty({ enum: ['pending', 'paid', 'failed'] })
  @Column({ name: 'payment_status', default: 'pending' })
  paymentStatus: AddOnPurchasePaymentStatus;

  @ApiProperty({ enum: ['pending', 'active', 'expired', 'cancelled'] })
  @Column({ name: 'purchase_status', default: 'pending' })
  purchaseStatus: AddOnPurchaseStatus;

  /** When the paid bundle becomes usable (set at payment confirmation). */
  @ApiProperty({ nullable: true })
  @Column({ name: 'effective_at', type: 'timestamptz', nullable: true })
  effectiveAt: Date | null;

  /** Target period end, exclusive (Yangon calendar-month boundary). */
  @ApiProperty()
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /** Duplicate-purchase protection for one purchase request/event. */
  @ApiProperty({ nullable: true })
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  idempotencyKey: string | null;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => TenantSubscriptionPeriod, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subscription_period_id' })
  subscriptionPeriod: TenantSubscriptionPeriod;

  @ManyToOne(() => SubscriptionAddOnProduct, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product: SubscriptionAddOnProduct;

  @ManyToOne(() => TenantBillingRecord, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'billing_record_id' })
  billingRecord: TenantBillingRecord | null;
}
