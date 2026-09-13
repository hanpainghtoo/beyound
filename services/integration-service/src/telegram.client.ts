export type TelegramSendInput = {
  channelId: string;
  conversationId?: string;
  recipientId?: string;
  content: string;
  messageType?: 'text' | 'image' | 'file';
  attachments?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
};

export type TelegramBotIdentity = {
  botId: string;
  username?: string;
  firstName?: string;
  canJoinGroups?: boolean;
  canReadAllGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
};

export type TelegramWebhookInfo = {
  url: string;
  hasCustomCertificate?: boolean;
  pendingUpdateCount: number;
  lastErrorDate?: number;
  lastErrorMessage?: string;
  maxConnections?: number;
  allowedUpdates?: string[];
};

type TelegramApiResponse<T> = {
  ok?: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: {
    retry_after?: number;
  };
};

type TelegramMessageResult = {
  message_id?: number;
  chat?: { id?: number | string };
  date?: number;
};

const OFFICIAL_TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const MAX_RESPONSE_BYTES = 64 * 1024;

export class TelegramClient {
  constructor(
    private readonly apiBaseUrl = process.env.TELEGRAM_API_BASE_URL ||
      OFFICIAL_TELEGRAM_API_BASE_URL,
    private readonly fetcher?: typeof fetch,
    private readonly timeoutMs = Number(process.env.TELEGRAM_API_TIMEOUT_MS || 8000),
    private readonly nodeEnv = process.env.NODE_ENV,
  ) {
    this.assertApiBaseUrlAllowed();
  }

  async getMe(botToken: string) {
    this.assertValidBotToken(botToken);
    const body = await this.call<{
      id?: number | string;
      is_bot?: boolean;
      first_name?: string;
      username?: string;
      can_join_groups?: boolean;
      can_read_all_group_messages?: boolean;
      supports_inline_queries?: boolean;
    }>(botToken, 'getMe', {});

    const result = body.result;
    if (
      !body.ok ||
      !result ||
      result.is_bot !== true ||
      (typeof result.id !== 'string' && typeof result.id !== 'number')
    ) {
      throw this.providerError('unexpected_provider_response');
    }

    return {
      botId: String(result.id),
      username: this.stringValue(result.username),
      firstName: this.stringValue(result.first_name),
      canJoinGroups: result.can_join_groups,
      canReadAllGroupMessages: result.can_read_all_group_messages,
      supportsInlineQueries: result.supports_inline_queries,
    } satisfies TelegramBotIdentity;
  }

  async setWebhook(
    botToken: string,
    input: {
      url: string;
      secretToken: string;
      allowedUpdates?: string[];
      maxConnections?: number;
      dropPendingUpdates?: boolean;
    },
  ) {
    this.assertValidBotToken(botToken);
    this.assertHttpsUrl(input.url);
    this.assertValidSecretToken(input.secretToken);
    const allowedUpdates = input.allowedUpdates?.length
      ? input.allowedUpdates
      : ['message'];
    const maxConnections =
      typeof input.maxConnections === 'number'
        ? Math.min(Math.max(Math.trunc(input.maxConnections), 1), 100)
        : undefined;

    const body = await this.call<boolean>(botToken, 'setWebhook', {
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: allowedUpdates,
      ...(maxConnections ? { max_connections: maxConnections } : {}),
      drop_pending_updates: input.dropPendingUpdates === true,
    });

    if (body.ok !== true || body.result !== true) {
      throw this.providerError('webhook_registration_failed', body);
    }

    return {
      accepted: true,
      allowedUpdates,
      dropPendingUpdates: input.dropPendingUpdates === true,
      maxConnections,
    };
  }

  async getWebhookInfo(botToken: string) {
    this.assertValidBotToken(botToken);
    const body = await this.call<TelegramWebhookInfo>(
      botToken,
      'getWebhookInfo',
      {},
    );
    const result = body.result;
    if (!body.ok || !result || typeof result.url !== 'string') {
      throw this.providerError('unexpected_provider_response', body);
    }

    return {
      url: result.url,
      hasCustomCertificate: result.hasCustomCertificate,
      pendingUpdateCount: Number(result.pendingUpdateCount || 0),
      lastErrorDate: result.lastErrorDate,
      lastErrorMessage: this.safeDescription(result.lastErrorMessage),
      maxConnections: result.maxConnections,
      allowedUpdates: Array.isArray(result.allowedUpdates)
        ? result.allowedUpdates.filter((item) => typeof item === 'string')
        : undefined,
    } satisfies TelegramWebhookInfo;
  }

