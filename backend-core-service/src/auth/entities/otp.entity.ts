import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type OtpPurpose = 'pricing_registration' | 'otp_login';

@Entity('otps')
@Index('IDX_otps_email_purpose', ['normalizedEmail', 'purpose'])
@Index('IDX_otps_code_hash', ['codeHash'])
export class Otp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'normalized_email', length: 320 })
  normalizedEmail: string;

  @Column({ name: 'code_hash' })
  codeHash: string;

  @Column({ name: 'purpose' })
  purpose: OtpPurpose;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'attempt_count', default: 0 })
  attemptCount: number;

  @Column({ name: 'max_attempts', default: 5 })
  maxAttempts: number;

  @Column({ name: 'used_at', type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'resend_available_at', type: 'timestamp' })
  resendAvailableAt: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
