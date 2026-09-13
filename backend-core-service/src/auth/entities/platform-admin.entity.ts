import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('platform_admins')
export class PlatformAdmin {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'full_name' })
  fullName: string;

  @ApiProperty()
  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @ApiProperty({
    enum: [
      'super_admin',
      'ops_admin',
      'it_admin',
      'finance_viewer',
      'support_viewer',
      'read_only',
    ],
  })
  @Column({ default: 'ops_admin' })
  role: string;

  @ApiProperty({ enum: ['active', 'inactive', 'suspended'] })
  @Column({ default: 'active' })
  status: string;

  @ApiProperty()
  @Column({ name: 'two_factor_enabled', default: false })
  twoFactorEnabled: boolean;

  @ApiProperty()
  @Column({ name: 'last_login_at', nullable: true })
  lastLoginAt: Date;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
