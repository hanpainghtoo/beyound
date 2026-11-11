import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantChannelSettings } from '../../tenant/entities/tenant-channel-settings.entity';

/**
 * Plan 78: blocks the bot-template surface while the platform has commerce
 * switched off for the tenant.
 *
 * Reads `tenant_channel_settings` directly instead of injecting
 * `TenantChannelSettingsService`, because `TenantChannelSettingsModule`
 * imports `BotTemplateModule` — injecting that service into `BotTemplateModule`
 * would create a circular import. Reading the repository also skips the 20s
 * TTL cache, so a toggle takes effect on the very next request.
 *
 * Must run after `TenantGuard` (it needs `request.tenant`) and `JwtAuthGuard`.
 * Platform admins bypass, matching `FeatureGuard`.
 */
@Injectable()
export class CommerceTemplateGuard implements CanActivate {
  constructor(
    @InjectRepository(TenantChannelSettings)
    private readonly repository: Repository<TenantChannelSettings>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user?.type === 'platform_admin') return true;

    const tenantId = request.tenant?.id || user?.tenantId;
    // No tenant context: let the surrounding guards decide, so an auth failure
    // is not reported as a disabled feature.
    if (!tenantId) return true;

    const row = await this.repository.findOne({ where: { tenantId } });
    if (row?.telegramBotTemplate === 'commerce') return true;

    throw new ForbiddenException({
      code: 'commerce_disabled',
      message:
        'Commerce is turned off for this workspace. Ask your platform admin to enable it.',
    });
  }
}