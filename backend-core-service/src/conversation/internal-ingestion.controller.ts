/* eslint-disable @typescript-eslint/no-unsafe-argument -- Internal provider payload DTOs are still legacy untyped controller contracts. */
import { Body, Controller, Optional, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  RequireServiceAuth,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
} from '@zayos/internal-service-auth';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ConversationService,
  type NormalizedProviderMessage,
} from './conversation.service';
import { TelegramCommerceService } from '../telegram-bot/telegram-commerce.service';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TelegramBotApiClient } from '../channel/telegram-bot-api.client';
import { decryptProviderCredentialsWithFallback } from '../channel/provider-credentials.util';
import { TenantChannelSettingsService } from '../tenant/tenant-channel-settings.service';

/** Toast shown on stale shop buttons while the tenant template is off. */
export const TEMPLATE_DISABLED_CALLBACK_TOAST = 'Shop unavailable.';

@ApiExcludeController()
@Controller('internal/provider-events')
export class InternalIngestionController {
  private readonly telegram: TelegramBotApiClient;

  constructor(
    private readonly conversationService: ConversationService,
    private readonly telegramCommerceService: TelegramCommerceService,
    private readonly channelSettingsService: TenantChannelSettingsService,
    @InjectRepository(TenantChannel)
    private readonly channelRepository: Repository<TenantChannel>,
    @Optional() telegramClient?: TelegramBotApiClient,
  ) {
    this.telegram = telegramClient || new TelegramBotApiClient();
  }

  @Post()
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.CHAT_INGEST],
    allowedCallers: [SERVICE_IDENTITIES.CHAT_INGESTION],
  })
  ingestProviderEvent(@Body() body: any) {
    const payload = body as {
      provider?: unknown;
      eventId?: string;
      channelId: string;
      normalized: NormalizedProviderMessage & {
        callbackData?: string;
        callbackQueryId?: string;
      };
    };
    const provider = payload;
    if (provider.provider === 'telegram') {
      return this.ingestTelegramEvent(payload, body);
    }
    return this.conversationService.ingestProviderMessage(body);
  }

  private async ingestTelegramEvent(
    payload: {
      provider?: unknown;
      eventId?: string;
      channelId: string;
      normalized: NormalizedProviderMessage & {
        callbackData?: string;
        callbackQueryId?: string;
      };
    },
    body: any,
  ) {
    // The per-tenant bot-template toggle lives here and only here: when the
    // template is off, commerce is skipped entirely and the update goes
    // straight to normal ingestion. The commerce service itself is untouched.
    const templateEnabled = await this.isCommerceTemplateEnabled(
      payload.channelId,
    );
    if (!templateEnabled) {
      return this.ingestWithoutCommerce(payload, body);
    }
    return this.ingestWithCommerce(payload, body);
  }

  private ingestWithCommerce(
    payload: {
      eventId?: string;
      channelId: string;
      normalized: NormalizedProviderMessage & {
        callbackData?: string;
        callbackQueryId?: string;
      };
    },
    body: any,
  ) {
    const metadata = payload.normalized.metadata || {};
    const metadataVisitId =
      typeof metadata.telegramShoppingVisitId === 'string'
        ? metadata.telegramShoppingVisitId
        : typeof metadata.providerEventId === 'string'
          ? metadata.providerEventId
          : undefined;
    return this.conversationService
      .recordTelegramShoppingActivity({
        eventId: payload.eventId,
        channelId: payload.channelId,
        normalized: payload.normalized,
        visitId: metadataVisitId || payload.eventId || 'visit',
        screen: payload.normalized?.callbackData || payload.normalized?.content,
      })
      .then(() => this.telegramCommerceService.handle(body))
      .then(async (result) => {
        if (result.handled) return result;
        return this.conversationService.ingestProviderMessage(body);
      });
  }

  /**
   * Template-off path: every update goes to normal ingestion, except
   * callback_query updates (stale shop buttons). Those are answered so the
   * Telegram button stops spinning, and are NOT ingested as chat — normal
   * ingestion would only mark them processed without storing a message.
   */
  private async ingestWithoutCommerce(
    payload: {
      channelId: string;
      normalized: NormalizedProviderMessage & {
        callbackData?: string;
        callbackQueryId?: string;
      };
    },
    body: any,
  ) {
    const callbackQueryId = this.callbackQueryId(payload.normalized);
    if (callbackQueryId) {
      await this.answerTemplateSkippedCallback(
        payload.channelId,
        callbackQueryId,
      );
      const channel = await this.channelRepository.findOne({
        where: { id: payload.channelId },
        select: ['id', 'tenantId'],
      });
      return {
        accepted: true,
        duplicate: false,
        callbackQuery: true,
        templateSkipped: true,
        tenantId: channel?.tenantId || null,
        channelId: payload.channelId,
      };
    }
    return this.conversationService.ingestProviderMessage(body);
  }

  private async isCommerceTemplateEnabled(channelId: string): Promise<boolean> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      select: ['id', 'tenantId'],
    });
    // Unknown channel: preserve the existing chain behavior exactly (the
    // commerce service swallows channel_missing); do not change routing.
    if (!channel) return true;
    return this.channelSettingsService.isTelegramBotTemplateEnabled(
      channel.tenantId,
    );
  }

  private callbackQueryId(
    normalized: NormalizedProviderMessage & { callbackQueryId?: string },
  ): string | undefined {
    if (typeof normalized?.callbackQueryId === 'string') {
      return normalized.callbackQueryId;
    }
    const metadataId = normalized?.metadata?.['telegramCallbackQueryId'];
    if (typeof metadataId === 'string') return metadataId;
    return undefined;
  }

  private async answerTemplateSkippedCallback(
    channelId: string,
    callbackQueryId: string,
  ): Promise<void> {
    try {
      const channel = await this.channelRepository.findOne({
        where: { id: channelId },
      });
      if (!channel) return;
      const { credentials } = decryptProviderCredentialsWithFallback(
        channel.credentials,
        [
          process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY,
          process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY,
          process.env.JWT_SECRET,
        ],
      );
      const botToken =
        typeof credentials?.botToken === 'string' ? credentials.botToken : '';
      if (!botToken) return;
      await this.telegram.answerCallbackQuery(
        botToken,
        callbackQueryId,
        TEMPLATE_DISABLED_CALLBACK_TOAST,
      );
    } catch {
      // Best effort: a skipped callback must never fail ingestion.
    }
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
