import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Plan 55: global catalog row describing one toggleable workspace module.
 *
 * `key` is the canonical slug used by the API, guards and frontend nav.
 * `dependsOn` records a cascade relationship — when the parent module is
 * switched off the dependent module is forced off as well. Re-enabling the
 * parent never restores the dependent module.
 *
 * `isLockable = false` marks modules that must always stay on (Inbox/chat).
 */
@Entity('feature_categories')
@Index('UQ_feature_categories_key', ['key'], { unique: true })
export class FeatureCategory {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Canonical slug such as `orders`, `deliveries`, `inbox`. */
  @ApiProperty()
  @Column()
  key: string;

  @ApiProperty()
  @Column({ name: 'display_name' })
  displayName: string;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  /** Key of the category that must be enabled for this one to work. */
  @ApiProperty({ nullable: true })
  @Column({ name: 'depends_on', type: 'varchar', nullable: true })
  dependsOn: string | null;

  @ApiProperty()
  @Column({ name: 'is_lockable', default: true })
  isLockable: boolean;

  @ApiProperty()
  @Column({ name: 'display_order', default: 0 })
  displayOrder: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
