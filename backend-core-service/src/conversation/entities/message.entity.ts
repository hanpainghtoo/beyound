import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Conversation } from './conversation.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('messages')
export class Message {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'conversation_id' })
  conversationId: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'channel_id', type: 'uuid', nullable: true })
  channelId: string | null;

  @ApiProperty({ enum: ['customer', 'csr', 'system'] })
  @Column({ name: 'sender_type' })
  senderType: string;

  @ApiProperty()
  @Column({ name: 'sender_id', nullable: true })
  senderId: string;

  @ApiProperty({
    enum: [
      'text',
      'image',
      'video',
      'audio',
      'file',
      'location',
      'order',
      'invoice',
    ],
  })
  @Column({ name: 'message_type', default: 'text' })
  messageType: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  content: string;

  @ApiProperty()
  @Column({ type: 'jsonb', default: [] })
  attachments: Record<string, any>[];

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  provider: string | null;

  @ApiProperty()
  @Column({ name: 'external_message_id', type: 'varchar', nullable: true })
  externalMessageId: string | null;

  @ApiProperty()
  @Column({ name: 'reply_to_message_id', nullable: true })
  replyToMessageId: string;

  @ApiProperty({
    enum: [
      'queued',
      'sending',
      'sent',
      'delivered',
      'read',
      'failed',
      'delivery_unknown',
    ],
  })
  @Column({ default: 'sent' })
  status: string;

  @ApiProperty()
  @Column({ name: 'is_internal', default: false })
  isInternal: boolean;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Conversation)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => Message)
  @JoinColumn({ name: 'reply_to_message_id' })
  replyToMessage: Message;
}
