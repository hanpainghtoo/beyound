import { Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(ProviderChannelAdapter.name);

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

      // A non-OK response here is almost always an infrastructure rejection
      // (body parser limits, auth, timeout) rather than a provider verdict: the
      // integration service never reached its provider client. Its Nest error
      // body carries none of the send-result fields, so reading only those
      // stored an empty metadata object and the UI fell back to a generic
      // "Provider delivery failed." with no retry offered. Surface the actual
      // text instead, and mark it retryable because re-sending is exactly what
      // clears a transient transport rejection.
      if (!response.ok) {
        const detail =
          this.stringValue(result?.message) ??
          this.stringValue(result?.error) ??
          (Array.isArray(result?.message)
            ? result.message
                .filter((item) => typeof item === 'string')
                .join('; ')
            : undefined) ??
          this.stringValue(result?.errorType);
        this.logger.warn(
          `Integration service rejected ${this.type} send: HTTP ${response.status}${detail ? ` — ${detail}` : ''} (message ${input.metadata?.internalMessageId ?? 'unknown'}, command ${input.metadata?.outboundCommandId ?? 'unknown'})`,
        );
        return {
          status: 'failed',
          metadata: {
            provider: this.type,
            providerStatus: 'integration_rejected',
            error:
              detail ??
              `Integration service returned HTTP ${response.status} without a detail message`,
            retry: { recommended: true },
          },
        };
      }

      return {
        externalMessageId: result?.externalMessageId,
        status: result?.accepted === true ? 'sent' : 'failed',
        metadata: {
          provider: this.type,
          providerStatus: result?.status,
          delivery: result?.delivery,
          providerError: result?.providerError,
          supportedMessageTypes: result?.supportedMessageTypes,
          nextStep: result?.nextStep,
          // Validation rejections report a plural `errors` array; surface the
          // first entry so the bubble can name the offending field rather than
          // rendering a bare fallback string.
          error:
            result?.error ??
            (Array.isArray(result?.errors) && result.errors.length > 0
              ? result.errors
                  .filter((item) => typeof item === 'string')
                  .join('; ')
              : undefined),
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

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private async safeJson(response: Response) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
}
