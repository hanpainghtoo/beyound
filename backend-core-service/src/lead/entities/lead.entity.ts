import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type LeadIntent = 'demo' | 'sales' | 'support' | 'general' | 'trial';
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'converted'
  | 'closed';

@Entity('platform_leads')
@Index('IDX_platform_leads_intent_status', ['intent', 'status'])
@Index('IDX_platform_leads_created_at', ['createdAt'])
@Index('IDX_platform_leads_source_status', ['source', 'status'])
export class Lead {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ enum: ['demo', 'sales', 'support', 'general', 'trial'] })
  @Column({ default: 'general' })
  intent: LeadIntent;

  @ApiProperty({
    enum: ['new', 'contacted', 'qualified', 'converted', 'closed'],
  })
  @Column({ default: 'new' })
  status: LeadStatus;

  @ApiProperty()
  @Column({ name: 'full_name' })
  fullName: string;

  @ApiProperty()
  @Column({ name: 'company_name' })
  companyName: string;

  @ApiProperty()
  @Column({ name: 'email_address' })
  emailAddress: string;

  @ApiProperty()
  @Column({ name: 'phone_number', type: 'varchar', nullable: true })
  phoneNumber: string | null;

  @ApiProperty()
  @Column({ name: 'business_type', type: 'varchar', nullable: true })
  businessType: string | null;

  @ApiProperty()
  @Column({ name: 'team_size', type: 'varchar', nullable: true })
  teamSize: string | null;

  @ApiProperty()
  @Column({ name: 'interested_in', type: 'varchar', nullable: true })
  interestedIn: string | null;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  message: string | null;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  source: string | null;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @ApiProperty()
  @Column({ name: 'contacted_at', type: 'timestamp', nullable: true })
  contactedAt: Date | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
