import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  serviceAuthHeaders,
} from '@zayos/internal-service-auth';
import { TelegramClient, TelegramProviderError } from './telegram.client';
import { MessengerClient } from './messenger.client';
import { ViberClient } from './viber.client';

type ProviderName = 'telegram' | 'messenger' | 'tiktok' | 'viber';

type SendMessageInput = {
  channelId: string;
  conversationId?: string;
  recipientId?: string;
  content: string;
  messageType?: 'text' | 'image' | 'file';
  attachments?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
};

type ProviderCredentialInput = {
  credentials?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
};

type ProviderDefinition = {
  provider: ProviderName;
  displayName: string;
  status: 'implemented' | 'contract-ready' | 'requires-provider-access';
  outboundMessageTypes: Array<'text' | 'image' | 'file'>;
  requiredCredentials: string[];
  optionalCredentials: string[];
  webhookEvents: string[];
  rateLimit: {
    policy: string;
    retryAfterHeader?: string;
  };
};

const providerDefinitions: Record<ProviderName, ProviderDefinition> = {
  telegram: {
    provider: 'telegram',
    displayName: 'Telegram',
    status: 'implemented',
    outboundMessageTypes: ['text'],
    requiredCredentials: ['botToken'],
    optionalCredentials: ['botUsername'],
    webhookEvents: ['message'],
    rateLimit: {
      policy:
        'per-bot and per-chat limits; respect retry_after values from Telegram errors',
      retryAfterHeader: 'retry_after',
    },
  },
  messenger: {
    provider: 'messenger',
    displayName: 'Facebook Messenger',
    status: 'implemented',
    outboundMessageTypes: ['text', 'image', 'file'],
    requiredCredentials: [
      'pageId',
      'pageAccessToken',
      'appSecret',
      'verifyToken',
    ],
    optionalCredentials: [],
    webhookEvents: [
      'messages',
      'messaging_postbacks',
      'message_deliveries',
      'message_reads',
    ],
    rateLimit: {
      policy:
        'page-scoped Graph API limits; retry on transient Graph API errors',
      retryAfterHeader: 'x-app-usage',
    },
  },
  tiktok: {
    provider: 'tiktok',
    displayName: 'TikTok',
    status: 'requires-provider-access',
    outboundMessageTypes: [],
    requiredCredentials: ['clientKey', 'clientSecret'],
    optionalCredentials: ['accessToken', 'openId', 'advertiserId'],
    webhookEvents: ['lead', 'comment'],
    rateLimit: {
      policy:
        'app, advertiser, and product-surface limits depend on approved TikTok Business/API access',
    },
  },
  viber: {
    provider: 'viber',
    displayName: 'Viber',
    status: 'implemented',
    outboundMessageTypes: ['text', 'image', 'file'],
    requiredCredentials: ['authToken'],
    optionalCredentials: ['botName', 'botAvatar'],
    webhookEvents: ['message', 'delivered', 'seen', 'failed'],
    rateLimit: {
      policy: 'bot-account scoped provider limits',
    },
  },
};

@Injectable()
export class AppService {
  private readonly telegramClient = new TelegramClient();
  private readonly messengerClient = new MessengerClient();
  private readonly viberClient = new ViberClient();

  getHealth() {
    return {
      service: 'integration-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  getReadiness() {
    const dependencies = {
      coreApi: Boolean(process.env.CORE_API_URL),
    };
    return {
      service: 'integration-service',
      ready: Object.values(dependencies).every(Boolean),
      timestamp: new Date().toISOString(),
    };
  }

  getMetrics() {
    const memory = process.memoryUsage();
    return {
      service: 'integration-service',
      uptimeSeconds: process.uptime(),
      memoryBytes: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
      },
      providers: Object.keys(providerDefinitions).length,
      implementedProviders: Object.values(providerDefinitions).filter((provider) => provider.status === 'implemented').length,
      timestamp: new Date().toISOString(),
    };
  }

  getProviders() {
    return Object.values(providerDefinitions);
  }

  getProvider(provider: string) {
    return providerDefinitions[this.normalizeProvider(provider)];
  }

