import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Tenant-scoped registry of customer tag names. Assignment still lives on
 * `customers.tags` (string array) — this table is the shared vocabulary the
 * workspace "Manage Tag" dialog and the new-customer tag picker read from, so
 * tag spelling stays consistent across the team. Deleting a registry entry
 * does not rewrite customers already carrying the tag.
 */
@Entity('customer_tags')
@Index('uq_customer_tags_tenant_name', ['tenantId', 'name'], { unique: true })
export class CustomerTag {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 60 })
  name: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
