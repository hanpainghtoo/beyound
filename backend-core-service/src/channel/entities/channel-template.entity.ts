import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('channel_templates')
export class ChannelTemplate {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ enum: ['messenger', 'viber', 'telegram', 'tiktok'] })
  @Column({ name: 'channel_type' })
  channelType: string;

  @ApiProperty()
  @Column({ name: 'template_name' })
  templateName: string;

  @ApiProperty()
  @Column({ name: 'app_id', nullable: true })
  appId: string;

  @ApiProperty()
  @Column({ name: 'bot_token', nullable: true })
  botToken: string;

  @ApiProperty()
  @Column({ name: 'callback_url', nullable: true })
  callbackUrl: string;

  @ApiProperty()
  @Column({ name: 'webhook_events', type: 'jsonb', default: [] })
  webhookEvents: string[];

  @ApiProperty()
  @Column({ name: 'default_welcome_message', type: 'text', nullable: true })
  defaultWelcomeMessage: string;

  @ApiProperty({ enum: ['active', 'inactive'] })
  @Column({ default: 'active' })
  status: string;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  configuration: Record<string, any>;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
