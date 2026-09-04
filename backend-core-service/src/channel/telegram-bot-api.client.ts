type TelegramApiResponse<T> = {
  ok?: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: {
    retry_after?: number;
  };
};

type TelegramUserResult = {
  id?: number | string;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
  can_manage_bots?: boolean;
};

type TelegramWebhookInfoResult = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
};

const OFFICIAL_TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const MAX_RESPONSE_BYTES = 64 * 1024;

export class TelegramBotApiError extends Error {
  constructor(
    readonly code: string,
    readonly safeDetails: {
      telegramCode?: number;
      description?: string;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(code);
    this.name = 'TelegramBotApiError';
  }
}

export class TelegramBotApiClient {
  constructor(
    private readonly apiBaseUrl = process.env.TELEGRAM_API_BASE_URL ||
      OFFICIAL_TELEGRAM_API_BASE_URL,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = Number(
      process.env.TELEGRAM_API_TIMEOUT_MS || 8000,
    ),
  ) {
    if (
      process.env.NODE_ENV === 'production' &&
      !this.apiBaseUrl.startsWith(OFFICIAL_TELEGRAM_API_BASE_URL)
    ) {
      throw new Error(
        'TELEGRAM_API_BASE_URL override is not allowed in production.',
      );
    }
  }

  async getMe(botToken: string) {
    const body = await this.call<TelegramUserResult>(botToken, 'getMe', {});
    const result = body.result;
    if (
      !body.ok ||
      !result ||
      result.is_bot !== true ||
      result.id === undefined
    ) {
      throw new TelegramBotApiError('unexpected_provider_response');
    }

    return {
      botId: String(result.id),
      username: this.stringValue(result.username),
      firstName: this.stringValue(result.first_name),
      canJoinGroups: result.can_join_groups,
      canReadAllGroupMessages: result.can_read_all_group_messages,
      supportsInlineQueries: result.supports_inline_queries,
      canManageBots: result.can_manage_bots,
    };
  }

  async getManagedBotToken(managerBotToken: string, botId: string) {
    const body = await this.call<string>(
      managerBotToken,
      'getManagedBotToken',
      {
        user_id: Number.isFinite(Number(botId)) ? Number(botId) : botId,
      },
    );
    if (!body.ok || typeof body.result !== 'string' || !body.result.trim()) {
      throw new TelegramBotApiError('managed_bot_token_missing');
    }
    return body.result.trim();
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
    this.assertHttpsUrl(input.url);
    const body = await this.call<boolean>(botToken, 'setWebhook', {
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: input.allowedUpdates?.length
        ? input.allowedUpdates
        : ['message'],
      max_connections: this.safeMaxConnections(input.maxConnections),
      drop_pending_updates: input.dropPendingUpdates === true,
    });
    if (body.ok !== true || body.result !== true) {
      throw new TelegramBotApiError('webhook_registration_failed');
    }
    return { ok: true };
  }

  async deleteWebhook(
    botToken: string,
    options: { dropPendingUpdates?: boolean } = {},
  ) {
    const body = await this.call<boolean>(botToken, 'deleteWebhook', {
      drop_pending_updates: options.dropPendingUpdates === true,
    });
    if (body.ok !== true || body.result !== true) {
      throw new TelegramBotApiError('webhook_delete_failed');
    }
    return { ok: true };
  }

  async getWebhookInfo(botToken: string) {
    const body = await this.call<TelegramWebhookInfoResult>(
      botToken,
      'getWebhookInfo',
      {},
    );
    const result = body.result;
    if (!body.ok || !result) {
      throw new TelegramBotApiError('unexpected_provider_response');
    }
    return {
      url: this.stringValue(result.url) || '',
      pendingUpdateCount: Number(result.pending_update_count || 0),
      lastErrorDate: result.last_error_date,
      lastErrorMessage: this.safeDescription(result.last_error_message),
      maxConnections: result.max_connections,
      allowedUpdates: result.allowed_updates,
    };
  }

  async sendManagerText(
    text: string,
    options: {
      chatId: string;
      replyMarkup?: Record<string, unknown>;
    },
  ) {
    const managerToken = process.env.TELEGRAM_MANAGER_BOT_TOKEN;
    if (!managerToken) {
      throw new TelegramBotApiError('telegram_manager_bot_token_missing');
    }
    const body = await this.call<Record<string, unknown>>(
      managerToken,
      'sendMessage',
      {
        chat_id: Number.isFinite(Number(options.chatId))
          ? Number(options.chatId)
          : options.chatId,
        text,
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      },
    );
    if (!body.ok) {
      throw new TelegramBotApiError('telegram_manager_message_failed');
    }
  }

  private async call<T>(
    botToken: string,
    method: string,
    payload: Record<string, unknown>,
  ): Promise<TelegramApiResponse<T>> {
    if (
      typeof botToken !== 'string' ||
      !/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken)
    ) {
      throw new TelegramBotApiError('invalid_bot_token');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(
        `${this.apiBaseUrl.replace(/\/$/, '')}/bot${encodeURIComponent(botToken)}/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );
      const text = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
      const body = JSON.parse(text || '{}') as TelegramApiResponse<T>;
      if (!response.ok || body.ok === false) {
        throw new TelegramBotApiError(
          this.mapErrorCode(response.status, body),
          {
            telegramCode: body.error_code,
            description: this.safeDescription(body.description),
            retryAfterSeconds: body.parameters?.retry_after,
          },
        );
      }
      return body;
    } catch (error) {
      if (error instanceof TelegramBotApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TelegramBotApiError('network_timeout');
      }
      if (error instanceof SyntaxError) {
        throw new TelegramBotApiError('unexpected_provider_response');
      }
      throw new TelegramBotApiError('provider_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private safeMaxConnections(value?: number) {
    if (typeof value !== 'number') return 40;
    return Math.min(Math.max(Math.trunc(value), 1), 100);
  }

  private mapErrorCode(status: number, body: TelegramApiResponse<unknown>) {
    if (body.parameters?.retry_after) return 'rate_limited';
    if (status === 401 || status === 403) return 'invalid_credentials';
    if (status === 404) return 'provider_method_unavailable';
    if (status >= 500) return 'provider_unavailable';
    return 'provider_rejected_request';
  }

  private assertHttpsUrl(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') throw new Error('not https');
    } catch {
      throw new TelegramBotApiError('invalid_webhook_url');
    }
  }

  private safeDescription(value: unknown) {
    return typeof value === 'string'
      ? value.replace(/\d+:[A-Za-z0-9_-]{20,}/g, '[redacted]').slice(0, 300)
      : undefined;
  }

  private stringValue(value: unknown) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
    return undefined;
  }
}
