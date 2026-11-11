import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const TENANT_MEMBER_ROLES = [
  'owner',
  'admin',
  'supervisor',
  'agent',
  'finance',
  'delivery',
] as const;

export type TenantMemberRole = (typeof TENANT_MEMBER_ROLES)[number];

export const TENANT_MEMBER_STATUSES = [
  'active',
  'inactive',
  'suspended',
] as const;

export type TenantMemberStatus = (typeof TENANT_MEMBER_STATUSES)[number];

/**
 * Query for the per-member audit rollup.
 *
 * `search` filters the member (name, email, or role) rather than an audit
 * action, so filtering must happen server side to page correctly.
 */
export class TenantAuditSummaryQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TENANT_MEMBER_ROLES })
  @IsOptional()
  @IsString()
  role?: TenantMemberRole;

  // `status` is inherited from PaginationDto (string). It filters the member's
  // account status here; TENANT_MEMBER_STATUSES documents the valid values.
}
