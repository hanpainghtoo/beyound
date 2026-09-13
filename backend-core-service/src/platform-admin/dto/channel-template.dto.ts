import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChannelTemplateDto {
  @ApiProperty({ enum: ['messenger', 'viber', 'telegram', 'tiktok'] })
  @IsIn(['messenger', 'viber', 'telegram', 'tiktok'])
  channelType: string;

  @ApiProperty()
  @IsString()
  templateName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  botToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  webhookEvents?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultWelcomeMessage?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  configuration?: Record<string, any>;
}

export class UpdateChannelTemplateDto extends CreateChannelTemplateDto {}
