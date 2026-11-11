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

@Entity('meta_apps')
@Index('UQ_meta_apps_platform', ['kind'], {
  unique: true,
  where: "kind = 'platform'",
})
@Index('UQ_meta_apps_active_byo_tenant', ['tenantId'], {
  unique: true,
  where: "kind = 'byo' AND status <> 'retired'",
})
@Index('UQ_meta_apps_webhook_path_segment', ['webhookPathSegment'], {
  unique: true,
})
export class MetaApp {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true }) tenantId:
    | string
    | null;
  @Column({ type: 'varchar' }) kind: 'platform' | 'byo';
  @Column({ name: 'app_id', type: 'varchar' }) appId: string;
  @Column({ name: 'app_secret_encrypted', type: 'jsonb' })
  appSecretEncrypted: Record<string, unknown>;
  @Column({ name: 'verify_token_encrypted', type: 'jsonb' })
  verifyTokenEncrypted: Record<string, unknown>;
  @Column({ name: 'webhook_path_segment', type: 'varchar', unique: true })
  webhookPathSegment: string;
  @Column({ name: 'login_config_id', type: 'varchar', nullable: true })
  loginConfigId: string | null;
  @Column({ name: 'live_confirmed_at', type: 'timestamptz', nullable: true })
  liveConfirmedAt: Date | null;
  @Column({ name: 'live_confirmed_by', type: 'uuid', nullable: true })
  liveConfirmedBy: string | null;
  @Column({ type: 'varchar', default: 'pending' }) status:
    | 'pending'
    | 'valid'
    | 'invalid'
    | 'needs_reconnect'
    | 'retired';
  @Column({ name: 'last_validated_at', type: 'timestamptz', nullable: true })
  lastValidatedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;
}
