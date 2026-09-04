import { Body, Controller, Get, Post, Req, ServiceUnavailableException } from '@nestjs/common';
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
    audience: SERVICE_IDENTITIES.CHAT_INGESTION,
    scopes: [SERVICE_SCOPES.QUEUE_INSPECT],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  getMetrics() {
    return this.appService.getMetrics();
  }

  @Post('ingest')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CHAT_INGESTION,
    scopes: [SERVICE_SCOPES.CHAT_INGEST],
    allowedCallers: [SERVICE_IDENTITIES.WEBHOOK_HANDLER],
  })
  ingest(@Body() body: any, @Req() request?: Request & { correlationId?: string }) {
    return this.appService.ingest({
      ...body,
      correlationId: body?.correlationId || request?.correlationId,
    });
  }
}
