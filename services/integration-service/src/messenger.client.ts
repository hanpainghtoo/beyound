export type MessengerSendInput = {
  channelId: string;
  conversationId?: string;
  recipientId?: string;
  content: string;
  messageType?: 'text' | 'image' | 'file';
  attachments?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
};

type MessengerApiResponse = {
  recipient_id?: string;
  message_id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    is_transient?: boolean;
    error_user_title?: string;
    error_user_msg?: string;
  };
};

export class MessengerClient {
  constructor(
    private readonly graphApiBaseUrl = process.env
      .MESSENGER_GRAPH_API_BASE_URL || 'https://graph.facebook.com',
    private readonly graphApiVersion =
      process.env.META_GRAPH_API_VERSION ||
      process.env.MESSENGER_GRAPH_API_VERSION ||
      'v25.0',
    private readonly fetcher?: typeof fetch,
  ) {
    this.assertValidGraphApiConfig();
  }

  async send(input: MessengerSendInput) {
    const pageId = this.stringValue(input.credentials?.pageId);
    const pageAccessToken = this.stringValue(
      input.credentials?.pageAccessToken,
    );
    const recipientId = this.stringValue(input.recipientId);
    const messageType = input.messageType || 'text';
    const validationErrors = [
      ...(!pageId ? ['credentials.pageId is required'] : []),
      ...(!pageAccessToken ? ['credentials.pageAccessToken is required'] : []),
      ...(!recipientId ? ['recipientId is required'] : []),
      ...(messageType === 'text' && !input.content?.trim()
        ? ['content is required for text messages']
        : []),
    ];
    const attachmentUrl =
      messageType === 'text'
        ? undefined
        : this.getAttachmentUrl(input.attachments);

    if (messageType !== 'text' && !attachmentUrl) {
      validationErrors.push(
        `attachments[0].url is required for ${messageType} messages`,
      );
    }

    if (validationErrors.length > 0) {
      return {
        accepted: false,
        provider: 'messenger' as const,
        channelId: input.channelId,
        conversationId: input.conversationId,
        recipientId: input.recipientId,
        messageType,
        status: 'validation_error',
        errors: validationErrors,
      };
    }

    const message =
      messageType === 'text'
        ? { text: input.content.trim() }
        : {
            attachment: {
              type: messageType,
              payload: {
                url: attachmentUrl,
                is_reusable: input.metadata?.isReusable !== false,
              },
            },
          };
    const versionPath = this.graphApiVersion?.trim()
      ? `/${this.graphApiVersion.trim().replace(/^\/|\/$/g, '')}`
      : '';
    const endpoint = new URL(
      `${this.graphApiBaseUrl.replace(/\/$/, '')}${versionPath}/${encodeURIComponent(pageId!)}/messages`,
    );

    let response: Response;
    let body: MessengerApiResponse;

    try {
      response = await (this.fetcher || fetch)(endpoint.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pageAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          messaging_type:
            typeof input.metadata?.messagingType === 'string'
              ? input.metadata.messagingType
              : 'RESPONSE',
          message,
        }),
      });
      body = (await response.json()) as MessengerApiResponse;
    } catch (error) {
      return {
        accepted: false,
        provider: 'messenger' as const,
        channelId: input.channelId,
        conversationId: input.conversationId,
        recipientId: input.recipientId,
        messageType,
        status: 'provider_unavailable',
        error: error instanceof Error ? error.message : String(error),
        retry: { recommended: true },
      };
    }

    if (!response.ok || body.error) {
      const retryAfter = this.retryAfterSeconds(response);
      return {
        accepted: false,
        provider: 'messenger' as const,
        channelId: input.channelId,
        conversationId: input.conversationId,
        recipientId: input.recipientId,
        messageType,
        status: 'provider_error',
        providerError: {
          code: body.error?.code || response.status,
          subcode: body.error?.error_subcode,
          type: body.error?.type,
          message:
            body.error?.message || `Messenger returned HTTP ${response.status}`,
          userTitle: body.error?.error_user_title,
          userMessage: body.error?.error_user_msg,
          traceId: body.error?.fbtrace_id,
          transient: body.error?.is_transient,
          retryAfterSeconds: retryAfter,
        },
        retry: {
          recommended:
            body.error?.is_transient === true ||
            response.status === 429 ||
            response.status >= 500,
          retryAfterSeconds: retryAfter,
          appUsage: response.headers.get('x-app-usage') || undefined,
          pageUsage: response.headers.get('x-page-usage') || undefined,
        },
      };
    }

    return {
      accepted: true,
      provider: 'messenger' as const,
      channelId: input.channelId,
      conversationId: input.conversationId,
      recipientId: input.recipientId,
      messageType,
      externalMessageId: body.message_id,
      status: 'sent',
      delivery: {
        state: 'accepted_by_provider',
        providerRecipientId: body.recipient_id,
        callbacksExpected: ['message_deliveries', 'message_reads'],
      },
    };
  }

  private getAttachmentUrl(attachments: Record<string, unknown>[] | undefined) {
    const attachment = attachments?.[0];
    return (
      this.stringValue(attachment?.url) || this.stringValue(attachment?.fileUrl)
    );
  }

  private retryAfterSeconds(response: Response) {
    const value = Number(response.headers.get('retry-after'));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private assertValidGraphApiConfig() {
    const baseUrl = new URL(this.graphApiBaseUrl);
    if (baseUrl.protocol !== 'https:') {
      throw new Error('Messenger Graph API base URL must use HTTPS');
    }

    if (!/^v\d+\.\d+$/.test(this.graphApiVersion.trim())) {
      throw new Error('Messenger Graph API version must use the v<major>.<minor> format');
    }
  }
}
