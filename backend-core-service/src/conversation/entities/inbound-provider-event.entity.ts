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

import { TenantChannel } from '../../channel/entities/tenant-channel.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Message } from './message.entity';

@Entity('inbound_provider_events')
@Index('idx_inbound_provider_events_tenant_channel', [
  'tenantId',
  'channelId',
  'provider',
  'receivedAt',
])
@Index(
  'uq_inbound_provider_events_provider_channel_event',
  ['provider', 'channelId', 'providerEventId'],
  { unique: true },
)
export class InboundProviderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  provider: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @Column({ name: 'provider_event_id', type: 'varchar' })
  providerEventId: string;

  @Column({ name: 'provider_message_id', type: 'varchar', nullable: true })
  providerMessageId: string | null;

  @Column({ name: 'provider_conversation_id', type: 'varchar', nullable: true })
  providerConversationId: string | null;

  @Column({ name: 'provider_customer_id', type: 'varchar', nullable: true })
  providerCustomerId: string | null;

  @Column({ name: 'event_type', type: 'varchar', default: 'message' })
  eventType: string;

  @Column({ name: 'payload_hash', type: 'varchar', nullable: true })
  payloadHash: string | null;

  @Column({ name: 'processing_status', type: 'varchar', default: 'received' })
  processingStatus:
    | 'received'
    | 'processing'
    | 'processed'
    | 'duplicate'
    | 'failed_retryable'
    | 'failed_terminal';

  @Column({ name: 'occurred_at', type: 'timestamp' })
  occurredAt: Date;

  @Column({ name: 'received_at', type: 'timestamp' })
  receivedAt: Date;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'message_id', type: 'uuid', nullable: true })
  messageId: string | null;

  @Column({ name: 'failure_code', type: 'varchar', nullable: true })
  failureCode: string | null;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => TenantChannel)
  @JoinColumn({ name: 'channel_id' })
  channel: TenantChannel;

  @ManyToOne(() => Message, { nullable: true })
  @JoinColumn({ name: 'message_id' })
  message: Message | null;
}
