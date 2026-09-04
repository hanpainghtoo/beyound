import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tenant_policy_consents')
@Index('IDX_tenant_policy_consents_tenant', ['tenantId', 'policyKey'])
@Index('IDX_tenant_policy_consents_user', ['tenantUserId', 'policyKey'])
export class TenantPolicyConsent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'tenant_user_id' })
  tenantUserId: string;

  @Column({ name: 'normalized_email', length: 320 })
  normalizedEmail: string;

  @Column({ name: 'policy_key' })
  policyKey: string;

  @Column({ name: 'policy_version' })
  policyVersion: string;

  @Column({ name: 'accepted_at', type: 'timestamp' })
  acceptedAt: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
