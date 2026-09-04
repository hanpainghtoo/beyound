import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('throttler_rate_limits')
export class ThrottlerRateLimit {
  @PrimaryColumn({ name: 'storage_key', type: 'varchar' })
  storageKey: string;

  @PrimaryColumn({ name: 'throttler_name', type: 'varchar' })
  throttlerName: string;

  @Column({ name: 'total_hits', type: 'integer', default: 0 })
  totalHits: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'is_blocked', type: 'boolean', default: false })
  isBlocked: boolean;

  @Column({ name: 'block_expires_at', type: 'timestamptz', nullable: true })
  blockExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
