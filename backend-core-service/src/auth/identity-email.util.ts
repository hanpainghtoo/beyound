import { BadRequestException, ConflictException } from '@nestjs/common';

export const TENANT_USER_NORMALIZED_EMAIL_UNIQUE_INDEX =
  'uq_tenant_users_normalized_email';
export const TENANT_USER_EMAIL_CONFLICT_MESSAGE =
  'This email is already associated with a ZayOS account.';
export const PUBLIC_REGISTRATION_EMAIL_CONFLICT_MESSAGE =
  'An account already exists for this email. Sign in or use password recovery.';

export function normalizeIdentityEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new BadRequestException('Email is required.');
  }
  return normalized;
}

export function isTenantUserIdentityUniqueViolation(error: unknown) {
  const candidate = error as {
    code?: string;
    constraint?: string;
    detail?: string;
  };
  return (
    candidate?.code === '23505' &&
    (candidate.constraint === TENANT_USER_NORMALIZED_EMAIL_UNIQUE_INDEX ||
      candidate.detail?.includes('normalized_email'))
  );
}

export function mapTenantUserIdentityConflict(
  error: unknown,
  message = TENANT_USER_EMAIL_CONFLICT_MESSAGE,
) {
  if (isTenantUserIdentityUniqueViolation(error)) {
    return new ConflictException(message);
  }
  return null;
}
