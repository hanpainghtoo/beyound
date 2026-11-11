import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('order_payment_proofs')
@Index('IDX_order_payment_proofs_tenant_order', ['tenantId', 'orderId'])
export class OrderPaymentProof {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'order_id', type: 'uuid' }) orderId: string;
  @Column({ type: 'varchar', default: 'pending_review' }) status:
    | 'pending_review'
    | 'approved'
    | 'rejected';
  @Column({ name: 'media_link', type: 'text', nullable: true }) mediaLink:
    | string
    | null;
  @Column({ name: 'telegram_file_unique_id', type: 'varchar', nullable: true })
  telegramFileUniqueId: string | null;
  @Column({ name: 'mime_type', type: 'varchar', nullable: true }) mimeType:
    | string
    | null;
  @Column({ name: 'size_bytes', type: 'integer', nullable: true }) sizeBytes:
    | number
    | null;
  @Column({
    name: 'submitted_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  submittedAt: Date;
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true }) reviewerId:
    | string
    | null;
  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;
  @Column({ name: 'source_message_id', type: 'varchar', nullable: true })
  sourceMessageId: string | null;
  @Column({ name: 'source_file_id', type: 'varchar', nullable: true })
  sourceFileId: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
