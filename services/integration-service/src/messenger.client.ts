export type MessengerAttachmentType = 'image' | 'video' | 'audio' | 'file';

export type MessengerSendInput = {
  channelId: string;
  conversationId?: string;
  recipientId?: string;
  content: string;
  messageType?: 'text' | MessengerAttachmentType;
  attachments?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
};

type MessengerApiResponse = {
  recipient_id?: string;
  message_id?: string;
  attachment_id?: string;
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

type MessengerFailureStatus =
  | 'validation_error'
  | 'provider_error'
  | 'provider_unavailable';

type AttachmentUploadResult =
  | { ok: true; attachmentId: string }
  | {
      ok: false;
      status: MessengerFailureStatus;
      error: string;
      retry: { recommended: boolean };
    };

type PostMessageFailure =
  | { kind: 'transport'; error: string }
  | {
      kind: 'provider';
      response: Response;
      body: MessengerApiResponse;
    };

type PostMessageResult =
  | { ok: true; body: MessengerApiResponse }
  | { ok: false; failure: PostMessageFailure };

/**
 * The Send API accepts text *or* an attachment per message, so a caption is a
 * second message. Record how that second send went: the attachment already
 * reached the customer, and core must not treat a caption failure as a whole
 * message failure — retrying would deliver the image twice.
 */
type CaptionDelivery =
  | { delivered: true; messageId?: string }
  | {
      delivered: false;
      error: string;
      code?: number;
      retryAfterSeconds?: number;
    };

/**
 * Messenger renders `image`, `video`, `audio` and `file` natively. `image`
 * covers photos and GIFs, `file` covers documents.
 */
const MESSENGER_ATTACHMENT_TYPES: readonly MessengerAttachmentType[] = [
  'image',
  'video',
  'audio',
  'file',
];

/** Meta's documented ceiling for a single Send API attachment. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Meta's documented text-message ceiling, which also bounds a caption. */
const MAX_CAPTION_LENGTH = 2000;

const ATTACHMENT_UPLOAD_TIMEOUT_MS = 30_000;

export class MessengerClient {
  constructor(
    private readonly graphApiBaseUrl = process.env
      .MESSENGER_GRAPH_API_BASE_URL || 'https://graph.facebook.com',
    private readonly graphApiVersion = process.env.META_GRAPH_API_VERSION ||
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
    const attachmentType =
      messageType === 'text' ? null : this.attachmentTypeFor(messageType);
    // Attachment bytes travel base64 in the dispatch payload because our
    // signed storage URLs are localhost-bound or expiring — Meta cannot fetch
    // them. A public https URL is still accepted for provider-side assets.
    const inlineBytes =
      attachmentType === null
        ? undefined
        : this.stringValue(input.attachments?.[0]?.bytesBase64);
    const attachmentUrl =
      attachmentType === null
        ? undefined
        : this.getAttachmentUrl(input.attachments);
    const validationErrors = [
      ...(!pageId ? ['credentials.pageId is required'] : []),
      ...(!pageAccessToken ? ['credentials.pageAccessToken is required'] : []),
      ...(!recipientId ? ['recipientId is required'] : []),
      ...(messageType === 'text' && !input.content?.trim()
        ? ['content is required for text messages']
        : []),
      ...(messageType !== 'text' && !attachmentType
        ? [
            `messageType must be one of ${['text', ...MESSENGER_ATTACHMENT_TYPES].join(', ')}`,
          ]
        : []),
      ...(attachmentType && !inlineBytes && !attachmentUrl
        ? [
            `attachments[0].url or attachments[0].bytesBase64 is required for ${messageType} messages`,
          ]
        : []),
      ...(attachmentType &&
      input.content?.trim() &&
      input.content.trim().length > MAX_CAPTION_LENGTH
        ? [
            `caption exceeds the Messenger ${MAX_CAPTION_LENGTH}-character limit`,
          ]
        : []),
    ];

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

    let attachmentPayload: Record<string, unknown> | undefined;
    if (attachmentType) {
      if (inlineBytes) {
        const upload = await this.uploadAttachment({
          pageId: pageId!,
          pageAccessToken: pageAccessToken!,
          type: attachmentType,
          encoded: inlineBytes,
          attachment: input.attachments?.[0],
        });
        if (!upload.ok) {
          return {
            accepted: false,
            provider: 'messenger' as const,
            channelId: input.channelId,
            conversationId: input.conversationId,
            recipientId: input.recipientId,
            messageType,
            status: upload.status,
            error: upload.error,
            retry: upload.retry,
          };
        }
        // The upload already declared `is_reusable`, so the send references it
        // by id instead of re-sending the bytes.
        attachmentPayload = { attachment_id: upload.attachmentId };
      } else {
        attachmentPayload = {
          url: attachmentUrl,
          is_reusable: input.metadata?.isReusable !== false,
        };
      }
    }

    const messagingType =
      typeof input.metadata?.messagingType === 'string'
        ? input.metadata.messagingType
        : 'RESPONSE';
    const post = (message: Record<string, unknown>) =>
      this.postMessage({
        pageId: pageId!,
        pageAccessToken: pageAccessToken!,
        recipientId: recipientId!,
        messagingType,
        message,
      });

    const primaryMessage = attachmentType
      ? {
          attachment: {
            type: attachmentType,
            payload: attachmentPayload,
          },
        }
      : { text: input.content.trim() };

    const primary = await post(primaryMessage);
    if (!primary.ok) {
      return this.sendFailure(input, messageType, primary.failure);
    }

    // Messenger's Send API takes text *or* an attachment, never both, and the
    // multi-attachment array has no caption field. Without a follow-up send the
    // text an agent typed alongside an image was silently dropped.
    const caption = attachmentType ? input.content?.trim() : undefined;
    const captionDelivery = caption
      ? await this.deliverCaption(caption, post)
      : undefined;

    return {
      accepted: true,
      provider: 'messenger' as const,
      channelId: input.channelId,
      conversationId: input.conversationId,
      recipientId: input.recipientId,
      messageType,
      externalMessageId: primary.body.message_id,
      status: 'sent',
      delivery: {
        state: 'accepted_by_provider',
        providerRecipientId: primary.body.recipient_id,
        callbacksExpected: ['message_deliveries', 'message_reads'],
        ...(captionDelivery ? { caption: captionDelivery } : {}),
      },
    };
  }

  /**
   * Sends the caption after the attachment landed. The image is already with
   * the customer, so a failure here is reported inside `delivery.caption`
   * instead of failing the whole message — a retry of the command would
   * deliver the image a second time.
   */
  private async deliverCaption(
    caption: string,
    post: (message: Record<string, unknown>) => Promise<PostMessageResult>,
  ): Promise<CaptionDelivery> {
    let result = await post({ text: caption });
    // One immediate retry on transient errors: no re-upload, no image resend.
    if (!result.ok && this.isTransientFailure(result.failure)) {
      result = await post({ text: caption });
    }
    if (result.ok) {
      return { delivered: true, messageId: result.body.message_id };
    }
    return { delivered: false, ...this.captionFailureDetail(result.failure) };
  }

  private captionFailureDetail(failure: PostMessageFailure) {
    if (failure.kind === 'transport') {
      return { error: failure.error };
    }
    const { response, body } = failure;
    return {
      error:
        body.error?.message ||
        `Messenger caption returned HTTP ${response.status}`,
      code: body.error?.code || response.status,
      retryAfterSeconds: this.retryAfterSeconds(response),
    };
  }

  private isTransientFailure(failure: PostMessageFailure) {
    if (failure.kind === 'transport') return true;
    return (
      failure.body.error?.is_transient === true ||
      failure.response.status === 429 ||
      failure.response.status >= 500
    );
  }

  private async postMessage(args: {
    pageId: string;
    pageAccessToken: string;
    recipientId: string;
    messagingType: string;
    message: Record<string, unknown>;
  }): Promise<PostMessageResult> {
    const endpoint = this.graphUrl(
      `${encodeURIComponent(args.pageId)}/messages`,
    );
    try {
      const response = await (this.fetcher || fetch)(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${args.pageAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: args.recipientId },
          messaging_type: args.messagingType,
          message: args.message,
        }),
      });
      const body = (await response.json()) as MessengerApiResponse;
      if (!response.ok || body.error) {
        return { ok: false, failure: { kind: 'provider', response, body } };
      }
      return { ok: true, body };
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: 'transport',
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private sendFailure(
    input: MessengerSendInput,
    messageType: NonNullable<MessengerSendInput['messageType']>,
    failure: PostMessageFailure,
  ) {
    if (failure.kind === 'transport') {
      return {
        accepted: false as const,
        provider: 'messenger' as const,
        channelId: input.channelId,
        conversationId: input.conversationId,
        recipientId: input.recipientId,
        messageType,
        status: 'provider_unavailable' as const,
        error: failure.error,
        retry: { recommended: true },
      };
    }

    const { response, body } = failure;
    const retryAfter = this.retryAfterSeconds(response);
    return {
      accepted: false as const,
      provider: 'messenger' as const,
      channelId: input.channelId,
      conversationId: input.conversationId,
      recipientId: input.recipientId,
      messageType,
      status: 'provider_error' as const,
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

  /**
   * Meta's Attachment Upload API. Required for our own media: `payload.url`
   * must be publicly reachable, and our stored refs are signed, expiring or
   * localhost-bound. Returns an `attachment_id` reusable across sends.
   */
  private async uploadAttachment(args: {
    pageId: string;
    pageAccessToken: string;
    type: MessengerAttachmentType;
    encoded: string;
    attachment?: Record<string, unknown>;
  }): Promise<AttachmentUploadResult> {
    const bytes = Buffer.from(args.encoded, 'base64');
    if (bytes.length === 0) {
      return {
        ok: false,
        status: 'validation_error',
        error: 'attachment bytes are empty',
        retry: { recommended: false },
      };
    }
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        status: 'validation_error',
        // An oversized file fails identically forever, so no Retry button.
        error: `attachment is ${this.formatBytes(bytes.length)} which exceeds the Messenger ${this.formatBytes(MAX_ATTACHMENT_BYTES)} attachment limit; compress the file or send it as a document`,
        retry: { recommended: false },
      };
    }

    const fileName = this.attachmentFileName(args.attachment, args.type);
    const contentType =
      this.stringValue(args.attachment?.contentType) ||
      this.defaultContentType(args.type);

    const form = new FormData();
    form.append(
      'message',
      JSON.stringify({
        attachment: { type: args.type, payload: { is_reusable: true } },
      }),
    );
    form.append(
      'filedata',
      // Buffer is not a BlobPart under the DOM lib (ArrayBufferLike may be
      // SharedArrayBuffer), so copy into a plain Uint8Array first.
      new Blob([new Uint8Array(bytes)], { type: contentType }),
      fileName,
    );

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ATTACHMENT_UPLOAD_TIMEOUT_MS,
    );
    try {
      const response = await (this.fetcher || fetch)(
        this.graphUrl(`${encodeURIComponent(args.pageId)}/message_attachments`),
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${args.pageAccessToken}` },
          body: form,
          signal: controller.signal,
        },
      );
      const body = (await response.json()) as MessengerApiResponse;
      if (!response.ok || body.error || !body.attachment_id) {
        return {
          ok: false,
          status: 'provider_error',
          error:
            body.error?.error_user_msg ||
            body.error?.message ||
            `Messenger attachment upload returned HTTP ${response.status}`,
          retry: {
            recommended:
              body.error?.is_transient === true ||
              response.status === 429 ||
              response.status >= 500,
          },
        };
      }
      return { ok: true, attachmentId: body.attachment_id };
    } catch (error) {
      return {
        ok: false,
        status: 'provider_unavailable',
        error: error instanceof Error ? error.message : String(error),
        retry: { recommended: true },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private graphUrl(path: string) {
    const versionPath = this.graphApiVersion?.trim()
      ? `/${this.graphApiVersion.trim().replace(/^\/|\/$/g, '')}`
      : '';
    return `${this.graphApiBaseUrl.replace(/\/$/, '')}${versionPath}/${path}`;
  }

  private attachmentTypeFor(
    messageType: string,
  ): MessengerAttachmentType | null {
    return (MESSENGER_ATTACHMENT_TYPES as readonly string[]).includes(
      messageType,
    )
      ? (messageType as MessengerAttachmentType)
      : null;
  }

  private attachmentFileName(
    attachment: Record<string, unknown> | undefined,
    type: MessengerAttachmentType,
  ) {
    const declared = this.stringValue(attachment?.fileName);
    if (declared) return declared;
    const extension = this.extensionForContentType(
      this.stringValue(attachment?.contentType) || '',
    );
    return `messenger-${type}${extension}`;
  }

  private extensionForContentType(contentType: string) {
    const normalized = contentType.toLowerCase();
    if (normalized.includes('jpeg') || normalized.includes('jpg'))
      return '.jpg';
    if (normalized.includes('png')) return '.png';
    if (normalized.includes('webp')) return '.webp';
    if (normalized.includes('gif')) return '.gif';
    if (normalized.includes('pdf')) return '.pdf';
    if (normalized.includes('text/plain')) return '.txt';
    // audio/mp4 is m4a (checked first: it also contains 'mp4').
    if (normalized.includes('audio/mp4') || normalized.includes('m4a')) {
      return '.m4a';
    }
    if (normalized.includes('mpeg') || normalized.includes('mp3'))
      return '.mp3';
    if (normalized.includes('ogg') || normalized.includes('opus'))
      return '.ogg';
    if (normalized.includes('webm')) return '.webm';
    if (normalized.includes('mp4')) return '.mp4';
    return '';
  }

  private defaultContentType(type: MessengerAttachmentType) {
    if (type === 'image') return 'image/jpeg';
    if (type === 'video') return 'video/mp4';
    if (type === 'audio') return 'audio/mpeg';
    return 'application/octet-stream';
  }

  private formatBytes(bytes: number) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      throw new Error(
        'Messenger Graph API version must use the v<major>.<minor> format',
      );
    }
  }
}
