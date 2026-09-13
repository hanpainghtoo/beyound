import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  IsIn,
  ArrayUnique,
  IsInt,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const PLAN_ALLOWED_PROVIDERS = [
  'messenger',
  'telegram',
  'viber',
  'tiktok',
] as const;

/**
 * Legacy quota-mode selector retained only for API compatibility during the
 * transition. New plans always use independent inbound and outbound limits and
 * must not depend on this field.
 */
export const PLAN_MESSAGE_QUOTA_MODES = ['combined', 'directional'] as const;

export const PLAN_TYPES = ['business', 'trial'] as const;
export type SubscriptionPlanType = (typeof PLAN_TYPES)[number];

export class CreateSubscriptionPlanDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: PLAN_TYPES, default: 'business' })
  @IsOptional()
  @IsIn(PLAN_TYPES)
  planType?: SubscriptionPlanType;

  @ApiPropertyOptional({
    default: true,
    description:
      'Whether tenants may request this plan in the normal business catalog. Trial plans must set this to false.',
  })
  @IsOptional()
  @IsBoolean()
  requestable?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Whether the plan renews. Trial plans must set this to false.',
  })
  @IsOptional()
  @IsBoolean()
  renewable?: boolean;

  @ApiPropertyOptional({
    default: true,
    description:
      'Whether tenants may purchase top-ups against this plan. Trial plans must set this to false.',
  })
  @IsOptional()
  @IsBoolean()
  topUpAllowed?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Whether a paid period for this plan skips admin activation. Trial plans must set this to true.',
  })
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Monthly subscription price.' })
  @IsNumber()
  monthlyPrice: number;

  @ApiPropertyOptional({
    description:
      'Trial length in days for trial plans (required and must be > 0 when planType = trial). For business plans this is a deprecated legacy value; business periods use calendar months.',
  })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({
    enum: PLAN_MESSAGE_QUOTA_MODES,
    default: 'combined',
    description:
      '(Deprecated) Legacy combined/directional quota selector. New plans always enforce independent inbound and outbound limits.',
    deprecated: true,
  })
  @IsOptional()
  @IsIn(PLAN_MESSAGE_QUOTA_MODES)
  messageQuotaMode?: (typeof PLAN_MESSAGE_QUOTA_MODES)[number];

  @ApiProperty()
  @IsNumber()
  @Min(0)
  maxCsrs: number;

  @ApiProperty({ description: 'Channel capacity. 0 means no channels.' })
  @IsNumber()
  @Min(0)
  maxChannels: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      '(Deprecated) Aggregate message limit kept for compatibility. New enforcement uses inboundMessageLimit and outboundMessageLimit. null means unlimited.',
    deprecated: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  messageLimit?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Monthly inbound message limit. null means unlimited; 0 means blocked.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  inboundMessageLimit?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Monthly outbound message limit. null means unlimited; 0 means blocked.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  outboundMessageLimit?: number | null;

  @ApiPropertyOptional({
    enum: PLAN_ALLOWED_PROVIDERS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(PLAN_ALLOWED_PROVIDERS, { each: true })
  @ArrayUnique()
  allowedProviders?: string[];

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Monthly API request limit. null means unlimited; 0 means blocked.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  apiLimit?: number | null;

  @ApiProperty({ description: 'Storage capacity in GB. 0 means no storage.' })
  @IsNumber()
  @Min(0)
  storageLimitGb: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  features?: Record<string, any>;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'archived'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'archived'])
  status?: string;
}
