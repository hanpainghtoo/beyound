import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Platform admins can access any tenant
    if (user.type === 'platform_admin') {
      return true;
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Email verification is required before using workspace features',
      );
    }

    // Tenant users can only access their own tenant
    const tenantId =
      request.params?.tenantId || request.body?.tenantId || user.tenantId;
    if (user.tenantId && user.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied to this tenant');
    }

    request.tenant = { id: tenantId };
    return true;
  }
}
