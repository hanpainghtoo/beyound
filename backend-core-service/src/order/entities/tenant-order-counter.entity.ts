import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('tenant_order_counters')
export class TenantOrderCounter {
  @PrimaryColumn({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'next_value', type: 'bigint', default: 1001 })
  nextValue: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
