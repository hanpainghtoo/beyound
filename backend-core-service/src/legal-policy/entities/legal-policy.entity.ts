import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type LegalPolicyKey =
  | 'terms_of_service'
  | 'privacy_policy'
  | 'data_retention'
  | 'data_export'
  | 'subprocessors';
export type LegalPolicyStatus = 'draft' | 'published' | 'retired';

@Entity('legal_policies')
@Index('IDX_legal_policies_key_status_effective', [
  'policyKey',
  'status',
  'effectiveAt',
])
@Index('UQ_legal_policies_key_version', ['policyKey', 'version'], {
  unique: true,
})
export class LegalPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'policy_key' })
  policyKey: LegalPolicyKey;

  @Column()
  version: string;

  @Column({ default: 'draft' })
  status: LegalPolicyStatus;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'content_format', default: 'markdown' })
  contentFormat: 'markdown';

  @Column({ name: 'effective_at', type: 'timestamp' })
  effectiveAt: Date;

  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'published_by_id', type: 'varchar', nullable: true })
  publishedById: string | null;

  @Column({ name: 'support_email' })
  supportEmail: string;

  @Column({ name: 'legal_email' })
  legalEmail: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
