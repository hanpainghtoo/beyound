/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- Legacy provider adapter consumes provider-shaped JSON; this task only adds scoped internal service auth headers. */
import {
  ChannelAdapter,
  ChannelAdapterValidationResult,
  ChannelAdapterSendInput,
  ChannelAdapterSendResult,
  NormalizedInboundMessage,
} from './channel-adapter.types';
import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  serviceAuthHeaders,
} from '@zayos/internal-service-auth';

export class ProviderChannelAdapter implements ChannelAdapter {
  constructor(
    readonly type: string,
    private readonly integrationServiceUrl = process.env
      .INTEGRATION_SERVICE_URL,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async validateConfig(
    configuration: Record<string, any>,
    credentials: Record<string, any> = {},
  ): Promise<ChannelAdapterValidationResult> {
    if (!this.integrationServiceUrl) {
      return {
        valid: false,
        errors: ['INTEGRATION_SERVICE_URL is not configured'],
      };
    }

    try {
      const response = await this.fetcher(
        `${this.integrationServiceUrl.replace(/\/$/, '')}/providers/${this.type}/validate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...serviceAuthHeaders({
              audience: SERVICE_IDENTITIES.INTEGRATION,
              subject: SERVICE_IDENTITIES.CORE,
              scopes: [SERVICE_SCOPES.PROVIDER_TEST],
            }),
          },
          body: JSON.stringify({ configuration, credentials }),
        },
      );
      const result = await this.safeJson(response);

      return {
        valid: response.ok && result?.ok === true,
        errors: response.ok
          ? result?.missingCredentials?.map(
              (field: string) =>
                `Missing required provider credential: ${field}`,
            ) || []
          : [`Integration service returned HTTP ${response.status}`],
        status: result?.status,
        verifiedIdentity: result?.verifiedIdentity,
        metadata: {
          provider: this.type,
          rateLimit: result?.rateLimit,
        },
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  async normalizeInbound(
    payload: Record<string, any>,
  ): Promise<NormalizedInboundMessage> {
    return {
      externalMessageId: payload.externalMessageId,
      externalConversationId: payload.externalConversationId,
      senderId: payload.senderId,
      content: payload.content,
      messageType: payload.messageType || 'text',
      attachments: payload.attachments || [],
      metadata: payload.metadata || payload,
    };
  }

  async sendMessage(
    input: ChannelAdapterSendInput,
  ): Promise<ChannelAdapterSendResult> {
    if (!this.integrationServiceUrl) {
      return {
        status: 'failed',
        metadata: {
          provider: this.type,
          error: 'INTEGRATION_SERVICE_URL is not configured',
        },
      };
    }

    try {
      const response = await this.fetcher(
        `${this.integrationServiceUrl.replace(/\/$/, '')}/providers/${this.type}/send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...serviceAuthHeaders({
              audience: SERVICE_IDENTITIES.INTEGRATION,
              subject: SERVICE_IDENTITIES.CORE,
              scopes: [SERVICE_SCOPES.PROVIDER_SEND],
            }),
          },
          body: JSON.stringify(input),
        },
      );
      const result = await this.safeJson(response);

      return {
        externalMessageId: result?.externalMessageId,
        status: response.ok && result?.accepted === true ? 'sent' : 'failed',
        metadata: {
          provider: this.type,
          providerStatus: result?.status,
          delivery: result?.delivery,
          providerError: result?.providerError,
          supportedMessageTypes: result?.supportedMessageTypes,
          nextStep: result?.nextStep,
          error: result?.error,
          retry: result?.retry,
          reportedToCore: result?.reportedToCore,
        },
      };
    } catch (error) {
      return {
        status: 'delivery_unknown',
        metadata: {
          provider: this.type,
          error: error instanceof Error ? error.message : String(error),
          retry: { recommended: true },
          ambiguous: true,
        },
      };
    }
  }

  private async safeJson(response: Response) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
}
