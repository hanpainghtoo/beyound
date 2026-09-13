export type ViberSendInput = {
  channelId: string;
  conversationId?: string;
  recipientId?: string;
  content: string;
  messageType?: 'text' | 'image' | 'file';
  attachments?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
};

type ViberResponse = {
  status?: number;
  status_message?: string;
  message_token?: number | string;
};

export class ViberClient {
  constructor(
    private readonly apiBaseUrl = process.env.VIBER_API_BASE_URL || 'https://chatapi.viber.com/pa',
    private readonly fetcher?: typeof fetch,
  ) {}

  async send(input: ViberSendInput) {
    const authToken = this.stringValue(input.credentials?.authToken);
    const recipientId = this.stringValue(input.recipientId);
    const messageType = input.messageType || 'text';
    const attachment = input.attachments?.[0];
    const attachmentUrl = this.stringValue(attachment?.url) || this.stringValue(attachment?.fileUrl);
    const errors = [
      ...(!authToken ? ['credentials.authToken is required'] : []),
      ...(!recipientId ? ['recipientId is required'] : []),
      ...(messageType === 'text' && !input.content?.trim() ? ['content is required for text messages'] : []),
      ...(messageType !== 'text' && !attachmentUrl ? [`attachments[0].url is required for ${messageType} messages`] : []),
    ];

    if (errors.length) {
      return { accepted: false, provider: 'viber' as const, channelId: input.channelId, status: 'validation_error', errors };
    }

    const payload: Record<string, unknown> = {
      receiver: recipientId,
      min_api_version: Number(input.metadata?.minApiVersion || 7),
      sender: {
        name: this.stringValue(input.credentials?.botName) || 'ZayOS',
        ...(this.stringValue(input.credentials?.botAvatar) ? { avatar: this.stringValue(input.credentials?.botAvatar) } : {}),
      },
      type: messageType === 'file' ? 'file' : messageType === 'image' ? 'picture' : 'text',
    };
    if (messageType === 'text') payload.text = input.content.trim();
    if (messageType === 'image') {
      payload.media = attachmentUrl;
      if (input.content?.trim()) payload.text = input.content.trim();
      if (this.stringValue(attachment?.thumbnail)) payload.thumbnail = this.stringValue(attachment?.thumbnail);
    }
    if (messageType === 'file') {
      payload.media = attachmentUrl;
      payload.file_name = this.stringValue(attachment?.fileName) || 'attachment';
      if (Number.isFinite(Number(attachment?.sizeBytes))) payload.size = Number(attachment?.sizeBytes);
    }

    try {
      const response = await (this.fetcher || fetch)(`${this.apiBaseUrl.replace(/\/$/, '')}/send_message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Viber-Auth-Token': authToken! },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as ViberResponse;
      if (!response.ok || body.status !== 0) {
        return {
          accepted: false,
          provider: 'viber' as const,
          channelId: input.channelId,
          status: 'provider_error',
          providerError: { code: body.status ?? response.status, description: body.status_message || `Viber returned HTTP ${response.status}` },
          retry: { recommended: response.status === 429 || response.status >= 500 },
        };
      }
      return {
        accepted: true,
        provider: 'viber' as const,
        channelId: input.channelId,
        conversationId: input.conversationId,
        recipientId,
        messageType,
        externalMessageId: body.message_token === undefined ? undefined : String(body.message_token),
        status: 'sent',
        delivery: { state: 'accepted_by_provider', callbacksExpected: ['delivered', 'seen', 'failed'] },
      };
    } catch (error) {
      return {
        accepted: false,
        provider: 'viber' as const,
        channelId: input.channelId,
        status: 'provider_unavailable',
        error: error instanceof Error ? error.message : String(error),
        retry: { recommended: true },
      };
    }
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
