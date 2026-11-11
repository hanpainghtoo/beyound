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
import { PlatformAdmin } from '../../auth/entities/platform-admin.entity';
import { TenantUser } from '../../auth/entities/tenant-user.entity';
import { BillingAccount } from './billing-account.entity';

// Plan 28 Item 1: single review axis with split rejection meaning.
// `in_review` = awaiting operator decision (proofs may cycle
// pending → rejected → pending here without touching this axis),
// `confirm` = payment confirmed (unlocks period/top-up activation) —
//   Phase 6 renamed `approve` -> `confirm` to avoid confusion with the
//   period admin-approval axis (`adminActivationStatus`/`upgradeStatus`).
// `reject` = whole-invoice rejection by the platform team via explicit
//   manual update only (dead invoice; frees the month in overlap checks).
// `cancelled` = tenant-withdrawn invoice via workspace cancel actions
//   (Plan 56; dead invoice; frees the month). Proof-level rejections live
//   in `metadata.paymentProof.status`, never here.
export type BillingReviewStatus =
  | 'in_review'
  | 'confirm'
  | 'reject'
  | 'cancelled';

@Entity('tenant_billing_records')
@Index('IDX_tenant_billing_records_tenant_period', [
  'tenantId',
  'billingPeriodStart',
  'billingPeriodEnd',
])
@Index('IDX_tenant_billing_records_invoice_status', ['reviewStatus'])
@Index('UQ_tenant_billing_records_invoice_no', ['invoiceNo'], {
  unique: true,
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

  // Plan 25: sequential meeting-decision number (INV-00001…).
  @ApiProperty()
  @Column({ name: 'invoice_no', type: 'varchar', nullable: true })
  invoiceNo: string | null;

  @ApiProperty()
  @Column({ name: 'billing_period_start', type: 'date' })
  billingPeriodStart: Date;

  @ApiProperty()
  @Column({ name: 'billing_period_end', type: 'date' })
  billingPeriodEnd: Date;

  // Plan 25: single review axis replacing the dual invoice/payment axis.
  // Plan 56: `cancelled` = tenant-withdrawn (workspace cancel).
  @ApiProperty({ enum: ['in_review', 'confirm', 'reject', 'cancelled'] })
  @Column({ name: 'review_status', default: 'in_review' })
  reviewStatus: BillingReviewStatus;

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
  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date | null;

  // Plan 25: proof image promoted from metadata.paymentProof.mediaFileId.
  // 2026-09-09 fix: varchar, not uuid — the file service issues opaque
  // `file-<ts>-<rand>` string IDs (uuid rejected real uploads with 500).
  @ApiProperty({ nullable: true })
  @Column({ name: 'payment_proof_file_id', type: 'varchar', nullable: true })
  paymentProofFileId: string | null;

  // Plan 25: reviewing admin + action timestamp (from metadata proof reviews).
  @ApiProperty({ nullable: true })
  @Column({ name: 'action_by', type: 'uuid', nullable: true })
  actionBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'action_date', type: 'timestamptz', nullable: true })
  actionDate: Date | null;

  // Plan 30 wrap-up R3: which tenant user requested the invoice (all
  // tenant self-service paths). NULL for history + manual rows.
  @ApiProperty({ nullable: true })
  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy: string | null;

  // Plan 25: invoice issue day (backfilled from created_at).
  @ApiProperty({ nullable: true })
  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate: Date | null;

  // Plan 25 interim free-text reference (kept until the keep-or-drop call).
  // Plan 31 added the real billing_account_id FK below.
  @ApiProperty({ nullable: true })
  @Column({ name: 'billing_account_ref', type: 'varchar', nullable: true })
  billingAccountRef: string | null;

  // Plan 31: real billing-account FK (billing_accounts landed, uuid PK).
  // Kept alongside billing_account_ref until the keep-or-drop call.
  @ApiProperty({ nullable: true })
  @Column({ name: 'billing_account_id', type: 'uuid', nullable: true })
  billingAccountId: string | null;

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

  @ManyToOne(() => PlatformAdmin, { nullable: true })
  @JoinColumn({ name: 'action_by' })
  actionByAdmin: PlatformAdmin | null;

  @ManyToOne(() => TenantUser, { nullable: true })
  @JoinColumn({ name: 'requested_by' })
  requestedByUser: TenantUser | null;

  @ManyToOne(() => BillingAccount, { nullable: true })
  @JoinColumn({ name: 'billing_account_id' })
  billingAccount: BillingAccount | null;
}