  async deleteWebhook(
    botToken: string,
    options: { dropPendingUpdates?: boolean } = {},
  ) {
    this.assertValidBotToken(botToken);
    const body = await this.call<boolean>(botToken, 'deleteWebhook', {
      drop_pending_updates: options.dropPendingUpdates === true,
    });
    if (body.ok !== true || body.result !== true) {
      throw this.providerError('webhook_registration_failed', body);
    }
    return { deleted: true, dropPendingUpdates: options.dropPendingUpdates === true };
  }

  async send(input: TelegramSendInput) {
    const botToken = this.stringValue(input.credentials?.botToken);
    const recipientId = this.stringValue(input.recipientId);
    const messageType = input.messageType || 'text';

    const validationErrors = [
      ...(!botToken ? ['credentials.botToken is required'] : []),
      ...(!recipientId ? ['recipientId is required'] : []),
      ...(messageType === 'text' && !input.content?.trim()
        ? ['content is required for text messages']
        : []),
      ...(messageType === 'text' && input.content?.length > 4096
        ? ['content exceeds Telegram text limit']
        : []),
    ];

    const attachmentUrl =
      messageType === 'text' ? undefined : this.getAttachmentUrl(input.attachments);
    if (messageType !== 'text' && !attachmentUrl) {
      validationErrors.push(
        `attachments[0].url is required for ${messageType} messages`,
      );
    }

    if (validationErrors.length > 0 || !botToken || !recipientId) {
      return {
        accepted: false,
        provider: 'telegram' as const,
        channelId: input.channelId,
        conversationId: input.conversationId,
        recipientId: input.recipientId,
        messageType,
        status: 'validation_error',
        errors: validationErrors,
      };
    }

    try {
      this.assertValidBotToken(botToken);
    } catch {
      return this.safeSendFailure(input, messageType, 'invalid_credentials');
    }

    const method =
      messageType === 'image'
        ? 'sendPhoto'
        : messageType === 'file'
          ? 'sendDocument'
          : 'sendMessage';
    const payload: Record<string, unknown> = {
      chat_id: recipientId,
    };

    if (messageType === 'text') {
      payload.text = input.content.trim();
      if (typeof input.metadata?.parseMode === 'string') {
        payload.parse_mode = input.metadata.parseMode;
      }
      if (typeof input.metadata?.disableWebPagePreview === 'boolean') {
        payload.link_preview_options = {
          is_disabled: input.metadata.disableWebPagePreview,
        };
      }
    } else {
      payload[messageType === 'image' ? 'photo' : 'document'] = attachmentUrl;
      if (input.content?.trim()) payload.caption = input.content.trim();
    }

    try {
      const body = await this.call<TelegramMessageResult>(
        botToken,
        method,
        payload,
      );
      if (body.ok !== true || !body.result) {
        return this.mapSendProviderError(input, messageType, body);
      }

      return {
        accepted: true,
        provider: 'telegram' as const,
        channelId: input.channelId,
        conversationId: input.conversationId,
        recipientId: input.recipientId,
        messageType,
        externalMessageId: body.result.message_id
          ? `${recipientId}:${String(body.result.message_id)}`
          : undefined,
        status: 'sent',
        delivery: {
          state: 'accepted_by_provider',
          providerChatId: body.result.chat?.id ? String(body.result.chat.id) : recipientId,
          providerMessageId: body.result.message_id
            ? String(body.result.message_id)
            : undefined,
          sentAt: body.result.date
            ? new Date(body.result.date * 1000).toISOString()
            : undefined,
          callbacksExpected: ['message'],
        },
      };
    } catch (error) {
      const status =
        error instanceof TelegramProviderError ? error.code : 'delivery_unknown';
      return {
        accepted: false,
        provider: 'telegram' as const,
        channelId: input.channelId,
        conversationId: input.conversationId,
        recipientId: input.recipientId,
        messageType,
        status,
        providerError: {
          code: status,
          ...(error instanceof TelegramProviderError
            ? {
                telegramCode: error.safeDetails.telegramCode,
                description: error.safeDetails.description,
                retryAfterSeconds: error.safeDetails.retryAfterSeconds,
              }
            : {}),
        },
        retry: {
          recommended:
            status === 'network_timeout' ||
            status === 'provider_unavailable' ||
            status === 'rate_limited',
          retryAfterSeconds:
            error instanceof TelegramProviderError
              ? error.safeDetails.retryAfterSeconds
              : undefined,
        },
      };
    }
  }

