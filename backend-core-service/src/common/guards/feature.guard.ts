import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FeatureToggleService } from '../../feature-toggle/feature-toggle.service';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator';

/**
 * Plan 55: blocks requests to controllers/handlers decorated with
 * `@RequireFeature('orders')` when the tenant has that feature switched off.
 *
 * Must run after `TenantGuard` (it needs `request.tenant`) and `JwtAuthGuard`.
 * Platform admins bypass, matching `TenantGuard` behaviour.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureToggleService: FeatureToggleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user?.type === 'platform_admin') return true;

    const tenantId = request.tenant?.id || user?.tenantId;
    if (!tenantId) return true;

    const enabled = await this.featureToggleService.isEnabled(
      tenantId,
      required,
    );
    if (enabled) return true;

    throw new ForbiddenException({
      code: 'feature_disabled',
      feature: required,
      message: `The "${required}" module is disabled for this workspace`,
    });
  }
}
