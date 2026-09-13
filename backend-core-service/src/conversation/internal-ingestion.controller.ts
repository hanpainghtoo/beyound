/* eslint-disable @typescript-eslint/no-unsafe-argument -- Internal provider payload DTOs are still legacy untyped controller contracts. */
import { Body, Controller, Post } from '@nestjs/common';
import {
  RequireServiceAuth,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
} from '@zayos/internal-service-auth';

import { ConversationService } from './conversation.service';

@Controller('internal/provider-events')
export class InternalIngestionController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.CHAT_INGEST],
    allowedCallers: [SERVICE_IDENTITIES.CHAT_INGESTION],
  })
  ingestProviderEvent(@Body() body: any) {
    return this.conversationService.ingestProviderMessage(body);
  }

  @Post('message-status')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    anyScopes: [SERVICE_SCOPES.CHAT_INGEST, SERVICE_SCOPES.PROVIDER_SEND],
    allowedCallers: [
      SERVICE_IDENTITIES.CHAT_INGESTION,
      SERVICE_IDENTITIES.INTEGRATION,
    ],
  })
  updateProviderMessageStatus(@Body() body: any) {
    return this.conversationService.updateProviderMessageStatus(body);
  }
}
