import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantPaymentMethodVersion } from './payment-method-version.entity';

@Entity('tenant_payment_methods')
export class TenantPaymentMethod {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'version_id', type: 'uuid' }) versionId: string;
  @Column() kind: 'kbzpay' | 'aya_pay' | 'other';
  @Column() name: string;
  @Column({ default: false }) enabled: boolean;
  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;
  @Column({ name: 'account_name' }) accountName: string;
  @Column({ name: 'account_number' }) accountNumber: string;
  @Column({ name: 'qr_media_id', type: 'varchar', nullable: true }) qrMediaId:
    | string
    | null;
  @Column({ type: 'jsonb', default: {} }) metadata: Record<string, unknown>;
  @ManyToOne(() => TenantPaymentMethodVersion, (version) => version.methods, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'version_id' })
  version: TenantPaymentMethodVersion;
}
