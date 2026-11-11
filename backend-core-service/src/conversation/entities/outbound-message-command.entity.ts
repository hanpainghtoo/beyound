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

import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { TenantChannel } from '../../channel/entities/tenant-channel.entity';

@Entity('outbound_message_commands')
@Index('UQ_outbound_message_commands_command_id', ['commandId'], {
  unique: true,
})
@Index('UQ_outbound_message_commands_message_id', ['messageId'], {
  unique: true,
})
@Index('IDX_outbound_message_commands_status', ['status', 'updatedAt'])
export class OutboundMessageCommand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'command_id', length: 160 })
  commandId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId: string;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @Column({ length: 40 })
  provider: string;

  @Column({ length: 40, default: 'queued' })
  status: string;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, any>;

  @Column({ name: 'provider_result', type: 'jsonb', default: {} })
  providerResult: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Conversation)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => Message)
  @JoinColumn({ name: 'message_id' })
  message: Message;

  @ManyToOne(() => TenantChannel)
  @JoinColumn({ name: 'channel_id' })
  channel: TenantChannel;
}
