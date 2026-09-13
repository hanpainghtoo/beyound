import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  RequireServiceAuth,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
} from '@zayos/internal-service-auth';

import { TenantService } from './tenant.service';

@Controller('internal/channels')
export class InternalChannelCredentialsController {
  constructor(private readonly tenantService: TenantService) {}

  @Get(':channelId/providers/:provider/webhook-resolution')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.CHANNEL_WEBHOOK_RESOLVE],
    allowedCallers: [
      SERVICE_IDENTITIES.WEBHOOK_HANDLER,
      SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
    ],
  })
  resolveWebhookChannel(
    @Param('channelId') channelId: string,
    @Param('provider') provider: string,
  ) {
    return this.tenantService.resolveInternalWebhookChannel(
      channelId,
      provider,
    );
  }

  @Get(':channelId/providers/:provider/verification')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.CHANNEL_CREDENTIALS_READ],
    allowedCallers: [
      SERVICE_IDENTITIES.CHAT_INGESTION,
      SERVICE_IDENTITIES.WEBHOOK_HANDLER,
      SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
    ],
  })
  getProviderVerification(
    @Param('channelId') channelId: string,
    @Param('provider') provider: string,
  ) {
    return this.tenantService.getInternalProviderVerification(
      channelId,
      provider,
    );
  }

  @Get(':channelId/providers/:provider/credentials')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.CHANNEL_CREDENTIALS_READ],
    allowedCallers: [
      SERVICE_IDENTITIES.CHAT_INGESTION,
      SERVICE_IDENTITIES.WEBHOOK_HANDLER,
      SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
    ],
  })
  getProviderCredentials(
    @Param('channelId') channelId: string,
    @Param('provider') provider: string,
  ) {
    return this.tenantService.getInternalProviderCredentials(
      channelId,
      provider,
    );
  }

  @Put(':channelId/providers/:provider/credentials')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.CHANNEL_CREDENTIALS_WRITE],
    allowedCallers: [SERVICE_IDENTITIES.WEBHOOK_HANDLER],
  })
  updateProviderCredentials(
    @Param('channelId') channelId: string,
    @Param('provider') provider: string,
    @Body('credentials') credentials: Record<string, any> | undefined,
  ) {
    return this.tenantService.updateInternalProviderCredentials(
      channelId,
      provider,
      credentials || {},
    );
  }

  @Put(':channelId/providers/:provider/webhook-registration')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.WEBHOOK_REGISTER],
    allowedCallers: [SERVICE_IDENTITIES.WEBHOOK_HANDLER],
  })
  updateWebhookRegistration(
    @Param('channelId') channelId: string,
    @Param('provider') provider: string,
    @Body() body: { status?: string; errorCode?: string | null } | undefined,
  ) {
    return this.tenantService.updateInternalWebhookRegistrationStatus(
      channelId,
      provider,
      body?.status,
      body?.errorCode,
    );
  }
}
