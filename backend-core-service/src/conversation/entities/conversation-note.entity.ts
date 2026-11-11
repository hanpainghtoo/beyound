import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Conversation } from './conversation.entity';
import { TenantUser } from '../../auth/entities/tenant-user.entity';

@Index('ix_conversation_notes_conversation', ['conversationId'])
@Entity('conversation_notes')
export class ConversationNote {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ApiProperty()
  @Column({ name: 'conversation_id' })
  conversationId: string;

  @ApiProperty()
  @Column({ name: 'author_id', nullable: true })
  authorId: string | null;

  @ApiProperty()
  @Column({ type: 'text' })
  content: string;

  @ApiProperty()
  @Column({ name: 'is_pinned', default: false })
  isPinned: boolean;

  @ApiProperty()
  @Column({ name: 'is_resolved', default: false })
  isResolved: boolean;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Conversation)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => TenantUser)
  @JoinColumn({ name: 'author_id' })
  author: TenantUser;
}
