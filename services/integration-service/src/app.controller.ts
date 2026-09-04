import { Body, Controller, Get, Param, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import {
  RequireServiceAuth,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
} from '@zayos/internal-service-auth';
import type { Request } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get(['/', 'health'])
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('ready')
  getReadiness() {
    const readiness = this.appService.getReadiness();
    if (!readiness.ready) throw new ServiceUnavailableException(readiness);
    return readiness;
  }

  @Get('metrics')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.INTEGRATION,
    scopes: [SERVICE_SCOPES.QUEUE_INSPECT],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  getMetrics() {
    return this.appService.getMetrics();
  }

  @Get('providers')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.INTEGRATION,
    scopes: [SERVICE_SCOPES.PROVIDER_TEST],
    allowedCallers: [SERVICE_IDENTITIES.CORE, SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  getProviders() {
    return this.appService.getProviders();
  }

  @Get('providers/:provider')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.INTEGRATION,
    scopes: [SERVICE_SCOPES.PROVIDER_TEST],
    allowedCallers: [SERVICE_IDENTITIES.CORE, SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  getProvider(@Param('provider') provider: string) {
    return this.appService.getProvider(provider);
  }

  @Post('providers/:provider/validate')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.INTEGRATION,
    scopes: [SERVICE_SCOPES.PROVIDER_TEST],
    allowedCallers: [SERVICE_IDENTITIES.CORE, SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  validateProvider(@Param('provider') provider: string, @Body() body: any) {
    return this.appService.validateProvider(provider, body);
  }

  @Post('providers/:provider/webhook/register')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.INTEGRATION,
    scopes: [SERVICE_SCOPES.WEBHOOK_REGISTER],
    allowedCallers: [SERVICE_IDENTITIES.CORE, SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  registerWebhook(@Param('provider') provider: string, @Body() body: any) {
    return this.appService.registerWebhook(provider, body);
  }

  @Post('providers/:provider/webhook/info')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.INTEGRATION,
    scopes: [SERVICE_SCOPES.WEBHOOK_REGISTER],
    allowedCallers: [SERVICE_IDENTITIES.CORE, SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  getWebhookInfo(@Param('provider') provider: string, @Body() body: any) {
    return this.appService.getWebhookInfo(provider, body);
  }

  @Post('providers/:provider/webhook/delete')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.INTEGRATION,
    scopes: [SERVICE_SCOPES.WEBHOOK_REGISTER],
    allowedCallers: [SERVICE_IDENTITIES.CORE, SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  deleteWebhook(@Param('provider') provider: string, @Body() body: any) {
    return this.appService.deleteWebhook(provider, body);
  }

  @Post('providers/:provider/send')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.INTEGRATION,
    scopes: [SERVICE_SCOPES.PROVIDER_SEND],
    allowedCallers: [SERVICE_IDENTITIES.CORE],
  })
  send(
    @Param('provider') provider: string,
    @Body() body: any,
    @Req() request?: Request & { correlationId?: string },
  ) {
    return this.appService.send(provider, body, request?.correlationId);
  }
}
