import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantPaymentMethod } from './payment-method.entity';

@Entity('tenant_payment_method_versions')
export class TenantPaymentMethodVersion {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ type: 'int' }) version: number;
  @Column({ default: 'draft' }) status: 'draft' | 'published';
  @Column({ name: 'published_by', type: 'uuid', nullable: true }) publishedBy:
    | string
    | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @OneToMany(() => TenantPaymentMethod, (method) => method.version)
  methods: TenantPaymentMethod[];
}