  async validateProvider(provider: string, input: ProviderCredentialInput) {
    const definition = this.getProvider(provider);
    const credentials = input.credentials || {};
    const missingCredentials = definition.requiredCredentials.filter(
      (key) => !this.hasValue(credentials[key]),
    );

    if (definition.provider === 'telegram' && missingCredentials.length === 0) {
      try {
        const identity = await this.telegramClient.getMe(
          this.stringValue(credentials.botToken) || '',
        );
        return {
          provider: definition.provider,
          ok: true,
          status: 'credentials_verified',
          missingCredentials: [],
          requiredCredentials: definition.requiredCredentials,
          optionalCredentials: definition.optionalCredentials,
          rateLimit: definition.rateLimit,
          verifiedIdentity: identity,
        };
      } catch (error) {
        return {
          provider: definition.provider,
          ok: false,
          status:
            error instanceof TelegramProviderError
              ? error.code
              : 'provider_unavailable',
          missingCredentials: [],
          requiredCredentials: definition.requiredCredentials,
          optionalCredentials: definition.optionalCredentials,
          errors: [
            error instanceof TelegramProviderError
              ? error.code
              : 'provider_unavailable',
          ],
        };
      }
    }

    return {
      provider: definition.provider,
      ok: missingCredentials.length === 0,
      status:
        missingCredentials.length === 0
          ? 'ready'
          : 'missing_required_credentials',
      missingCredentials,
      requiredCredentials: definition.requiredCredentials,
      optionalCredentials: definition.optionalCredentials,
      rateLimit: definition.rateLimit,
    };
  }

  async registerWebhook(provider: string, input: ProviderCredentialInput & {
    webhookUrl?: string;
    secretToken?: string;
    allowedUpdates?: string[];
    maxConnections?: number;
    dropPendingUpdates?: boolean;
  }) {
    const definition = this.getProvider(provider);
    if (definition.provider !== 'telegram') {
      throw new BadRequestException(`Webhook registration is not implemented for ${definition.provider}`);
    }
    const token = this.stringValue(input.credentials?.botToken);
    if (!token || !input.webhookUrl || !input.secretToken) {
      throw new BadRequestException('Telegram webhook registration requires botToken, webhookUrl and secretToken.');
    }

    try {
      const setWebhook = await this.telegramClient.setWebhook(token, {
        url: input.webhookUrl,
        secretToken: input.secretToken,
        allowedUpdates: input.allowedUpdates,
        maxConnections: input.maxConnections,
        dropPendingUpdates: input.dropPendingUpdates,
      });
      const webhookInfo = await this.telegramClient.getWebhookInfo(token);
      const urlMatches = webhookInfo.url === input.webhookUrl;
      return {
        provider: 'telegram',
        ok: urlMatches,
        status: urlMatches ? 'webhook_registered' : 'webhook_mismatch',
        setWebhook,
        webhookInfo,
      };
    } catch (error) {
      return this.safeTelegramOperationFailure('telegram', error);
    }
  }

  async getWebhookInfo(provider: string, input: ProviderCredentialInput) {
    const definition = this.getProvider(provider);
    if (definition.provider !== 'telegram') {
      throw new BadRequestException(`Webhook info is not implemented for ${definition.provider}`);
    }
    const token = this.stringValue(input.credentials?.botToken);
    if (!token) throw new BadRequestException('Telegram botToken is required.');
    try {
      return {
        provider: 'telegram',
        ok: true,
        status: 'webhook_info',
        webhookInfo: await this.telegramClient.getWebhookInfo(token),
      };
    } catch (error) {
      return this.safeTelegramOperationFailure('telegram', error);
    }
  }

  async deleteWebhook(provider: string, input: ProviderCredentialInput & { dropPendingUpdates?: boolean }) {
    const definition = this.getProvider(provider);
    if (definition.provider !== 'telegram') {
      throw new BadRequestException(`Webhook deletion is not implemented for ${definition.provider}`);
    }
    const token = this.stringValue(input.credentials?.botToken);
    if (!token) throw new BadRequestException('Telegram botToken is required.');
    try {
      return {
        provider: 'telegram',
        ok: true,
        status: 'webhook_deleted',
        result: await this.telegramClient.deleteWebhook(token, {
          dropPendingUpdates: input.dropPendingUpdates,
        }),
      };
    } catch (error) {
      return this.safeTelegramOperationFailure('telegram', error);
    }
  }

