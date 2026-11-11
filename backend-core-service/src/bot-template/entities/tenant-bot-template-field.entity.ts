import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Check,
  Unique,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { TenantBotTemplate } from './tenant-bot-template.entity';

/**
 * One ordered menu element of a bot template. `sort` is dense (0..n-1),
 * assigned by array order on write. `value` holds label overrides and future
 * per-field config (e.g. `{ "label": "Catalog", "labelMy": "..." }`).
 * `condition: 'requires_ordering'` hides the field unless the channel has
 * ordering enabled (mirrors the legacy Orders-button rule).
 */
@Entity('tenant_bot_template_fields')
@Check(`"key" IN ('greeting', 'products', 'shop_info', 'orders', 'agent')`)
@Check(`"layout" IN ('full', 'half', 'third')`)
@Check(`"condition" IS NULL OR "condition" IN ('requires_ordering')`)
@Unique('uq_tenant_bot_template_fields_key', ['templateId', 'key'])
@Unique('uq_tenant_bot_template_fields_sort', ['templateId', 'sort'])
export class TenantBotTemplateField {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @ApiProperty({
    enum: ['greeting', 'products', 'shop_info', 'orders', 'agent'],
  })
  @Column()
  key: string;

  @ApiProperty()
  @Column()
  sort: number;

  @ApiProperty({ enum: ['full', 'half'] })
  @Column()
  layout: string;

  @ApiProperty()
  @Column({ default: true })
  visible: boolean;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', nullable: true })
  condition: string | null;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  value: Record<string, unknown>;

  // Relations
  @ManyToOne(() => TenantBotTemplate, (template) => template.fields, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template: TenantBotTemplate;
}
