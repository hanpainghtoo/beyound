import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BotTemplateFieldDto {
  @ApiProperty({
    enum: ['greeting', 'products', 'shop_info', 'orders', 'agent'],
  })
  @IsString()
  @IsIn(['greeting', 'products', 'shop_info', 'orders', 'agent'])
  key: string;

  @ApiPropertyOptional({ enum: ['full', 'half', 'third'] })
  @IsOptional()
  @IsIn(['full', 'half', 'third'])
  layout?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({ enum: ['requires_ordering'] })
  @IsOptional()
  @IsIn(['requires_ordering'])
  condition?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  value?: Record<string, unknown>;
}

export class CreateBotTemplateDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ type: [BotTemplateFieldDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BotTemplateFieldDto)
  fields: BotTemplateFieldDto[];
}

export class UpdateBotTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ type: [BotTemplateFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BotTemplateFieldDto)
  fields?: BotTemplateFieldDto[];
}

export class SetChannelTemplateDto {
  @ApiPropertyOptional({
    description:
      'Template id to attach; omit to keep the current selection, null to detach.',
  })
  @IsOptional()
  @IsUUID()
  templateId?: string | null;

  @ApiProperty()
  @IsBoolean()
  useBotTemplate: boolean;
}

export class SetShopSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shopEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  orderingEnabled?: boolean;
}
