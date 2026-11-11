export type TelegramSendInput = {
  channelId: string;
  conversationId?: string;
  recipientId?: string;
  content: string;
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'file';
  attachments?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
};

export type TelegramCommand = {
  command: string;
  description: string;
};

export type TelegramHelperResult = {
  accepted: boolean;
  status: 'ok' | 'forbidden' | 'rate_limited' | 'error';
  retry: { recommended: boolean; retryAfterSeconds?: number };
  identity?: { status: 'reachable' | 'unreachable'; reason?: string };
  error?: { code: string; telegramCode?: number; description?: string };
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

/**
 * Raw `getWebhookInfo` result. Telegram answers in snake_case; `TelegramWebhookInfo`
 * above is our camelCase normalisation of it. These must stay separate — reading
 * camelCase keys off the raw payload silently yields `undefined` for every field
 * (which is why the health panel could not tell whether button taps were
 * subscribed). Mirrors the same split in the core service's bot API client.
 */
type TelegramWebhookInfoResult = {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
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

/**
 * Telegram bot upload ceilings: 10 MB for photos, 50 MB for documents.
 *
 * Rejecting locally turns a provider rejection into a named, actionable
 * validation error. Sent blind, an oversized file becomes a provider error
 * with no retry path — and the same file would fail identically every time,
 * so the UI must not offer a retry button for it.
 */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

export class TelegramClient {
  constructor(
    private readonly apiBaseUrl = process.env.TELEGRAM_API_BASE_URL ||
      OFFICIAL_TELEGRAM_API_BASE_URL,
    private readonly fetcher?: typeof fetch,
    private readonly timeoutMs = Number(
      process.env.TELEGRAM_API_TIMEOUT_MS || 8000,
    ),
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
      : ['message', 'callback_query'];
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

  async setMyCommands(
    botToken: string,
    commands: TelegramCommand[],
    languageCode?: string,
  ) {
    this.assertValidBotToken(botToken);
    try {
      const body = await this.call<boolean>(botToken, 'setMyCommands', {
        commands,
        ...(languageCode ? { language_code: languageCode } : {}),
      });
      if (body.ok !== true || body.result !== true)
        throw this.providerError('command_registration_failed', body);
      return this.helperSuccess();
    } catch (error) {
      return this.helperFailure(error);
    }
  }

  async answerCallbackQuery(
    botToken: string,
    callbackQueryId: string,
    options: { text?: string; showAlert?: boolean; cacheTime?: number } = {},
  ) {
    this.assertValidBotToken(botToken);
    try {
      const body = await this.call<boolean>(botToken, 'answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        ...(options.text ? { text: options.text } : {}),
        ...(options.showAlert !== undefined
          ? { show_alert: options.showAlert }
          : {}),
        ...(options.cacheTime !== undefined
          ? { cache_time: options.cacheTime }
          : {}),
      });
      if (body.ok !== true || body.result !== true)
        throw this.providerError('callback_answer_failed', body);
      return this.helperSuccess();
    } catch (error) {
      return this.helperFailure(error);
    }
  }

  async editMessageText(
    botToken: string,
    input: {
      chatId: string;
      messageId: number;
      text: string;
      replyMarkup?: Record<string, unknown>;
    },
  ) {
    return this.callEdit(botToken, 'editMessageText', {
      chat_id: input.chatId,
      message_id: input.messageId,
      text: input.text,
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    });
  }

  async editMessageCaption(
    botToken: string,
    input: {
      chatId: string;
      messageId: number;
      caption: string;
      replyMarkup?: Record<string, unknown>;
    },
  ) {
    return this.callEdit(botToken, 'editMessageCaption', {
      chat_id: input.chatId,
      message_id: input.messageId,
      caption: input.caption,
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    });
  }

  async editMessageReplyMarkup(
    botToken: string,
    input: {
      chatId: string;
      messageId: number;
      replyMarkup?: Record<string, unknown>;
    },
  ) {
    return this.callEdit(botToken, 'editMessageReplyMarkup', {
      chat_id: input.chatId,
      message_id: input.messageId,
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    });
  }

  async sendPhoto(input: Omit<TelegramSendInput, 'messageType'>) {
    return this.send({ ...input, messageType: 'image' });
  }

  async sendDocument(input: Omit<TelegramSendInput, 'messageType'>) {
    return this.send({ ...input, messageType: 'file' });
  }

  private async callEdit(
    botToken: string,
    method: string,
    payload: Record<string, unknown>,
  ) {
    try {
      this.assertValidBotToken(botToken);
      const body = await this.call<boolean>(botToken, method, payload);
      if (body.ok !== true || body.result !== true)
        throw this.providerError('message_edit_failed', body);
      return this.helperSuccess();
    } catch (error) {
      return this.helperFailure(error);
    }
  }

  private helperSuccess(): TelegramHelperResult {
    return {
      accepted: true,
      status: 'ok',
      retry: { recommended: false },
      identity: { status: 'reachable' },
    };
  }

  private helperFailure(error: unknown): TelegramHelperResult {
    if (error instanceof TelegramProviderError) {
      const forbidden =
        error.code === 'bot_blocked' ||
        error.code === 'user_deactivated' ||
        error.code === 'chat_not_found' ||
        error.code === 'invalid_credentials';
      const rateLimited = error.code === 'rate_limited';
      return {
        accepted: false,
        status: forbidden
          ? 'forbidden'
          : rateLimited
            ? 'rate_limited'
            : 'error',
        retry: {
          recommended: rateLimited,
          retryAfterSeconds: error.safeDetails.retryAfterSeconds,
        },
        ...(forbidden
          ? { identity: { status: 'unreachable' as const, reason: error.code } }
          : {}),
        error: {
          code: error.code,
          telegramCode: error.safeDetails.telegramCode,
          description: error.safeDetails.description,
        },
      };
    }
    return {
      accepted: false,
      status: 'error',
      retry: { recommended: false },
      error: { code: 'provider_unavailable' },
    };
  }

  async getWebhookInfo(botToken: string) {
    this.assertValidBotToken(botToken);
    const body = await this.call<TelegramWebhookInfoResult>(
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
      hasCustomCertificate: result.has_custom_certificate,
      pendingUpdateCount: Number(result.pending_update_count || 0),
      lastErrorDate: result.last_error_date,
      lastErrorMessage: this.safeDescription(result.last_error_message),
      maxConnections: result.max_connections,
      allowedUpdates: Array.isArray(result.allowed_updates)
        ? result.allowed_updates.filter((item) => typeof item === 'string')
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
    return {
      deleted: true,
      dropPendingUpdates: options.dropPendingUpdates === true,
    };
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
      messageType === 'text'
        ? undefined
        : this.getAttachmentUrl(input.attachments);
    const hasInlineBytes = input.attachments?.some(
      (a) => typeof a?.bytesBase64 === 'string' && a.bytesBase64.length > 0,
    );
    if (messageType !== 'text' && !attachmentUrl && !hasInlineBytes) {
      validationErrors.push(
        `attachments[0].url or inline bytesBase64 is required for ${messageType} messages`,
      );
    }

    if (messageType !== 'text') {
      validationErrors.push(...this.attachmentSizeErrors(input, messageType));
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
        retry: { recommended: false },
      };
    }

    try {
      this.assertValidBotToken(botToken);
    } catch {
      return this.safeSendFailure(input, messageType, 'invalid_credentials');
    }

    // Every non-text type except image rides sendDocument. Listing only 'file'
    // sent video/audio to sendMessage, which accepts no attachment and dropped it
    // silently — the customer received nothing while the send reported success.
    // Native sendVideo/sendAudio are the follow-up once playback is wanted.
    const method =
      messageType === 'image'
        ? 'sendPhoto'
        : messageType === 'text'
          ? 'sendMessage'
          : 'sendDocument';
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
      const inline = this.getAttachmentBytes(input.attachments);
      if (inline) {
        const body = await this.callMultipart<TelegramMessageResult>(
          botToken,
          method,
          {
            chat_id: recipientId,
            ...(input.content?.trim() ? { caption: input.content.trim() } : {}),
          },
          inline,
          messageType === 'image' ? 'photo' : 'document',
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
            providerChatId: body.result.chat?.id
              ? String(body.result.chat.id)
              : recipientId,
            providerMessageId: body.result.message_id
              ? String(body.result.message_id)
              : undefined,
            sentAt: body.result.date
              ? new Date(body.result.date * 1000).toISOString()
              : undefined,
            callbacksExpected: ['message'],
          },
        };
      }
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
          providerChatId: body.result.chat?.id
            ? String(body.result.chat.id)
            : recipientId,
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
      const providerStatus =
        error instanceof TelegramProviderError
          ? error.code
          : 'delivery_unknown';
      const status = this.isForbiddenUserStatus(providerStatus)
        ? 'forbidden'
        : providerStatus;
      return {
        accepted: false,
        provider: 'telegram' as const,
        channelId: input.channelId,
        conversationId: input.conversationId,
        recipientId: input.recipientId,
        messageType,
        status,
        providerError: {
          code: providerStatus,
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
        throw this.providerError(
          this.mapErrorCode(response.status, body),
          body,
        );
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
    const forbidden =
      status === 'bot_blocked' ||
      status === 'user_deactivated' ||
      status === 'chat_not_found' ||
      status === 'invalid_credentials';
    return {
      accepted: false,
      provider: 'telegram' as const,
      channelId: input.channelId,
      conversationId: input.conversationId,
      recipientId: input.recipientId,
      messageType,
      status: forbidden ? 'forbidden' : status,
      providerError: {
        code: status,
        telegramCode: body.error_code,
        description: this.safeDescription(body.description),
        retryAfterSeconds: body.parameters?.retry_after,
      },
      retry: {
        recommended:
          status === 'rate_limited' || status === 'provider_unavailable',
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
    if (description.includes('user is deactivated')) return 'user_deactivated';
    if (description.includes('message is too long')) return 'message_too_long';
    if (description.includes('bad webhook')) return 'webhook_invalid_url';
    if (httpStatus >= 500) return 'provider_unavailable';
    return 'unknown_provider_error';
  }

  private isForbiddenUserStatus(status: string) {
    return [
      'bot_blocked',
      'user_deactivated',
      'chat_not_found',
      'invalid_credentials',
    ].includes(status);
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
      throw new Error(
        'Telegram API base URL cannot be overridden in production.',
      );
    }
  }

  private getAttachmentUrl(attachments: Record<string, unknown>[] | undefined) {
    const attachment = attachments?.[0];
    return (
      this.stringValue(attachment?.url) || this.stringValue(attachment?.fileUrl)
    );
  }

  /**
   * Pre-flight size check on inline bytes.
   *
   * Only inline bytes are checked: a remote URL is not fetched here, so its
   * size is unknown and the provider is left to judge it. Uses the declared
   * `sizeBytes` when core supplied it and falls back to the base64 length,
   * which over-estimates by the 4/3 encoding inflation — acceptable, since
   * that direction errs toward a rejection an agent can act on.
   */
  private attachmentSizeErrors(
    input: TelegramSendInput,
    messageType: string,
  ): string[] {
    const limit =
      messageType === 'image' ? MAX_PHOTO_BYTES : MAX_DOCUMENT_BYTES;
    const limitMb = Math.round(limit / (1024 * 1024));
    const errors: string[] = [];

    for (const [index, attachment] of (input.attachments || []).entries()) {
      const encoded =
        typeof attachment?.bytesBase64 === 'string'
          ? attachment.bytesBase64
          : undefined;
      if (!encoded) continue;

      const declared = Number(attachment?.sizeBytes);
      const bytes =
        Number.isFinite(declared) && declared > 0
          ? declared
          : Math.floor((encoded.length * 3) / 4);
      if (bytes > limit) {
        errors.push(
          `attachments[${index}] is ${this.formatBytes(bytes)} which exceeds the Telegram ${messageType === 'image' ? 'photo' : 'document'} limit of ${limitMb} MB; compress the file or send it as a document`,
        );
      }
    }

    return errors;
  }

  private formatBytes(bytes: number) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
  }

  /**
   * Bytes attached by core for file-storage refs. Telegram cannot fetch our
   * signed URLs (localhost-bound) and our fileIds are not Telegram file_ids,
   * so core ships the bytes (base64) and we POST multipart. Returns null when
   * the attachment carries no inline bytes — the caller falls back to URL.
   */
  private getAttachmentBytes(
    attachments: Record<string, unknown>[] | undefined,
  ): {
    bytes: Buffer;
    fileName: string;
    contentType: string;
  } | null {
    const attachment = attachments?.[0];
    const encoded =
      typeof attachment?.bytesBase64 === 'string'
        ? attachment.bytesBase64
        : null;
    if (!encoded) return null;
    const fileName =
      typeof attachment?.fileName === 'string' && attachment.fileName
        ? attachment.fileName
        : 'attachment';
    const contentType =
      typeof attachment?.contentType === 'string' && attachment.contentType
        ? attachment.contentType
        : 'application/octet-stream';
    try {
      return { bytes: Buffer.from(encoded, 'base64'), fileName, contentType };
    } catch {
      return null;
    }
  }

  private async callMultipart<T>(
    botToken: string,
    method: string,
    fields: Record<string, string>,
    file: { bytes: Buffer; fileName: string; contentType: string },
    fileField: string,
  ): Promise<TelegramApiResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        form.append(key, value);
      }
      form.append(
        fileField,
        // Buffer is not a BlobPart under the DOM lib (ArrayBufferLike may be
        // SharedArrayBuffer), so copy into a plain Uint8Array first.
        new Blob([new Uint8Array(file.bytes)], { type: file.contentType }),
        file.fileName,
      );
      const response = await (this.fetcher || fetch)(
        `${this.apiBaseUrl.replace(/\/$/, '')}/bot${encodeURIComponent(botToken)}/${method}`,
        { method: 'POST', body: form, signal: controller.signal },
      );
      const bodyText = await response.text();
      const body = JSON.parse(
        bodyText.slice(0, MAX_RESPONSE_BYTES) || '{}',
      ) as TelegramApiResponse<T>;
      if (!response.ok || body.ok === false) {
        throw this.providerError(
          this.mapErrorCode(response.status, body),
          body,
        );
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

  private safeDescription(description: unknown) {
    return typeof description === 'string'
      ? description.slice(0, 240)
      : undefined;
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
