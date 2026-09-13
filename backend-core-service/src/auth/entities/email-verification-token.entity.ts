import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('email_verification_tokens')
@Index('IDX_email_verification_tokens_hash', ['tokenHash'], { unique: true })
@Index('IDX_email_verification_tokens_user', ['tenantUserId', 'createdAt'])
export class EmailVerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_user_id' })
  tenantUserId: string;

  @Column({ name: 'normalized_email', length: 320 })
  normalizedEmail: string;

  @Column({ name: 'token_hash' })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'resend_available_at', type: 'timestamp' })
  resendAvailableAt: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
