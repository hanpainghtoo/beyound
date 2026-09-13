import type { TenantUser } from '../../auth/entities/tenant-user.entity';
import type { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { isSensitiveFieldName } from '../../logging/redaction.util';

export type TenantUserResponseDto = {
  id: string;
  tenantId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  permissions: Record<string, any>;
  status: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
  avatarUrl: string | null;
  department: string | null;
  employeeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TenantUserInvitationResponseDto = {
  user: TenantUserResponseDto;
  invitation: {
    message: string;
    invitationDelivery: 'requested' | 'unavailable';
    expiresAt: Date;
  };
};

export function toTenantUserResponse(user: TenantUser): TenantUserResponseDto {
  return {
    id: user.id,
    tenantId: user.tenantId,
    fullName: user.fullName,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    permissions: stripSensitivePublicFields(user.permissions || {}) as Record<
      string,
      any
    >,
    status: user.status,
    isOnline: Boolean(user.isOnline),
    lastSeenAt: user.lastSeenAt || null,
    avatarUrl: user.avatarUrl || null,
    department: user.department || null,
    employeeId: user.employeeId || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function stripSensitivePublicFields(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    const arrayResult = value.map((item) =>
      stripSensitivePublicFields(item, seen),
    );
    seen.delete(value);
    return arrayResult;
  }
  const result: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!isSensitiveFieldName(key)) {
      result[key] = stripSensitivePublicFields(nestedValue, seen);
    }
  }
  seen.delete(value);
  return result;
}

export function toPaginatedTenantUserResponse(
  result: PaginatedResult<TenantUser>,
): PaginatedResult<TenantUserResponseDto> {
  return {
    ...result,
    data: result.data.map(toTenantUserResponse),
  };
}