  private async call<T>(
    botToken: string,
    method: string,
    payload: Record<string, unknown>,
  ): Promise<TelegramApiResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await (this.fetcher || fetch)(
        `${this.apiBaseUrl.replace(/\/$/, '')}/bot${encodeURIComponent(botToken)}/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );
      const bodyText = await response.text();
      const limitedBody = bodyText.slice(0, MAX_RESPONSE_BYTES);
      const body = JSON.parse(limitedBody || '{}') as TelegramApiResponse<T>;
      if (!response.ok || body.ok === false) {
        throw this.providerError(this.mapErrorCode(response.status, body), body);
      }
      return body;
    } catch (error) {
      if (error instanceof TelegramProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.providerError('network_timeout');
      }
      if (error instanceof SyntaxError) {
        throw this.providerError('unexpected_provider_response');
      }
      throw this.providerError('provider_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapSendProviderError(
    input: TelegramSendInput,
    messageType: string,
    body: TelegramApiResponse<TelegramMessageResult>,
  ) {
    const status = this.mapErrorCode(body.error_code || 400, body);
    return {
      accepted: false,
      provider: 'telegram' as const,
      channelId: input.channelId,
      conversationId: input.conversationId,
      recipientId: input.recipientId,
      messageType,
      status,
      providerError: {
        code: status,
        telegramCode: body.error_code,
        description: this.safeDescription(body.description),
        retryAfterSeconds: body.parameters?.retry_after,
      },
      retry: {
        recommended:
          status === 'rate_limited' ||
          status === 'provider_unavailable',
        retryAfterSeconds: body.parameters?.retry_after,
      },
    };
  }

  private safeSendFailure(
    input: TelegramSendInput,
    messageType: string,
    status: string,
  ) {
    return {
      accepted: false,
      provider: 'telegram' as const,
      channelId: input.channelId,
      conversationId: input.conversationId,
      recipientId: input.recipientId,
      messageType,
      status,
      providerError: { code: status },
    };
  }

  private providerError(
    code: string,
    body?: TelegramApiResponse<unknown>,
  ): TelegramProviderError {
    return new TelegramProviderError(code, {
      telegramCode: body?.error_code,
      description: this.safeDescription(body?.description),
      retryAfterSeconds: body?.parameters?.retry_after,
    });
  }

  private mapErrorCode(
    httpStatus: number,
    body?: TelegramApiResponse<unknown>,
  ) {
    const description = String(body?.description || '').toLowerCase();
    if (httpStatus === 401 || description.includes('unauthorized')) {
      return 'invalid_credentials';
    }
    if (httpStatus === 404) return 'bot_not_found';
    if (httpStatus === 429 || body?.parameters?.retry_after) {
      return 'rate_limited';
    }
    if (description.includes('chat not found')) return 'chat_not_found';
    if (description.includes('blocked')) return 'bot_blocked';
    if (description.includes('message is too long')) return 'message_too_long';
    if (description.includes('bad webhook')) return 'webhook_invalid_url';
    if (httpStatus >= 500) return 'provider_unavailable';
    return 'unknown_provider_error';
  }

  private assertValidBotToken(botToken: string) {
    if (!/^\d{4,20}:[A-Za-z0-9_-]{20,}$/.test(botToken)) {
      throw this.providerError('invalid_credentials');
    }
  }

  private assertValidSecretToken(secretToken: string) {
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(secretToken)) {
      throw this.providerError('webhook_registration_failed');
    }
  }

  private assertHttpsUrl(url: string) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw this.providerError('webhook_invalid_url');
    }
  }

  private assertApiBaseUrlAllowed() {
    const parsed = new URL(this.apiBaseUrl);
    if (parsed.protocol !== 'https:') {
      throw new Error('Telegram API base URL must use HTTPS.');
    }
    if (
      this.nodeEnv === 'production' &&
      parsed.origin !== OFFICIAL_TELEGRAM_API_BASE_URL
    ) {
      throw new Error('Telegram API base URL cannot be overridden in production.');
    }
  }

  private getAttachmentUrl(attachments: Record<string, unknown>[] | undefined) {
    const attachment = attachments?.[0];
    return (
      this.stringValue(attachment?.url) || this.stringValue(attachment?.fileUrl)
    );
  }

  private safeDescription(description: unknown) {
    return typeof description === 'string' ? description.slice(0, 240) : undefined;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}

export class TelegramProviderError extends Error {
  constructor(
    readonly code: string,
    readonly safeDetails: {
      telegramCode?: number;
      description?: string;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(code);
  }
}
