import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  serviceAuthHeaders,
} from '@zayos/internal-service-auth';

type InboundEnvelope = {
  eventId?: string;
  provider: string;
  channelId: string;
  body: Record<string, unknown>;
  correlationId?: string;
  receivedAt?: string;
};

type NormalizedMessage = {
  externalConversationId: string;
  externalMessageId: string;
  senderId: string;
  senderDisplayName?: string;
  messageType: string;
  content: string;
  attachments: Record<string, unknown>[];
  metadata: Record<string, unknown>;
};

type ProviderMessageStatus = {
  messageId?: string;
  externalMessageId?: string;
  channelId: string;
  externalConversationId?: string;
  watermark?: number;
  provider: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  providerStatus: string;
  providerError?: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
};

@Injectable()
export class AppService {
  private ingestedEvents = 0;
  private forwardedEvents = 0;
  private readonly graphApiBaseUrl = process.env.MESSENGER_GRAPH_API_BASE_URL || 'https://graph.facebook.com';
  private readonly graphApiVersion =
    process.env.META_GRAPH_API_VERSION ||
    process.env.MESSENGER_GRAPH_API_VERSION ||
    'v25.0';
  private readonly messengerProfileCache = new Map<string, {
    expiresAt: number;
    profile: { first_name?: string; last_name?: string };
  }>();
  private readonly messengerProfileCacheTtlMs = Number(process.env.MESSENGER_PROFILE_CACHE_TTL_MS || 60 * 60 * 1000);

