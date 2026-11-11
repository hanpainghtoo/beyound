import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type OrderPaymentTransactionType =
  | 'payment'
  | 'reversal'
  | 'status_change';

/**
 * Immutable ledger entry for an order's payment history.
 *
 * Payments are never overwritten: each submission appends a positive `payment`
 * row. Marking an order unpaid appends a `reversal` row for the outstanding
 * collected amount (or a zero-value `status_change` row when nothing had been
 * collected), so the history still explains how the balance reached zero.
 */
@Entity('order_payment_transactions')
@Index('IDX_order_payment_transactions_tenant_order', ['tenantId', 'orderId'])
export class OrderPaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ type: 'varchar' })
  type: OrderPaymentTransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ name: 'proof_file_id', type: 'varchar', nullable: true })
  proofFileId: string | null;

  @Column({ name: 'proof_content_type', type: 'varchar', nullable: true })
  proofContentType: string | null;

  @Column({ name: 'proof_size_bytes', type: 'integer', nullable: true })
  proofSizeBytes: number | null;

  @Column({ name: 'previous_payment_status', type: 'varchar', nullable: true })
  previousPaymentStatus: string | null;

  @Column({ name: 'new_payment_status', type: 'varchar', nullable: true })
  newPaymentStatus: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_type', type: 'varchar', default: 'tenant_user' })
  actorType: string;

  @Column({ name: 'idempotency_key', type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
