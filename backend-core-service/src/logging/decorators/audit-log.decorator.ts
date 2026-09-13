import { SetMetadata } from '@nestjs/common';

export interface AuditLogOptions {
  action: string;
  resourceType?: string;
  skipAudit?: boolean;
}

export const AUDIT_LOG_KEY = 'audit_log';
export const AuditLog = (options: AuditLogOptions) =>
  SetMetadata(AUDIT_LOG_KEY, options);

// Usage examples:
// @AuditLog({ action: 'user_created', resourceType: 'user' })
// @AuditLog({ action: 'conversation_updated', resourceType: 'conversation' })
