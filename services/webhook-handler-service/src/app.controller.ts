import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  RequireServiceAuth,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
} from '@zayos/internal-service-auth';
import type { Request, Response } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get(['/', 'health'])
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('ready')
  async getReadiness() {
    const readiness = await this.appService.getReadiness();
    if (!readiness.ready) throw new ServiceUnavailableException(readiness);
    return readiness;
  }

  @Get('metrics')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
    scopes: [SERVICE_SCOPES.QUEUE_INSPECT],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  getMetrics() {
    return this.appService.getMetrics();
  }

  @Get('webhooks/queue/stats')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
    scopes: [SERVICE_SCOPES.QUEUE_INSPECT],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  getQueueStats() {
    return this.appService.getQueueStats();
  }

  @Get('webhooks/queue/dead-letters')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
    scopes: [SERVICE_SCOPES.QUEUE_INSPECT],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  getDeadLetters(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.appService.getDeadLetters(limit, cursor);
  }

  @Post('webhooks/queue/dead-letters/:eventId/replay')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
    scopes: [SERVICE_SCOPES.QUEUE_REPLAY],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  replayDeadLetter(@Param('eventId') eventId: string) {
    return this.appService.replayDeadLetter(eventId);
  }

  @Delete('webhooks/queue/dead-letters/:eventId')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
    scopes: [SERVICE_SCOPES.QUEUE_DRAIN],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  deleteDeadLetter(@Param('eventId') eventId: string) {
    return this.appService.deleteDeadLetter(eventId);
  }

  @Post('webhooks/viber/:channelId/register')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
    scopes: [SERVICE_SCOPES.WEBHOOK_REGISTER],
    allowedCallers: [
      SERVICE_IDENTITIES.CORE,
      SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
    ],
  })
  registerViberWebhook(
    @Param('channelId') channelId: string,
    @Body() body: any,
  ) {
    return this.appService.registerViberWebhook(channelId, body);
  }

  @Delete('webhooks/viber/:channelId/register')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.WEBHOOK_HANDLER,
    scopes: [SERVICE_SCOPES.WEBHOOK_REGISTER],
    allowedCallers: [
      SERVICE_IDENTITIES.CORE,
      SERVICE_IDENTITIES.PLATFORM_OPERATIONS,
    ],
  })
  unregisterViberWebhook(
    @Param('channelId') channelId: string,
    @Body() body: any,
  ) {
    return this.appService.unregisterViberWebhook(channelId, body);
  }

  @Post('webhooks/telegram/manager')
  receiveTelegramManagerWebhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
    @Req() request?: RawBodyRequest<Request>,
  ) {
    const correlationId = (
      request as
        | (RawBodyRequest<Request> & { correlationId?: string })
        | undefined
    )?.correlationId;
    return this.appService.receiveTelegramManagerWebhook({
      headers,
      body,
      rawBody: request?.rawBody,
      correlationId,
      receivedAt: new Date().toISOString(),
    });
  }

  @Post('webhooks/telegram/bots/:channelId')
  receiveTelegramMerchantBotWebhook(
    @Param('channelId') channelId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: Record<string, unknown>,
    @Body() body: Record<string, unknown>,
    @Req() request?: RawBodyRequest<Request>,
  ) {
    const correlationId = (
      request as
        | (RawBodyRequest<Request> & { correlationId?: string })
        | undefined
    )?.correlationId;
    return this.appService.receiveWebhook({
      provider: 'telegram',
      channelId,
      headers,
      query,
      body,
      rawBody: request?.rawBody,
      correlationId,
      receivedAt: new Date().toISOString(),
    });
  }

  @Get('webhooks/:provider/:channelId')
  async verifyWebhook(
    @Param('provider') provider: string,
    @Param('channelId') channelId: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Res() response: Response,
  ) {
    const verification = await this.appService.verifyWebhook(
      provider,
      channelId,
      query,
      headers,
    );

    if (verification.verified && verification.challenge) {
      return response.status(200).send(verification.challenge);
    }

    return response
      .status(verification.verified ? 200 : 403)
      .json(verification);
  }

  @Post('webhooks/:provider/:channelId')
  receiveWebhook(
    @Param('provider') provider: string,
    @Param('channelId') channelId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: Record<string, unknown>,
    @Body() body: Record<string, unknown>,
    @Req() request?: RawBodyRequest<Request>,
  ) {
    const correlationId = (
      request as
        | (RawBodyRequest<Request> & { correlationId?: string })
        | undefined
    )?.correlationId;
    return this.appService.receiveWebhook({
      provider,
      channelId,
      headers,
      query,
      body,
      rawBody: request?.rawBody,
      correlationId,
      receivedAt: new Date().toISOString(),
    });
  }
}
