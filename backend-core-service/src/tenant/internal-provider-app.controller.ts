import { Controller, Get, Param } from '@nestjs/common';
import {
  RequireServiceAuth,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
} from '@zayos/internal-service-auth';

import { TenantService } from './tenant.service';

@Controller('internal/provider-app-configs')
export class InternalProviderAppController {
  constructor(private readonly tenantService: TenantService) {}

  @Get(':provider/:routingId/webhook-config')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.CHANNEL_CREDENTIALS_READ],
    allowedCallers: [
      SERVICE_IDENTITIES.WEBHOOK_HANDLER,
      SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
    ],
  })
  getWebhookConfig(
    @Param('provider') provider: string,
    @Param('routingId') routingId: string,
  ) {
    return this.tenantService.getInternalProviderAppWebhookConfig(
      provider,
      routingId,
    );
  }

  @Get(':provider/:routingId/pages/:pageId/webhook-resolution')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.CHANNEL_WEBHOOK_RESOLVE],
    allowedCallers: [
      SERVICE_IDENTITIES.WEBHOOK_HANDLER,
      SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
    ],
  })
  resolvePageWebhookChannel(
    @Param('provider') provider: string,
    @Param('routingId') routingId: string,
    @Param('pageId') pageId: string,
  ) {
    return this.tenantService.resolveInternalProviderAppPageChannel(
      provider,
      routingId,
      pageId,
    );
  }
}
