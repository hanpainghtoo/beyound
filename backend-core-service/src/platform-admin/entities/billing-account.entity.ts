import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

import { PlatformAdmin } from '../../auth/entities/platform-admin.entity';

export const BILLING_ACCOUNT_TYPES = [
  'bank_account',
  'digital_wallet',
] as const;

export type BillingAccountType = (typeof BILLING_ACCOUNT_TYPES)[number];

@Entity('billing_accounts')
export class BillingAccount {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ nullable: true, description: 'Logo image key or URL.' })
  @Column({ nullable: true })
  icon: string;

  @ApiProperty({ maxLength: 100 })
  @Column({ name: 'account_name', length: 100 })
  accountName: string;

  @ApiProperty({ enum: BILLING_ACCOUNT_TYPES, default: 'bank_account' })
  @Column({
    type: 'varchar',
    length: 30,
    default: 'bank_account',
  })
  type: BillingAccountType;

  @ApiProperty({
    nullable: true,
    description: 'Account number as text so leading zeroes are preserved.',
  })
  @Column({ name: 'account_no', type: 'varchar', nullable: true })
  accountNo: string;

  @ApiProperty({
    nullable: true,
    description: 'Phone number as text so formatting is preserved.',
  })
  @Column({ type: 'varchar', nullable: true })
  phno: string;

  @ApiProperty({ nullable: true, description: 'QR image key or URL.' })
  @Column({ type: 'varchar', nullable: true })
  qr: string;

  @ApiProperty({ default: true })
  @Column({ name: 'is_public', type: 'boolean', default: true })
  isPublic: boolean;

  @ApiProperty({ default: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_date', type: 'timestamp' })
  createdDate: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_date', type: 'timestamp' })
  updatedDate: Date;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'updated_by', type: 'uuid' })
  updatedBy: string;

  @ManyToOne(() => PlatformAdmin, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator: PlatformAdmin;

  @ManyToOne(() => PlatformAdmin, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'updated_by' })
  updater: PlatformAdmin;
}