  getHealth() {
    return {
      service: 'chat-ingestion-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  getReadiness() {
    const dependencies = {
      coreApi: Boolean(process.env.CORE_API_URL),
    };
    return {
      service: 'chat-ingestion-service',
      ready: Object.values(dependencies).every(Boolean),
      timestamp: new Date().toISOString(),
    };
  }

  getMetrics() {
    return this.processMetrics({
      ingestedEvents: this.ingestedEvents,
      forwardedEvents: this.forwardedEvents,
    });
  }

  async ingest(envelope: InboundEnvelope) {
    this.ingestedEvents += 1;
    const statusEvents = this.normalizeProviderStatusEvents(envelope);
    if (statusEvents.length > 0) {
      const coreForwarding = await this.forwardStatusesToCore(statusEvents, envelope.correlationId);
      if (coreForwarding.forwarded) this.forwardedEvents += statusEvents.length;

      return {
        accepted: true,
        eventId: envelope.eventId || this.stableEnvelopeEventId(envelope, 'message_status'),
        eventType: 'message_status',
        provider: envelope.provider === 'facebook' ? 'messenger' : envelope.provider,
        channelId: envelope.channelId,
        statusEvents,
        forwardedToCore: coreForwarding.forwarded,
        coreResponse: coreForwarding.response,
        nextStep: coreForwarding.forwarded
          ? undefined
          : 'Set CORE_API_URL to persist provider message status callbacks in core-api.',
      };
    }

    if (this.hasProviderStatusSignal(envelope)) {
      return {
        accepted: true,
        eventId: envelope.eventId || this.stableEnvelopeEventId(envelope, 'ignored_status'),
        eventType: 'message_status',
        provider: envelope.provider === 'facebook' ? 'messenger' : envelope.provider,
        channelId: envelope.channelId,
        statusEvents: [],
        forwardedToCore: false,
        ignored: true,
        reason: 'Provider status callback did not include a usable message or conversation target.',
      };
    }

    const normalized = await this.normalize(envelope);
    const coreForwarding = await this.forwardToCore(envelope, normalized);
    if (coreForwarding.forwarded) this.forwardedEvents += 1;

    return {
      accepted: true,
      eventId: envelope.eventId || this.stableEnvelopeEventId(envelope, 'message'),
      provider: envelope.provider,
      channelId: envelope.channelId,
      normalized,
      forwardedToCore: coreForwarding.forwarded,
      coreResponse: coreForwarding.response,
      nextStep: coreForwarding.forwarded
        ? undefined
        : 'Set CORE_API_URL to persist normalized provider messages in core-api.',
    };
  }

  private normalizeProviderStatusEvents(envelope: InboundEnvelope): ProviderMessageStatus[] {
    const provider = envelope.provider === 'facebook' ? 'messenger' : envelope.provider;
    if (provider === 'viber') {
      const event = this.stringValue(envelope.body?.event);
      if (!event || !['delivered', 'seen', 'failed'].includes(event)) return [];
      const externalMessageId = this.stringValue(envelope.body.message_token);
      if (!externalMessageId) return [];
      return [{
        externalMessageId,
        channelId: envelope.channelId,
        externalConversationId: this.stringValue(envelope.body.user_id),
        provider: 'viber',
        status: event === 'seen' ? 'read' : event as 'delivered' | 'failed',
        providerStatus: event,
        ...(event === 'failed' ? { providerError: { code: envelope.body.failure_code, message: envelope.body.failure_description } } : {}),
        providerMetadata: { eventId: envelope.eventId, providerTimestamp: this.numberValue(envelope.body.timestamp) },
      }];
    }
    if (provider !== 'messenger') {
      return [];
    }

    const body = envelope.body || {};
    const entry = Array.isArray(body.entry) ? (body.entry[0] as Record<string, unknown>) : {};
    const messaging = Array.isArray(entry.messaging)
      ? (entry.messaging[0] as Record<string, unknown>)
      : (body as Record<string, unknown>);
    const sender = (messaging.sender || body.sender || {}) as Record<string, unknown>;
    const message = (messaging.message || body.message || {}) as Record<string, unknown>;
    const delivery = (messaging.delivery || body.delivery) as Record<string, unknown> | undefined;
    const read = (messaging.read || body.read) as Record<string, unknown> | undefined;
    const error = (messaging.error || delivery?.error || message.error || body.error) as
      | Record<string, unknown>
      | undefined;
    const externalConversationId = this.stringValue(sender.id || body.senderId);
    const providerTimestamp = this.numberValue(messaging.timestamp || body.timestamp);

    if (error) {
      const messageIds = this.messageIds(message.mid, delivery?.mids, body.mid);
      return messageIds.map((externalMessageId) => ({
        externalMessageId,
        channelId: envelope.channelId,
        externalConversationId,
        provider: 'messenger',
        status: 'failed',
        providerStatus: 'error',
        providerError: error,
        providerMetadata: {
          eventId: envelope.eventId,
          providerTimestamp,
        },
      }));
    }

    if (delivery) {
      const watermark = this.numberValue(delivery.watermark);
      const messageIds = this.messageIds(delivery.mids, message.mid, body.mid);
      if (messageIds.length > 0) {
        return messageIds.map((externalMessageId) => ({
          externalMessageId,
          channelId: envelope.channelId,
          externalConversationId,
          watermark,
          provider: 'messenger',
          status: 'delivered',
          providerStatus: 'delivery',
          providerMetadata: {
            eventId: envelope.eventId,
            providerTimestamp,
            sequence: delivery.seq,
          },
        }));
      }

      if (externalConversationId && watermark) {
        return [
          {
            channelId: envelope.channelId,
            externalConversationId,
            watermark,
            provider: 'messenger',
            status: 'delivered',
            providerStatus: 'delivery',
            providerMetadata: {
              eventId: envelope.eventId,
              providerTimestamp,
              sequence: delivery.seq,
            },
          },
        ];
      }
    }

    if (read && externalConversationId) {
      return [
        {
          channelId: envelope.channelId,
          externalConversationId,
          watermark: this.numberValue(read.watermark),
          provider: 'messenger',
          status: 'read',
          providerStatus: 'read',
          providerMetadata: {
            eventId: envelope.eventId,
            providerTimestamp,
            sequence: read.seq,
          },
        },
      ];
    }

    if (message.is_echo === true && this.stringValue(message.mid)) {
      return [
        {
          externalMessageId: this.stringValue(message.mid),
          channelId: envelope.channelId,
          externalConversationId,
          provider: 'messenger',
          status: 'sent',
          providerStatus: 'echo',
          providerMetadata: {
            eventId: envelope.eventId,
            providerTimestamp,
          },
        },
      ];
    }

    return [];
  }

  private hasProviderStatusSignal(envelope: InboundEnvelope) {
    const provider = envelope.provider === 'facebook' ? 'messenger' : envelope.provider;
    if (provider === 'viber') {
      return ['delivered', 'seen', 'failed'].includes(String(envelope.body?.event || ''));
    }
    if (provider !== 'messenger') {
      return false;
    }

    const body = envelope.body || {};
    const entry = Array.isArray(body.entry) ? (body.entry[0] as Record<string, unknown>) : {};
    const messaging = Array.isArray(entry.messaging)
      ? (entry.messaging[0] as Record<string, unknown>)
      : (body as Record<string, unknown>);
    const message = (messaging.message || body.message || {}) as Record<string, unknown>;

    return Boolean(
      messaging.delivery ||
        body.delivery ||
        messaging.read ||
        body.read ||
        messaging.error ||
        body.error ||
        message.error ||
        message.is_echo === true,
    );
  }

  private async normalize(envelope: InboundEnvelope): Promise<NormalizedMessage> {
    const provider = envelope.provider === 'facebook' ? 'messenger' : envelope.provider;

    if (provider === 'telegram') {
      return this.normalizeTelegram(envelope);
    }

    if (provider === 'messenger') {
      return this.normalizeMessenger(envelope);
    }

    if (provider === 'tiktok') {
      return this.normalizeTikTok(envelope);
    }

    if (provider === 'viber') {
      return this.normalizeViber(envelope);
    }

    return this.normalizeGeneric(envelope);
  }

  private normalizeTelegram(envelope: InboundEnvelope): NormalizedMessage {
    const body = envelope.body || {};
    const message =
      ((body.message || body.edited_message || body.callback_query || body) as Record<string, unknown>) || {};
    const chat = ((message.chat || body.chat) as Record<string, unknown>) || {};
    const from = ((message.from || body.from) as Record<string, unknown>) || {};
    const chatId = this.firstStringValue(chat.id, body.chat_id, body.conversationId, envelope.channelId) || envelope.channelId;
    const messageId = this.firstStringValue(message.message_id, body.message_id);
    const updateId = this.firstStringValue(body.update_id, envelope.eventId);
    const document = message.document as Record<string, unknown> | undefined;
    const video = message.video as Record<string, unknown> | undefined;
    const audio = message.audio as Record<string, unknown> | undefined;
    const voice = message.voice as Record<string, unknown> | undefined;
    const sticker = message.sticker as Record<string, unknown> | undefined;
    const photo = Array.isArray(message.photo) ? message.photo : [];
    const attachments = [
      ...photo.map((item) => ({ type: 'image', providerFile: item })),
      ...(document ? [{ type: 'file', providerFile: document }] : []),
      ...(video ? [{ type: 'video', providerFile: video }] : []),
      ...(audio ? [{ type: 'audio', providerFile: audio }] : []),
      ...(voice ? [{ type: 'voice', providerFile: voice }] : []),
      ...(sticker ? [{ type: 'sticker', providerFile: sticker }] : []),
    ];

    return {
      externalConversationId: chatId,
      externalMessageId:
        (messageId ? `${chatId}:${messageId}` : undefined) ||
        this.stableFallbackMessageId(envelope, 'telegram', {
          chatId,
          senderId: from.id || body.senderId,
          text: message.text || message.caption || body.text || body.content,
        }),
      senderId: String(body.senderId || from.id || 'unknown'),
      senderDisplayName: [from.first_name, from.last_name].filter(Boolean).join(' ') || undefined,
      messageType: attachments.length > 0 ? String(attachments[0].type) : String(body.messageType || 'text'),
      content: String(message.text || message.caption || body.text || body.content || ''),
      attachments,
      metadata: {
        provider: 'telegram',
        providerEventId: updateId,
        updateId,
        telegramChatId: chatId,
        telegramMessageId: messageId,
        messageDate: this.numberValue(message.date),
        raw: body,
      },
    };
  }

  private async normalizeMessenger(envelope: InboundEnvelope): Promise<NormalizedMessage> {
    const body = envelope.body || {};
    const entry = Array.isArray(body.entry) ? (body.entry[0] as Record<string, unknown>) : {};
    const messaging = Array.isArray(entry.messaging)
      ? (entry.messaging[0] as Record<string, unknown>)
      : (body as Record<string, unknown>);
    const sender = (messaging.sender || body.sender || {}) as Record<string, unknown>;
    const recipient = (messaging.recipient || body.recipient || {}) as Record<string, unknown>;
    const message = (messaging.message || body.message || body) as Record<string, unknown>;
    const attachments = Array.isArray(message.attachments)
      ? (message.attachments as Record<string, unknown>[])
      : Array.isArray(body.attachments)
        ? (body.attachments as Record<string, unknown>[])
        : [];
    const senderId = String(body.senderId || sender.id || 'unknown');
    const pageId = this.firstStringValue(recipient.id, body.pageId);
    const pageAccessToken =
      this.firstStringValue(body.pageAccessToken) ||
      this.firstStringValue((await this.getChannelCredentials(envelope.channelId, 'messenger'))?.pageAccessToken);
    const senderProfile =
      senderId !== 'unknown' && pageAccessToken
        ? await this.fetchMessengerUserProfile(senderId, pageAccessToken)
        : null;
    const senderDisplayName =
      [senderProfile?.first_name, senderProfile?.last_name].filter(Boolean).join(' ') || undefined;

    return {
      externalConversationId: String(sender.id || recipient.id || body.conversationId || envelope.channelId),
      externalMessageId:
        this.firstStringValue(message.mid, body.mid, body.messageId, envelope.eventId) ||
        this.stableFallbackMessageId(envelope, 'messenger', {
          senderId: sender.id || body.senderId,
          recipientId: recipient.id,
          text: message.text || body.text || body.content,
        }),
      senderId,
      senderDisplayName,
      messageType:
        attachments.length > 0 ? String(attachments[0].type || 'attachment') : String(body.messageType || 'text'),
      content: String(message.text || body.text || body.content || ''),
      attachments,
      metadata: {
        provider: 'messenger',
        providerEventId: envelope.eventId || this.firstStringValue(message.mid, body.mid, body.messageId),
        pageId,
        raw: body,
      },
    };
  }

  private normalizeViber(envelope: InboundEnvelope): NormalizedMessage {
    const body = envelope.body || {};
    const sender = this.recordValue(body.sender) || this.recordValue(body.user) || {};
    const message = this.recordValue(body.message) || {};
    const messageType = this.firstStringValue(message.type, body.type) || 'text';
    const mediaUrl = this.firstStringValue(message.media, message.url);
    const attachments = mediaUrl ? [{
      type: messageType === 'picture' ? 'image' : messageType,
      url: mediaUrl,
      fileName: this.firstStringValue(message.file_name, message.name),
      sizeBytes: this.numberValue(message.size),
      thumbnail: this.firstStringValue(message.thumbnail),
    }] : [];
    const senderId = this.firstStringValue(sender.id, body.user_id) || 'unknown';

    return {
      externalConversationId: this.firstStringValue(body.conversation_id, sender.id, body.user_id) || envelope.channelId,
      externalMessageId:
        this.firstStringValue(body.message_token, message.message_token, envelope.eventId) ||
        this.stableFallbackMessageId(envelope, 'viber', {
          senderId,
          event: body.event,
          text: message.text || body.text,
        }),
      senderId,
      senderDisplayName: this.firstStringValue(sender.name),
      messageType: messageType === 'picture' ? 'image' : messageType,
      content: this.firstStringValue(message.text, body.text) || '',
      attachments,
      metadata: {
        provider: 'viber',
        providerEventId: envelope.eventId || this.firstStringValue(body.message_token, message.message_token),
        event: this.firstStringValue(body.event) || 'message',
        timestamp: this.numberValue(body.timestamp),
        raw: body,
      },
    };
  }

  private normalizeTikTok(envelope: InboundEnvelope): NormalizedMessage {
    const body = envelope.body || {};
    const data = this.recordValue(body.data);
    const eventType = this.firstStringValue(body.event_type, body.event, body.type) || 'event';
    const lead = this.recordValue(body.lead) || this.recordValue(body.lead_data) || this.recordValue(data?.lead);
    const comment =
      this.recordValue(body.comment) || this.recordValue(body.comment_data) || this.recordValue(data?.comment);

    if (lead || this.isTikTokLeadEvent(eventType)) {
      return this.normalizeTikTokLead(envelope, eventType, lead || body);
    }

    if (comment || this.isTikTokCommentEvent(eventType)) {
      return this.normalizeTikTokComment(envelope, eventType, comment || body);
    }

    const event = this.recordValue(body.message) || this.recordValue(body.event) || body;
    const sender = this.recordValue(event.sender) || this.recordValue(body.sender) || this.recordValue(event.user) || {};
    const attachments = this.normalizeTikTokAttachments(event.attachments, body.attachments);

    return {
      externalConversationId: String(
        event.conversation_id || body.conversationId || sender.open_id || sender.id || envelope.channelId,
      ),
      externalMessageId:
        this.firstStringValue(event.message_id, body.message_id, body.event_id, envelope.eventId) ||
        this.stableFallbackMessageId(envelope, 'tiktok', {
          conversationId: event.conversation_id || body.conversationId,
          senderId: sender.open_id || sender.id || body.senderId,
          text: event.text || event.content || body.text || body.content,
        }),
      senderId: String(body.senderId || sender.open_id || sender.id || 'unknown'),
      senderDisplayName: String(sender.display_name || sender.username || '') || undefined,
      messageType: String(event.type || body.type || (attachments.length > 0 ? 'attachment' : 'text')),
      content: String(event.text || event.content || body.text || body.content || ''),
      attachments,
      metadata: {
        provider: 'tiktok',
        providerEventId: envelope.eventId || this.firstStringValue(body.event_id, event.message_id, body.message_id),
        productSurface: body.product_surface || body.surface || 'unconfirmed',
        tiktokEventType: eventType,
        raw: body,
      },
    };
  }

  private normalizeTikTokLead(
    envelope: InboundEnvelope,
    eventType: string,
    leadInput: Record<string, unknown>,
  ): NormalizedMessage {
    const body = envelope.body || {};
    const lead = this.recordValue(leadInput) || {};
    const user =
      this.recordValue(lead.user) ||
      this.recordValue(lead.user_info) ||
      this.recordValue(body.user) ||
      this.recordValue(body.sender) ||
      {};
    const fields = this.normalizeTikTokLeadFields(
      lead.field_data || lead.fields || lead.answers || body.field_data || body.fields || body.answers,
    );
    const leadId = this.firstStringValue(lead.lead_id, lead.id, body.lead_id, body.object_id);
    const formId = this.firstStringValue(lead.form_id, body.form_id);
    const advertiserId = this.firstStringValue(lead.advertiser_id, body.advertiser_id);
    const senderId =
      this.firstStringValue(
        body.senderId,
        user.open_id,
        user.openid,
        user.id,
        user.user_id,
        lead.open_id,
        lead.user_openid,
        leadId,
      ) || 'unknown';
    const content =
      this.firstStringValue(lead.message, lead.content, lead.text, body.content, body.text) ||
      this.formatTikTokLeadContent(fields);

    return {
      externalConversationId:
        this.firstStringValue(lead.conversation_id, body.conversation_id) ||
        (leadId ? `lead-${leadId}` : undefined) ||
        senderId ||
        envelope.channelId,
      externalMessageId:
        this.firstStringValue(lead.lead_id, lead.id, body.lead_id, body.event_id, envelope.eventId) ||
        this.stableFallbackMessageId(envelope, 'tiktok-lead', {
          leadId,
          formId,
          advertiserId,
          senderId,
        }),
      senderId,
      senderDisplayName:
        this.firstStringValue(user.display_name, user.username, user.name, fields.name, fields.fullName) || undefined,
      messageType: 'lead',
      content,
      attachments: this.normalizeTikTokAttachments(lead.attachments, body.attachments),
      metadata: {
        provider: 'tiktok',
        providerEventId: envelope.eventId || this.firstStringValue(body.event_id, leadId),
        productSurface: 'lead_capture',
        tiktokEventType: eventType,
        leadId,
        formId,
        advertiserId,
        fields,
        raw: body,
      },
    };
  }

  private normalizeTikTokComment(
    envelope: InboundEnvelope,
    eventType: string,
    commentInput: Record<string, unknown>,
  ): NormalizedMessage {
    const body = envelope.body || {};
    const comment = this.recordValue(commentInput) || {};
    const user =
      this.recordValue(comment.user) ||
      this.recordValue(comment.user_info) ||
      this.recordValue(body.user) ||
      this.recordValue(body.sender) ||
      {};
    const commentId = this.firstStringValue(comment.comment_id, comment.id, body.comment_id);
    const videoId = this.firstStringValue(comment.video_id, comment.item_id, body.video_id, body.item_id);
    const senderId =
      this.firstStringValue(body.senderId, user.open_id, user.openid, user.id, user.user_id, comment.open_id) ||
      'unknown';

    return {
      externalConversationId:
        this.firstStringValue(comment.conversation_id, body.conversation_id) ||
        (videoId && senderId !== 'unknown' ? `video-${videoId}-${senderId}` : undefined) ||
        (commentId ? `comment-${commentId}` : undefined) ||
        envelope.channelId,
      externalMessageId:
        this.firstStringValue(comment.comment_id, comment.id, body.comment_id, body.event_id, envelope.eventId) ||
        this.stableFallbackMessageId(envelope, 'tiktok-comment', {
          commentId,
          videoId,
          senderId,
        }),
      senderId,
      senderDisplayName: this.firstStringValue(user.display_name, user.username, user.name) || undefined,
      messageType: 'comment',
      content: this.firstStringValue(comment.text, comment.content, body.text, body.content) || '',
      attachments: this.normalizeTikTokAttachments(comment.attachments, body.attachments),
      metadata: {
        provider: 'tiktok',
        providerEventId: envelope.eventId || this.firstStringValue(body.event_id, commentId),
        productSurface: 'comment_capture',
        tiktokEventType: eventType,
        commentId,
        parentCommentId: this.firstStringValue(comment.parent_comment_id, body.parent_comment_id),
        videoId,
        raw: body,
      },
    };
  }

  private normalizeGeneric(envelope: InboundEnvelope): NormalizedMessage {
    const body = envelope.body || {};
    const message = (body.message || body.entry || body.event || body) as Record<string, unknown>;

    return {
      externalConversationId: String(
        body.conversationId || body.chat_id || body.sender?.['id'] || body.senderId || envelope.channelId,
      ),
      externalMessageId:
        this.firstStringValue(body.messageId, body.message_id, body.mid, envelope.eventId) ||
        this.stableFallbackMessageId(envelope, 'generic', {
          conversationId: body.conversationId || body.chat_id,
          senderId: body.senderId || body.from?.['id'] || body.sender?.['id'],
          text: body.text || body.content || message.text,
        }),
      senderId: String(body.senderId || body.from?.['id'] || body.sender?.['id'] || 'unknown'),
      messageType: String(body.messageType || body.type || 'text'),
      content: String(body.text || body.content || message.text || ''),
      attachments: Array.isArray(body.attachments) ? (body.attachments as Record<string, unknown>[]) : [],
      metadata: {
        provider: envelope.provider,
        providerEventId: envelope.eventId || this.firstStringValue(body.messageId, body.message_id, body.mid),
        raw: body,
      },
    };
  }

  private async forwardToCore(envelope: InboundEnvelope, normalized: NormalizedMessage) {
    const coreApiUrl = process.env.CORE_API_URL;

    if (!coreApiUrl) {
      return { forwarded: false };
    }

    const endpoint = `${coreApiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')}/api/v1/internal/provider-events`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...serviceAuthHeaders({
        audience: SERVICE_IDENTITIES.CORE,
        subject: SERVICE_IDENTITIES.CHAT_INGESTION,
        scopes: [SERVICE_SCOPES.CHAT_INGEST],
        correlationId: envelope.correlationId,
      }),
    };

    if (envelope.correlationId) {
      headers['x-correlation-id'] = envelope.correlationId;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        eventId:
          envelope.eventId ||
          this.stringValue(normalized.metadata.providerEventId) ||
          `message:${normalized.externalMessageId}`,
        provider: envelope.provider,
        channelId: envelope.channelId,
        normalized,
      }),
    });
    const responseBody = await this.safeJson(response);

    if (!response.ok) {
      throw new Error(`Core API ingestion returned HTTP ${response.status}: ${JSON.stringify(responseBody)}`);
    }

    return {
      forwarded: true,
      response: responseBody,
    };
  }

  private async forwardStatusesToCore(statusEvents: ProviderMessageStatus[], correlationId?: string) {
    const coreApiUrl = process.env.CORE_API_URL;

    if (!coreApiUrl) {
      return { forwarded: false };
    }

    const endpoint = `${coreApiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')}/api/v1/internal/provider-events/message-status`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...serviceAuthHeaders({
        audience: SERVICE_IDENTITIES.CORE,
        subject: SERVICE_IDENTITIES.CHAT_INGESTION,
        scopes: [SERVICE_SCOPES.CHAT_INGEST],
        correlationId,
      }),
    };

    if (correlationId) {
      headers['x-correlation-id'] = correlationId;
    }

    const responses: unknown[] = [];
    for (const statusEvent of statusEvents) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(statusEvent),
      });
      const responseBody = await this.safeJson(response);

      if (!response.ok) {
        throw new Error(`Core API message status returned HTTP ${response.status}: ${JSON.stringify(responseBody)}`);
      }
      responses.push(responseBody);
    }

    return {
      forwarded: true,
      response: responses.length === 1 ? responses[0] : responses,
    };
  }

  private messageIds(...values: unknown[]) {
    return values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map((value) => this.stringValue(value))
      .filter((value): value is string => Boolean(value));
  }

  private stringValue(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return undefined;
  }

  private firstStringValue(...values: unknown[]) {
    for (const value of values) {
      const stringValue = this.stringValue(value);
      if (stringValue) return stringValue;
    }

    return undefined;
  }

  private stableFallbackMessageId(
    envelope: InboundEnvelope,
    namespace: string,
    stableFields: Record<string, unknown>,
  ) {
    return `sha256:${createHash('sha256')
      .update(
        JSON.stringify({
          provider: envelope.provider,
          channelId: envelope.channelId,
          namespace,
          stableFields,
        }),
      )
      .digest('hex')}`;
  }

  private stableEnvelopeEventId(envelope: InboundEnvelope, eventType: string) {
    return `sha256:${createHash('sha256')
      .update(
        JSON.stringify({
          provider: envelope.provider,
          channelId: envelope.channelId,
          eventType,
          body: envelope.body,
        }),
      )
      .digest('hex')}`;
  }

  private recordValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  }

  private isTikTokLeadEvent(eventType: string) {
    return eventType.toLowerCase().includes('lead');
  }

  private isTikTokCommentEvent(eventType: string) {
    return eventType.toLowerCase().includes('comment');
  }

  private normalizeTikTokLeadFields(value: unknown) {
    const fields: Record<string, string> = {};

    if (Array.isArray(value)) {
      for (const item of value) {
        const field = this.recordValue(item);
        const key = this.firstStringValue(field?.name, field?.field, field?.key, field?.label);
        const fieldValue = this.formatTikTokFieldValue(field?.value ?? field?.values ?? field?.answer ?? field?.answers);
        if (key && fieldValue) fields[key] = fieldValue;
      }
      return fields;
    }

    const record = this.recordValue(value);
    if (!record) return fields;

    for (const [key, fieldValue] of Object.entries(record)) {
      const formatted = this.formatTikTokFieldValue(fieldValue);
      if (formatted) fields[key] = formatted;
    }

    return fields;
  }

  private formatTikTokFieldValue(value: unknown): string | undefined {
    if (Array.isArray(value)) {
      const values = value
        .map((item) => this.formatTikTokFieldValue(item))
        .filter((item): item is string => Boolean(item));
      return values.length ? values.join(', ') : undefined;
    }

    const stringValue = this.stringValue(value);
    if (stringValue) return stringValue;

    if (typeof value === 'boolean') {
      return String(value);
    }

    if (this.recordValue(value)) {
      return JSON.stringify(value);
    }

    return undefined;
  }

  private formatTikTokLeadContent(fields: Record<string, string>) {
    const fieldEntries = Object.entries(fields);
    if (fieldEntries.length === 0) {
      return 'TikTok lead captured';
    }

    return `TikTok lead captured: ${fieldEntries.map(([key, value]) => `${key}: ${value}`).join('; ')}`;
  }

  private normalizeTikTokAttachments(...values: unknown[]) {
    return values.flatMap((value) => {
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => Boolean(this.recordValue(item)));
      }

      const record = this.recordValue(value);
      return record ? [record] : [];
    });
  }

  private numberValue(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private async safeJson(response: Response) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  private processMetrics(metrics: Record<string, number>) {
    const memory = process.memoryUsage();
    return {
      service: 'chat-ingestion-service',
      uptimeSeconds: process.uptime(),
      memoryBytes: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
      },
      ...metrics,
      timestamp: new Date().toISOString(),
    };
  }

  private async getChannelCredentials(channelId: string, provider: string) {
    const coreApiUrl = process.env.CORE_API_URL;
    if (!coreApiUrl) {
      return null;
    }

    const endpoint = `${coreApiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')}/api/v1/internal/channels/${encodeURIComponent(channelId)}/providers/${encodeURIComponent(provider)}/credentials`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...serviceAuthHeaders({
        audience: SERVICE_IDENTITIES.CORE,
        subject: SERVICE_IDENTITIES.CHAT_INGESTION,
        scopes: [SERVICE_SCOPES.CHANNEL_CREDENTIALS_READ],
      }),
    };

    try {
      const response = await fetch(endpoint, { method: 'GET', headers });
      if (!response.ok) return null;
      const body = (await response.json()) as { credentials?: Record<string, unknown> };
      return body.credentials || null;
    } catch {
      return null;
    }
  }

  private async fetchMessengerUserProfile(senderId: string, pageAccessToken: string) {
    const cacheKey = `${senderId}:${pageAccessToken.slice(-8)}`;
    const cached = this.messengerProfileCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.profile;
    }

    const versionPath = this.graphApiVersion?.trim()
      ? `/${this.graphApiVersion.trim().replace(/^\/|\/$/g, '')}`
      : '';
    const endpoint = new URL(`${this.graphApiBaseUrl.replace(/\/$/, '')}${versionPath}/${encodeURIComponent(senderId)}`);
    endpoint.searchParams.set('access_token', pageAccessToken);
    endpoint.searchParams.set('fields', 'first_name,last_name');

    try {
      const response = await fetch(endpoint.toString(), { method: 'GET' });
      if (!response.ok) return null;
      const body = (await response.json()) as { first_name?: string; last_name?: string };
      this.messengerProfileCache.set(cacheKey, {
        expiresAt: Date.now() + this.messengerProfileCacheTtlMs,
        profile: body,
      });
      return body;
    } catch {
      return null;
    }
  }
}
