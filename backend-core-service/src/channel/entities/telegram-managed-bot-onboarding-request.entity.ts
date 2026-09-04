import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { TenantUser } from '../../auth/entities/tenant-user.entity';

export type TelegramManagedBotOnboardingStatus =
  | 'pending'
  | 'telegram_started'
  | 'awaiting_creation'
  | 'provisioning'
  | 'connected'
  | 'failed'
  | 'expired'
  | 'cancelled';

@Entity('telegram_managed_bot_onboarding_requests')
@Index('idx_tg_managed_onboarding_workspace_status', ['workspaceId', 'status'])
@Index('idx_tg_managed_onboarding_state_hash', ['stateHash'])
@Index('idx_tg_managed_onboarding_request_id', ['requestId'])
@Index('idx_tg_managed_onboarding_created_bot', ['createdBotId'])
export class TelegramManagedBotOnboardingRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId: string;

  @Column({ name: 'telegram_user_id', type: 'varchar', nullable: true })
  telegramUserId: string | null;

  @Column({ name: 'telegram_chat_id', type: 'varchar', nullable: true })
  telegramChatId: string | null;

  @Column({ name: 'request_id', type: 'integer' })
  requestId: number;

  @Column({ name: 'state_hash', type: 'varchar', length: 128 })
  stateHash: string;

  @Column({ name: 'state_expires_at', type: 'timestamp' })
  stateExpiresAt: Date;

  @Column({ name: 'suggested_name', type: 'varchar', length: 128 })
  suggestedName: string;

  @Column({ name: 'suggested_username', type: 'varchar', length: 64 })
  suggestedUsername: string;

  @Column({ name: 'created_bot_id', type: 'varchar', nullable: true })
  createdBotId: string | null;

  @Column({ name: 'created_bot_username', type: 'varchar', nullable: true })
  createdBotUsername: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 32,
    default: 'pending',
  })
  status: TelegramManagedBotOnboardingStatus;

  @Column({ name: 'channel_connection_id', type: 'uuid', nullable: true })
  channelConnectionId: string | null;

  @Column({
    name: 'failure_code',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  failureCode: string | null;

  @Column({ name: 'failure_message', type: 'text', nullable: true })
  failureMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'workspace_id' })
  workspace: Tenant;

  @ManyToOne(() => TenantUser)
  @JoinColumn({ name: 'requested_by_user_id' })
  requestedByUser: TenantUser;
}