  async send(provider: string, input: SendMessageInput, correlationId?: string) {
    const definition = this.getProvider(provider);
    const messageType = input.messageType || 'text';

    if (!definition.outboundMessageTypes.includes(messageType)) {
      return {
        accepted: false,
        provider: definition.provider,
        channelId: input.channelId,
        status: 'unsupported_message_type',
        supportedMessageTypes: definition.outboundMessageTypes,
        nextStep:
          definition.provider === 'tiktok'
            ? 'TikTok outbound messaging is not exposed by the currently confirmed public API surface. Use approved lead/comment capture or add a tenant-specific partner API client after access is granted.'
            : undefined,
      };
    }

    if (definition.provider === 'telegram') {
      const result = await this.telegramClient.send(input);
      return this.reportProviderStatus(input, result, correlationId);
    }

    if (definition.provider === 'messenger') {
      const result = await this.messengerClient.send(input);
      return this.reportProviderStatus(input, result, correlationId);
    }

    if (definition.provider === 'viber') {
      const result = await this.viberClient.send(input);
      return this.reportProviderStatus(input, result, correlationId);
    }

    return {
      accepted: true,
      provider: definition.provider,
      channelId: input.channelId,
      conversationId: input.conversationId,
      recipientId: input.recipientId,
      messageType,
      externalMessageId: `${definition.provider}-${input.channelId}-${Date.now()}`,
      status: 'queued',
      delivery: {
        state: 'pending_provider_send',
        callbacksExpected: definition.webhookEvents,
      },
      retry: {
        strategy: 'provider-aware-exponential-backoff',
        rateLimit: definition.rateLimit,
      },
      nextStep:
        'Replace contract response with provider client call and retry policy.',
    };
  }

  private normalizeProvider(provider: string): ProviderName {
    const normalized = provider === 'facebook' ? 'messenger' : provider;

    if (normalized in providerDefinitions) {
      return normalized as ProviderName;
    }

    throw new BadRequestException(`Unsupported provider: ${provider}`);
  }

  private hasValue(value: unknown) {
    return typeof value === 'string'
      ? value.trim().length > 0
      : value !== undefined && value !== null;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private safeTelegramOperationFailure(provider: string, error: unknown) {
    return {
      provider,
      ok: false,
      status:
        error instanceof TelegramProviderError
          ? error.code
          : 'provider_unavailable',
      providerError:
        error instanceof TelegramProviderError
          ? {
              code: error.code,
              telegramCode: error.safeDetails.telegramCode,
              description: error.safeDetails.description,
              retryAfterSeconds: error.safeDetails.retryAfterSeconds,
            }
          : { code: 'provider_unavailable' },
    };
  }

  private async reportProviderStatus(input: SendMessageInput, result: any, correlationId?: string) {
    const messageId =
      typeof input.metadata?.internalMessageId === 'string'
        ? input.metadata.internalMessageId
        : undefined;
    const coreApiUrl = process.env.CORE_API_URL;

    if (!messageId || !coreApiUrl) {
      return {
        ...result,
        reportedToCore: false,
      };
    }

    const endpoint = `${coreApiUrl.replace(/\/$/, '')}/internal/provider-events/message-status`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...serviceAuthHeaders({
        audience: SERVICE_IDENTITIES.CORE,
        subject: SERVICE_IDENTITIES.INTEGRATION,
        scopes: [SERVICE_SCOPES.PROVIDER_SEND],
        correlationId,
      }),
    };
    if (correlationId) {
      headers['x-correlation-id'] = correlationId;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messageId,
          externalMessageId: result.externalMessageId,
          channelId: input.channelId,
          externalConversationId: input.recipientId,
          provider: result.provider,
          status: result.accepted === true ? 'sent' : 'failed',
          providerStatus: result.status,
          providerError: result.providerError,
          retry: result.retry,
        }),
      });

      return {
        ...result,
        reportedToCore: response.ok,
        statusCallback: response.ok
          ? undefined
          : { error: `Core API returned HTTP ${response.status}` },
      };
    } catch (error) {
      return {
        ...result,
        reportedToCore: false,
        statusCallback: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
