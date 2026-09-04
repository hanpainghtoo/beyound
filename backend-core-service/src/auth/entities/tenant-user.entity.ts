import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { tenantRoleValues } from '../../common/constants/tenant-roles';

@Entity('tenant_users')
@Index('IDX_tenant_users_tenant_status', ['tenantId', 'status'])
@Index('uq_tenant_users_normalized_email', ['normalizedEmail'], {
  unique: true,
})
export class TenantUser {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'full_name' })
  fullName: string;

  @ApiProperty()
  @Column({ name: 'first_name' })
  firstName: string;

  @ApiProperty()
  @Column({ name: 'last_name' })
  lastName: string;

  @ApiProperty()
  @Column()
  email: string;

  @Column({ name: 'normalized_email', length: 320 })
  normalizedEmail: string;

  @Exclude()
  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @ApiProperty()
  @Column({ nullable: true })
  phone: string;

  @ApiProperty({ enum: tenantRoleValues })
  @Column({ default: 'csr' })
  role: string;

  @ApiProperty({ enum: ['active', 'inactive', 'suspended'] })
  @Column({ default: 'active' })
  status: string;

  @ApiProperty()
  @Column({ name: 'is_online', default: false })
  isOnline: boolean;

  @ApiProperty()
  @Column({ name: 'last_seen_at', nullable: true })
  lastSeenAt: Date;

  @ApiProperty()
  @Column({ name: 'email_verified_at', type: 'timestamp', nullable: true })
  emailVerifiedAt: Date | null;

  @ApiProperty()
  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl: string;

  @ApiProperty()
  @Column({ nullable: true })
  department: string;

  @ApiProperty()
  @Column({ name: 'employee_id', nullable: true })
  employeeId: string;

  @ApiProperty()
  @Column({ name: 'hire_date', nullable: true })
  hireDate: Date;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  permissions: Record<string, any>;

  @ApiProperty()
  @Column({ name: 'notification_preferences', type: 'jsonb', default: {} })
  notificationPreferences: Record<string, any>;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
