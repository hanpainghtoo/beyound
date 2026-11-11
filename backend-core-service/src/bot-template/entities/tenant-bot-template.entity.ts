import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Check,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { TenantBotTemplateField } from './tenant-bot-template-field.entity';

/**
 * Tenant-owned Telegram bot content template. Content-only: enablement stays
 * with the platform commerce toggle + per-channel shop/ordering flags.
 * Exactly one default per tenant (partial unique index, see migration).
 */
@Entity('tenant_bot_templates')
@Check(`"name" <> ''`)
export class TenantBotTemplate {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty()
  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @OneToMany(() => TenantBotTemplateField, (field) => field.template, {
    cascade: false,
  })
  fields: TenantBotTemplateField[];
}
