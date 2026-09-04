import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsObject,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantChannelDto {
  @ApiProperty({ enum: ['messenger', 'viber', 'telegram', 'tiktok'] })
  @IsIn(['messenger', 'viber', 'telegram', 'tiktok'])
  channelType: string;

  @ApiProperty()
  @IsString()
  channelName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  configuration?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  credentials?: Record<string, any>;

  @ApiPropertyOptional({
    enum: ['pending_configuration', 'ready', 'connected', 'error'],
  })
  @IsOptional()
  @IsIn(['pending_configuration', 'ready', 'connected', 'error'])
  connectionStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  rateLimitMetadata?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoReplyEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  autoReplyMessage?: string;

  @ApiPropertyOptional({ enum: ['round_robin', 'least_busy', 'manual'] })
  @IsOptional()
  @IsIn(['round_robin', 'least_busy', 'manual'])
  assignmentRule?: string;
}
