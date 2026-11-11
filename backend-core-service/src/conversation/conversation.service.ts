import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import type { EntityManager, Repository } from 'typeorm';

import { Conversation } from './entities/conversation.entity';
import { InboundProviderEvent } from './entities/inbound-provider-event.entity';
import { Message } from './entities/message.entity';
import { Customer } from '../customer/entities/customer.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TelegramBotApiClient } from '../channel/telegram-bot-api.client';
import { decryptProviderCredentials } from '../channel/provider-credentials.util';
import { MediaLibraryService } from '../media/media-library.service';
import { MEDIA_MESSAGING_CHANNEL_TYPES } from '../agent/conversation-intent';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { Notification } from '../common/entities/notification.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { SubscriptionEntitlementService } from '../subscription-period/subscription-entitlement.service';
import {
  isPeriodScopedEnforcementEnabled,
  isShadowDualWriteEnabled,
} from '../subscription-period/subscription-entitlement-flag.util';
import { UsageLimitService } from '../usage/usage-limit.service';
import { WebSocketService } from '../websocket/websocket.service';
import {
  INTERNAL_SYSTEM_EVENT_TYPE,
  resolveTelegramBrowseVisitId,
  telegramShoppingIdentityKey,
  withShoppingActivityMetadata,
} from './internal-message.util';

export type NormalizedProviderMessage = {
  externalConversationId: string;
  externalMessageId: string;
  senderId: string;
  senderDisplayName?: string;
  /** Provider-hosted avatar hint; never a durable URL (Messenger's expires). */
  senderAvatarUrl?: string;
  messageType: string;
  content: string;
  attachments?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  eventType?: 'message' | 'callback_query';
};

type ProviderEventType =
  | 'message'
  | 'callback_query'
  | 'message_edit'
  | 'delivery'
  | 'read'
  | 'reaction'
  | 'conversation_update'
  | 'other';

type ProviderIngestionInput = {
  eventId?: string;
  provider: string;
  channelId: string;
  normalized: NormalizedProviderMessage;
};

type ProviderMessageStatusInput = {
  messageId?: string;
  externalMessageId?: string;
  channelId?: string;
  externalConversationId?: string;
  watermark?: number;
  provider: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  providerStatus?: string;
  providerError?: Record<string, unknown>;
  retry?: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
};

export type TelegramShoppingActivityInput = {
  eventId?: string;
  channelId: string;
  normalized: NormalizedProviderMessage;
  visitId: string;
  screen?: string;
};

/** Best-effort extension for Telegram-downloaded bytes. Unknown → no suffix. */
function extensionForContentType(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('webp')) return '.webp';
  if (normalized.includes('gif')) return '.gif';
  // audio/mp4 is m4a (checked first: it also contains 'mp4'), audio/mpeg is mp3.
  if (normalized.includes('audio/mp4') || normalized.includes('m4a'))
    return '.m4a';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return '.mp3';
  if (normalized.includes('ogg') || normalized.includes('opus')) return '.ogg';
  if (normalized.includes('webm')) return '.webm';
  if (normalized.includes('mp4')) return '.mp4';
  if (normalized.includes('pdf')) return '.pdf';
  if (normalized.includes('text/plain')) return '.txt';
  return '';
}

type InboundAttachmentDownload = {
  bytes: Buffer;
  /** Mime type declared by the provider payload, when it declares one. */
  providerMime: unknown;
  /** Content-Type served by the download host, when it serves one. */
  downloadContentType: string;
  fileName: string;
};

const MESSENGER_ATTACHMENT_DOWNLOAD_TIMEOUT_MS = 20_000;

/**
 * Messenger CDN links carry a hashed basename (often with an extension) and
 * sometimes a `title`. Prefer the declared name, then the URL basename, then a
 * generated one — file-storage needs *some* name and derives its object key
 * from it.
 */
function messengerAttachmentFileName(
  hint: string,
  rawUrl: string,
  type: string,
): string {
  const baseName = (value: string) => value.split(/[\\/]/).pop() || '';
  const fromHint = baseName(hint.trim());
  if (fromHint) return fromHint.slice(0, 200);
  try {
    const fromUrl = baseName(decodeURIComponent(new URL(rawUrl).pathname));
    if (fromUrl) return fromUrl.slice(0, 200);
  } catch {
    // Malformed URL or bad escape: fall through to the generated name.
  }
  return `messenger-${type || 'file'}`;
}

/**
 * True when every word of `current` appears in `candidate`, in order, and
 * `candidate` has words to spare — "Ye San" is a subset of "Ye Htet San".
 * Used to upgrade a provider name that was resolved before we asked Meta for
 * its full `name` field, without overwriting a genuinely different name an
 * agent chose. Case-insensitive; punctuation stays part of the word.
 */
function isNameSubset(current: string, candidate: string): boolean {
  const currentWords = current
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const candidateWords = candidate
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (
    currentWords.length === 0 ||
    candidateWords.length <= currentWords.length
  ) {
    return false;
  }
  let matched = 0;
  for (const word of candidateWords) {
    if (word === currentWords[matched]) matched += 1;
    if (matched === currentWords.length) return true;
  }
  return false;
}

/**
 * MP3 frame sync: 11 set bits, then a layer/version pair that cannot be 0b01.
 * Telegram voice notes and phone recordings are frequently raw MP3 frames with
 * no ID3 tag and no filename, which previously left the sniff at null and the
 * attachment stuck on its raw provider ref.
 */
function hasMp3FrameSync(bytes: Buffer): boolean {
  const start =
    bytes.length > 3 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
      ? 3
      : 0;
  for (
    let offset = start;
    offset < Math.min(bytes.length - 1, start + 4096);
    offset++
  ) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) continue;
    const layer = (bytes[offset + 1] >> 1) & 0x03;
    const version = (bytes[offset + 1] >> 3) & 0x03;
    // Layer 00 is reserved, MPEG version 01 is reserved — exclude both so
    // arbitrary binary noise is not misreported as audio/mpeg.
    if (layer !== 0 && version !== 1) return true;
  }
  return false;
}

/**
 * Best-effort content type from file magic bytes. Covers the formats Telegram
 * is allowed to carry (images, mp4, mp3, m4a, ogg, webm, pdf). Unknown → null.
 */
/**
 * Exported for the content-type matrix spec. Pure and deterministic, which is
 * exactly what the failure mode needs: inbound persistence fails soft, so a
 * bad sniff is invisible in production and only a direct test catches it.
 */
export function sniffContentType(bytes: Buffer): string | null {
  const startsWith = (signature: number[], offset = 0): boolean =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);
  const matchesAscii = (text: string, offset: number) => {
    if (bytes.length < offset + text.length) return false;
    for (let index = 0; index < text.length; index++) {
      if (bytes[offset + index] !== text.charCodeAt(index)) return false;
    }
    return true;
  };

  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    startsWith([0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return 'application/pdf';
  if (startsWith([0x4f, 0x67, 0x67, 0x53])) return 'audio/ogg';
  // Matroska/WebM share the EBML header. WebM is the only variant we store,
  // and a bare `.mkv` reaching here would 400 on the allowlist rather than be
  // silently misfiled as video/mp4.
  if (startsWith([0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (startsWith([0x49, 0x44, 0x33])) return 'audio/mpeg';
  // MP4/M4A family: 'ftyp' brand at offset 4. Both share the container, so the
  // major brand decides audio from video — m4a was previously stored as
  // video/mp4, which Telegram then sends as a non-playable document.
  if (startsWith([0x66, 0x74, 0x79, 0x70], 4)) {
    if (matchesAscii('M4A ', 8) || matchesAscii('M4B ', 8)) return 'audio/mp4';
    return 'video/mp4';
  }
  if (hasMp3FrameSync(bytes)) return 'audio/mpeg';
  return null;
}

/**
 * Resolve the content type file-storage will accept for an inbound Telegram
 * download. Telegram's `/file` host often serves `application/octet-stream`
 * (or omits the header entirely), which the storage allowlist rejects with a
 * 400 — so the provider payload's own `mime_type` wins, then a usable download
 * header, then magic-byte sniffing of the downloaded bytes, then an extension
 * guess from `file_name`. Returns null when nothing usable is available, which
 * keeps the raw ref (fail-soft) instead of round-tripping a guaranteed-400
 * upload.
 */
export function resolveInboundContentType(
  providerMime: unknown,
  downloadContentType: string,
  fileName: string,
  bytes: Buffer,
): string | null {
  const usable = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (
      !normalized ||
      normalized === 'application/octet-stream' ||
      normalized === 'binary/octet-stream'
    ) {
      return null;
    }
    return normalized.includes('/') ? normalized : null;
  };

  const fromProvider = usable(providerMime);
  if (fromProvider) return fromProvider;
  const fromDownload = usable(downloadContentType);
  if (fromDownload) return fromDownload;
  const fromSniff = sniffContentType(bytes);
  if (fromSniff) return fromSniff;

  const lower = fileName.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.ogg') || lower.endsWith('.opus')) return 'audio/ogg';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  return null;
}

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(InboundProviderEvent)
    private inboundProviderEventRepository: Repository<InboundProviderEvent>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(TenantChannel)
    private channelRepository: Repository<TenantChannel>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(TenantUser)
    private tenantUserRepository: Repository<TenantUser>,
    private readonly entitlementResolver: SubscriptionEntitlementService,
    private readonly usageLimitService: UsageLimitService,
    private readonly mediaLibraryService: MediaLibraryService,
    @Inject(forwardRef(() => WebSocketService))
    private readonly websocketService: WebSocketService,
  ) {}

  async createConversation(
    tenantId: string,
    customerId: string,
    channelId: string,
    initialMessage?: string,
  ): Promise<Conversation> {
    // Verify customer and channel exist
    const customer = await this.customerRepository.findOne({
      where: { id: customerId, tenantId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const channel = await this.channelRepository.findOne({
      where: { id: channelId, tenantId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Create conversation
    const conversation = this.conversationRepository.create({
      tenantId,
      customerId,
      channelId,
      status: 'open',
      priority: 'normal',
      firstMessageAt: new Date(),
      lastMessageAt: new Date(),
    });

    const savedConversation =
      await this.conversationRepository.save(conversation);

    // Create initial message if provided
    if (initialMessage) {
      const message = this.messageRepository.create({
        conversationId: savedConversation.id,
        tenantId,
        senderType: 'customer',
        senderId: customerId,
        messageType: 'text',
        content: initialMessage,
      });

      await this.messageRepository.save(message);
    }

    return savedConversation;
  }

  async recordTelegramShoppingActivity(input: TelegramShoppingActivityInput) {
    const channel = await this.channelRepository.findOne({
      where: { id: input.channelId },
    });
    if (!channel || channel.channelType !== 'telegram')
      return { ignored: true };
    const shoppingSettings = (channel.configuration?.telegramShopping ||
      {}) as {
      shopEnabled?: boolean;
      newShoppingActivityIndicatorEnabled?: boolean;
    };
    if (
      channel.status === 'disabled' ||
      channel.status === 'inactive' ||
      channel.connectionStatus === 'disabled' ||
      shoppingSettings.shopEnabled !== true
    ) {
      return { ignored: true, reason: 'shop_disabled' };
    }

    const normalized = input.normalized;
    if (
      normalized.eventType !== 'callback_query' &&
      !['/start', '/menu'].includes((normalized.content || '').trim())
    ) {
      return { ignored: true, reason: 'not_shop_entrypoint' };
    }
    const now = new Date();
    const provider = 'telegram';
    const senderId = normalized.senderId || 'unknown';
    const externalConversationId = normalized.externalConversationId;
    const identityKey = telegramShoppingIdentityKey(
      channel.id,
      senderId,
      externalConversationId,
    );
    const isCallback = normalized.eventType === 'callback_query';
    const result = await this.conversationRepository.manager.transaction(
      async (manager) => {
        const customer = await this.upsertProviderCustomer(
          manager,
          channel,
          normalized,
          provider,
          now,
        );
        const conversation = await this.upsertProviderConversation(
          manager,
          channel,
          customer,
          normalized,
          provider,
          now,
          false,
        );
        const previousMetadata =
          (conversation.metadata as
            | Record<string, unknown>
            | null
            | undefined) || {};
        const previousLastActivity = previousMetadata.lastShoppingActivityAt;
        const previousVisitId = previousMetadata.shoppingVisitId;
        const visitId = resolveTelegramBrowseVisitId(
          previousVisitId,
          previousLastActivity,
          input.visitId,
          now,
        );
        const firstContactKey = `telegram.first_contact:${identityKey}`;
        const browseKey = `telegram.browse_summary:${identityKey}:${visitId}`;
        const messageRepository = manager.getRepository(Message);
        const findInternal = (idempotencyKey: string) =>
          messageRepository
            .createQueryBuilder('message')
            .where('message.tenant_id = :tenantId', {
              tenantId: channel.tenantId,
            })
            .andWhere('message.conversation_id = :conversationId', {
              conversationId: conversation.id,
            })
            .andWhere("message.sender_type = 'system'")
            .andWhere("message.message_type = 'system_event'")
            .andWhere('message.is_internal = true')
            .andWhere(
              "message.metadata ->> 'idempotencyKey' = :idempotencyKey",
              {
                idempotencyKey,
              },
            )
            .getOne();

        const first = await findInternal(firstContactKey);
        let firstInserted = false;
        if (!first) {
          const firstMessage = messageRepository.create({
            conversationId: conversation.id,
            tenantId: channel.tenantId,
            channelId: channel.id,
            senderType: 'system',
            senderId: undefined,
            messageType: INTERNAL_SYSTEM_EVENT_TYPE,
            content: 'Customer started a Telegram shopping visit.',
            attachments: [],
            metadata: {
              systemEvent: true,
              eventName: 'telegram.first_contact',
              eventVersion: 1,
              idempotencyKey: firstContactKey,
              visitId,
              telegramUserId: senderId,
              telegramChatId: externalConversationId,
              sourceEventId: input.eventId || null,
            },
            provider: null,
            externalMessageId: undefined,
            status: 'sent',
            isInternal: true,
          });
          await messageRepository.save(firstMessage);
          firstInserted = true;
        }

        const activityMetadata = withShoppingActivityMetadata(
          previousMetadata,
          {
            shoppingStage: 'browsing',
            shoppingStageUpdatedAt: now.toISOString(),
            lastShoppingActivityAt: now.toISOString(),
            needsAttention: previousMetadata.needsAttention === true,
            attentionReason:
              typeof previousMetadata.attentionReason === 'string'
                ? previousMetadata.attentionReason
                : null,
            attentionAt:
              typeof previousMetadata.attentionAt === 'string'
                ? previousMetadata.attentionAt
                : null,
            newShoppingActivity:
              shoppingSettings.newShoppingActivityIndicatorEnabled === true,
          },
        );
        const browse = await findInternal(browseKey);
        let browseInserted = false;
        const browseMetadata = {
          ...activityMetadata,
          shoppingVisitId: visitId,
          browseSummaryPending: true,
          browseSummaryDueAt: new Date(now.getTime() + 15_000).toISOString(),
          browseSummary: {
            visitId,
            screen: input.screen || (isCallback ? 'callback' : 'menu'),
            lastEventId: input.eventId || null,
            lastActivityAt: now.toISOString(),
          },
        };
        if (!browse) {
          await messageRepository.save(
            messageRepository.create({
              conversationId: conversation.id,
              tenantId: channel.tenantId,
              channelId: channel.id,
              senderType: 'system',
              senderId: undefined,
              messageType: INTERNAL_SYSTEM_EVENT_TYPE,
              content: 'Customer is browsing the Telegram shop.',
              attachments: [],
              metadata: {
                systemEvent: true,
                eventName: 'telegram.browse_summary',
                eventVersion: 1,
                idempotencyKey: browseKey,
                ...browseMetadata,
              },
              provider: null,
              externalMessageId: undefined,
              status: 'sent',
              isInternal: true,
            }),
          );
          browseInserted = true;
        }

        conversation.metadata = {
          ...previousMetadata,
          ...browseMetadata,
        };
        if (firstInserted) conversation.lastMessageAt = now;
        await manager.save(Conversation, conversation);
        return {
          tenantId: channel.tenantId,
          customerId: customer.id,
          conversationId: conversation.id,
          firstInserted,
          browseInserted,
          browse,
        };
      },
    );

    const conversation = await this.conversationRepository.findOneBy({
      id: result.conversationId,
    });
    if (conversation) {
      const activity =
        result.firstInserted || result.browseInserted
          ? await this.messageRepository.findOne({
              where: {
                conversationId: result.conversationId,
                tenantId: result.tenantId,
                messageType: INTERNAL_SYSTEM_EVENT_TYPE,
                isInternal: true,
              },
              order: { updatedAt: 'DESC' },
            })
          : null;
      if (activity && (result.firstInserted || result.browseInserted)) {
        this.websocketService.emitNewMessage(
          result.tenantId,
          result.conversationId,
          activity,
        );
      }
      this.websocketService.emitConversationUpdate(
        result.tenantId,
        result.conversationId,
        {
          status: conversation.status,
          lastMessageAt: conversation.lastMessageAt,
          lastShoppingActivityAt: (
            conversation.metadata as Record<string, unknown> | null | undefined
          )?.lastShoppingActivityAt,
          shoppingStage: (
            conversation.metadata as Record<string, unknown> | null | undefined
          )?.shoppingStage,
          needsAttention:
            (
              conversation.metadata as
                | Record<string, unknown>
                | null
                | undefined
            )?.needsAttention === true,
        },
      );
    }
    return result;
  }

  async flushDueTelegramBrowseSummaries() {
    const now = new Date();
    const due = await this.conversationRepository
      .createQueryBuilder('conversation')
      .where("conversation.metadata ->> 'browseSummaryPending' = 'true'")
      .andWhere(
        "(conversation.metadata ->> 'browseSummaryDueAt')::timestamptz <= :now",
        { now },
      )
      .limit(100)
      .getMany();
    let flushed = 0;
    for (const conversation of due) {
      const summary = conversation.metadata?.browseSummary as
        | { visitId?: string; screen?: string; lastActivityAt?: string }
        | undefined;
      if (!summary?.visitId) continue;
      const keyPrefix = `telegram.browse_summary:${conversation.channelId}:`;
      const browse = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.conversation_id = :conversationId', {
          conversationId: conversation.id,
        })
        .andWhere("message.metadata ->> 'idempotencyKey' LIKE :key", {
          key: `${keyPrefix}%:${summary.visitId}`,
        })
        .andWhere("message.message_type = 'system_event'")
        .andWhere('message.is_internal = true')
        .orderBy('message.updated_at', 'DESC')
        .getOne();
      if (!browse) continue;
      browse.content = `Customer browsed the Telegram shop (${summary.screen || 'shop'}).`;
      browse.metadata = {
        ...(browse.metadata || {}),
        browseSummaryPending: false,
        flushedAt: now.toISOString(),
      };
      await this.messageRepository.manager.transaction(async (manager) => {
        await manager.save(Message, browse);
        conversation.metadata = {
          ...(conversation.metadata || {}),
          browseSummaryPending: false,
        };
        await manager.save(Conversation, conversation);
      });
      flushed += 1;
      this.websocketService.emitNewMessage(
        conversation.tenantId,
        conversation.id,
        browse,
      );
    }
    return { flushed };
  }

  async getConversationHistory(
    tenantId: string,
    customerId: string,
  ): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { tenantId, customerId },
      relations: ['channel', 'assignedAgent'],
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }

  async markMessagesAsRead(
    tenantId: string,
    conversationId: string,
  ): Promise<void> {
    await this.messageRepository.update(
      { conversationId, tenantId, status: 'delivered' },
      { status: 'read' },
    );
  }

  async findOne(
    conversationId: string,
    tenantId: string,
  ): Promise<Conversation | null> {
    return this.conversationRepository.findOne({
      where: { id: conversationId, tenantId },
      relations: ['customer', 'channel', 'messages'],
    });
  }

  async ingestProviderMessage(input: ProviderIngestionInput) {
    console.error('[INGEST] START', {
      provider: input?.provider,
      channelId: input?.channelId,
      hasAttachments: !!input?.normalized?.attachments?.length,
    });
    console.log('[ingestProviderMessage] START', {
      provider: input?.provider,
      channelId: input?.channelId,
      hasAttachments: !!input?.normalized?.attachments?.length,
    });
    const channel = await this.channelRepository.findOne({
      where: { id: input.channelId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Defense-in-depth behind the edge resolution gate: replayed, retried,
    // or manually re-queued events for a disconnected channel must not be
    // ingested. Terminal (non-retryable) so the sender does not retry.
    if (
      channel.status === 'disabled' ||
      channel.status === 'inactive' ||
      channel.connectionStatus === 'disabled'
    ) {
      throw new HttpException(
        {
          code: 'CHANNEL_DISABLED',
          message:
            'This channel is disabled and cannot receive provider traffic.',
          channelId: channel.id,
        },
        HttpStatus.CONFLICT,
      );
    }

    const now = new Date();
    const normalized = input.normalized;
    const provider = this.normalizeProvider(
      input.provider || channel.channelType,
    );
    await this.assertTenantCanReceiveProviderEvents(channel.tenantId, provider);
    const providerEventId = this.deriveProviderEventId(input, normalized);
    const eventType = this.deriveEventType(normalized);

    const result = await this.conversationRepository.manager.transaction(
      async (manager) => {
        const eventInsert = await manager
          .createQueryBuilder()
          .insert()
          .into(InboundProviderEvent)
          .values({
            provider,
            tenantId: channel.tenantId,
            channelId: channel.id,
            providerEventId,
            providerMessageId: normalized.externalMessageId || null,
            providerConversationId: normalized.externalConversationId || null,
            providerCustomerId: normalized.senderId || null,
            eventType,
            payloadHash: this.hashStablePayload({
              provider,
              channelId: channel.id,
              normalized,
            }),
            processingStatus: 'processing',
            occurredAt: this.providerOccurredAt(normalized, now),
            receivedAt: now,
            processedAt: null,
            messageId: null,
            failureCode: null,
          })
          .orIgnore()
          .execute();

        if (!eventInsert.identifiers.length) {
          const existingEvent = await manager.findOne(InboundProviderEvent, {
            where: { provider, channelId: channel.id, providerEventId },
          });
          const existingMessage = existingEvent?.messageId
            ? await manager.findOne(Message, {
                where: { id: existingEvent.messageId },
              })
            : null;
          return {
            accepted: true,
            duplicate: true,
            tenantId: channel.tenantId,
            channelId: channel.id,
            customerId: existingMessage?.senderId,
            conversationId: existingMessage?.conversationId,
            messageId: existingEvent?.messageId || existingMessage?.id,
            providerEventId,
            providerEventRecordId: existingEvent?.id,
          };
        }

        const providerEventRecord = await manager.findOneByOrFail(
          InboundProviderEvent,
          {
            provider,
            channelId: channel.id,
            providerEventId,
          },
        );

        if (this.isCallbackQuery(normalized)) {
          const customer = await this.upsertProviderCustomer(
            manager,
            channel,
            normalized,
            provider,
            now,
          );
          await manager.update(
            Customer,
            { id: customer.id },
            { botBlockedAt: null, botBlockedReason: null },
          );
          await manager.update(
            InboundProviderEvent,
            { id: providerEventRecord.id },
            {
              processingStatus: 'processed',
              processedAt: new Date(),
              messageId: null,
            },
          );
          return {
            accepted: true,
            duplicate: false,
            callbackQuery: true,
            tenantId: channel.tenantId,
            channelId: channel.id,
            customerId: customer.id,
            providerEventId,
            providerEventRecordId: providerEventRecord.id,
          };
        }

        let inboundReservation: { activePeriodId?: string | null } | undefined;
        if (isPeriodScopedEnforcementEnabled()) {
          try {
            const reservation =
              await this.usageLimitService.assertProviderMessageUsageAvailable(
                channel.tenantId,
                1,
                { manager, direction: 'inbound', now },
              );
            inboundReservation = reservation;
          } catch (error) {
            const code = this.quotaErrorCode(error);
            await manager.update(
              InboundProviderEvent,
              { id: providerEventRecord.id },
              {
                processingStatus: 'failed_terminal',
                processedAt: new Date(),
                failureCode: code,
                messageId: null,
              },
            );
            return {
              accepted: true,
              duplicate: false,
              quotaRejected: true,
              tenantId: channel.tenantId,
              channelId: channel.id,
              providerEventId,
              providerEventRecordId: providerEventRecord.id,
              rejectionCode: code,
            };
          }
        }

        const customer = await this.upsertProviderCustomer(
          manager,
          channel,
          normalized,
          provider,
          now,
        );
        const conversation = await this.upsertProviderConversation(
          manager,
          channel,
          customer,
          normalized,
          provider,
          now,
        );
        const messageInsert = await manager
          .createQueryBuilder()
          .insert()
          .into(Message)
          .values({
            conversationId: conversation.id,
            tenantId: channel.tenantId,
            channelId: channel.id,
            senderType: 'customer',
            senderId: customer.id,
            messageType: normalized.messageType || 'text',
            content: normalized.content,
            attachments: (await this.persistInboundAttachments(
              channel.tenantId,
              channel,
              customer.id,
              normalized.attachments || [],
            )) as Record<string, any>[],
            metadata: {
              ...(normalized.metadata || {}),
              provider,
              providerEventId,
              inboundProviderEventId: providerEventRecord.id,
              externalConversationId: normalized.externalConversationId,
              externalSenderId: normalized.senderId,
            } as Record<string, any>,
            provider,
            externalMessageId: normalized.externalMessageId,
            status: 'delivered',
          })
          .orIgnore()
          .execute();

        const insertedMessageId = messageInsert.identifiers[0]?.id
          ? String(messageInsert.identifiers[0].id)
          : undefined;
        const savedMessage = insertedMessageId
          ? await manager.findOneByOrFail(Message, {
              id: insertedMessageId,
            })
          : await manager.findOneByOrFail(Message, {
              provider,
              conversationId: conversation.id,
              externalMessageId: normalized.externalMessageId,
            });

        const insertedMessage = Boolean(messageInsert.identifiers.length);

        if (insertedMessage) {
          const { periodStart, periodEnd } = this.currentMonthlyPeriod();
          if (isPeriodScopedEnforcementEnabled()) {
            await this.usageLimitService.recordProviderMessageInTransaction(
              manager,
              channel.tenantId,
              {
                channelId: channel.id,
                provider,
                direction: 'inbound',
                source: 'provider_webhook',
                sourceEventId: providerEventRecord.id,
                sourceMessageId: savedMessage.id,
                metadata: {
                  eventId: providerEventId,
                  externalMessageId: normalized.externalMessageId,
                  externalConversationId: normalized.externalConversationId,
                },
                now,
              },
              inboundReservation,
            );
          } else {
            const subscriptionPeriodId = isShadowDualWriteEnabled()
              ? await this.entitlementResolver.resolveActivePeriodId(
                  channel.tenantId,
                  { manager, now },
                )
              : null;
            await manager.insert(TenantUsageEvent, {
              tenantId: channel.tenantId,
              channelId: channel.id,
              provider,
              usageType: 'provider_message',
              direction: 'inbound',
              quantity: 1,
              source: 'provider_webhook',
              requestMethod: null,
              requestPath: null,
              billingPeriodStart: periodStart,
              billingPeriodEnd: periodEnd,
              subscriptionPeriodId,
              sourceEventId: providerEventRecord.id,
              sourceMessageId: savedMessage.id,
              metadata: {
                eventId: providerEventId,
                externalMessageId: normalized.externalMessageId,
                externalConversationId: normalized.externalConversationId,
              } as Record<string, any>,
            });
          }
        }

        await manager.update(
          InboundProviderEvent,
          { id: providerEventRecord.id },
          {
            processingStatus: insertedMessage ? 'processed' : 'duplicate',
            processedAt: new Date(),
            messageId: savedMessage.id,
          },
        );

        await manager.update(
          Conversation,
          { id: conversation.id },
          {
            status: 'open',
            lastMessageAt: now,
            lastCustomerMessageAt: now,
          },
        );

        await manager.update(
          Customer,
          { id: customer.id },
          {
            lastContactAt: now,
          },
        );

        if (
          provider === 'telegram' &&
          [
            'credentials_verified',
            'webhook_registering',
            'awaiting_first_event',
          ].includes(String(channel.connectionStatus || ''))
        ) {
          await manager.update(
            TenantChannel,
            { id: channel.id },
            {
              connectionStatus: 'ready',
              status: 'active',
              firstInboundVerifiedAt: channel.firstInboundVerifiedAt || now,
              lastInboundAt: now,
              connectedAt: channel.connectedAt || now,
              configuration: {
                ...(channel.configuration || {}),
                firstInboundVerifiedAt: (
                  channel.firstInboundVerifiedAt || now
                ).toISOString(),
                lastInboundAt: now.toISOString(),
                providerApiCheckStatus: 'ready',
                nextRecommendedAction: 'ready',
              } as Record<string, any>,
            },
          );
        } else if (provider === 'telegram') {
          await manager.update(
            TenantChannel,
            { id: channel.id },
            { lastInboundAt: now },
          );
        }

        return {
          accepted: true,
          duplicate: !insertedMessage,
          tenantId: channel.tenantId,
          channelId: channel.id,
          customerId: customer.id,
          conversationId: conversation.id,
          messageId: savedMessage.id,
          providerEventId,
          providerEventRecordId: providerEventRecord.id,
        };
      },
    );

    if (!result.duplicate && result.conversationId) {
      const [conversation, customer, savedMessage] = await Promise.all([
        this.conversationRepository.findOneBy({ id: result.conversationId }),
        result.customerId
          ? this.customerRepository.findOneBy({ id: result.customerId })
          : Promise.resolve(null),
        result.messageId
          ? this.messageRepository.findOneBy({ id: result.messageId })
          : Promise.resolve(null),
      ]);
      if (conversation && customer) {
        await this.createInboundMessageNotifications(
          channel.tenantId,
          conversation,
          customer,
          normalized.content,
        );
      }
      if (savedMessage) {
        this.websocketService.emitNewMessage(
          channel.tenantId,
          result.conversationId,
          savedMessage,
        );
        this.websocketService.emitConversationUpdate(
          channel.tenantId,
          result.conversationId,
          {
            status: conversation?.status || 'open',
            lastMessageAt: conversation?.lastMessageAt || now,
            lastCustomerMessageAt: conversation?.lastCustomerMessageAt || now,
          },
        );
      }
    }

    return result;
  }

  async updateProviderMessageStatus(input: ProviderMessageStatusInput) {
    if (
      !input.messageId &&
      !input.externalMessageId &&
      input.channelId &&
      input.externalConversationId
    ) {
      return this.updateProviderConversationMessageStatuses(input);
    }

    const message = await this.findProviderMessage(input);

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const statusApplied = this.shouldApplyProviderStatus(
      message.status,
      input.status,
    );
    if (statusApplied) {
      message.status = input.status;
    }
    if (input.externalMessageId) {
      message.externalMessageId = input.externalMessageId;
    }
    message.metadata = this.withProviderDeliveryMetadata(
      message.metadata,
      input,
      statusApplied,
    );

    const savedMessage = await this.messageRepository.save(message);
    return {
      updated: true,
      messageId: savedMessage.id,
      externalMessageId: savedMessage.externalMessageId,
      status: savedMessage.status,
      statusApplied,
    };
  }

  private async assertTenantCanReceiveProviderEvents(
    tenantId: string,
    provider: string,
  ) {
    // Operational access is enforced by the purchased-period ledger: the
    // downstream provider-message quota assertion throws the proper
    // SUBSCRIPTION_PERIOD_* errors for period-less/pending tenants. The legacy
    // tenant_entitlements row is deprecated and does not exist for tenants
    // onboarded through the period flow, so it must not gate ingestion here.
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    const plan = tenant?.subscriptionPlanId
      ? await this.tenantRepository.manager
          .getRepository(SubscriptionPlan)
          .findOne({ where: { id: tenant.subscriptionPlanId } })
      : null;
    const allowedProviders = Array.isArray(plan?.allowedProviders)
      ? plan.allowedProviders
      : [];
    if (
      allowedProviders.length > 0 &&
      !allowedProviders.map((value) => value.toLowerCase()).includes(provider)
    ) {
      throw new HttpException(
        {
          code: 'PROVIDER_NOT_ALLOWED_IN_PLAN',
          message: `Provider ${provider} is not allowed by the active subscription plan.`,
          provider,
          allowedProviders,
          activePeriodId: null,
        },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private quotaErrorCode(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null) {
        const code = (response as { code?: unknown }).code;
        if (typeof code === 'string') return code;
      }
    }
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return 'INBOUND_MESSAGE_QUOTA_EXHAUSTED';
  }

  private async createInboundMessageNotifications(
    tenantId: string,
    conversation: Conversation,
    customer: Customer,
    preview: string,
  ) {
    const recipientIds = conversation.assignedAgentId
      ? [conversation.assignedAgentId]
      : (
          await this.tenantUserRepository.find({
            where: {
              tenantId,
              status: 'active',
            },
          })
        )
          .filter((user) =>
            ['owner', 'admin', 'supervisor'].includes(user.role),
          )
          .map((user) => user.id);

    if (!recipientIds.length) return;

    const snippet = preview?.trim()
      ? preview.trim().slice(0, 140)
      : 'New customer message received.';
    const notifications = recipientIds.map((userId) =>
      this.notificationRepository.create({
        tenantId,
        userId,
        type: 'info',
        title: 'New customer message',
        message: `${customer.fullName || customer.phone || customer.email || 'Customer'}: ${snippet}`,
        actionUrl: `/workspace/inbox?conversation=${conversation.id}`,
      }),
    );
    await this.notificationRepository.save(notifications);
  }

  private async findProviderMessage(input: ProviderMessageStatusInput) {
    if (input.messageId) {
      return this.messageRepository.findOne({ where: { id: input.messageId } });
    }

    if (!input.externalMessageId) {
      return null;
    }

    if (input.channelId && input.externalConversationId) {
      const conversation = await this.conversationRepository.findOne({
        where: {
          channelId: input.channelId,
          conversationId: input.externalConversationId,
        },
      });

      if (conversation) {
        return this.messageRepository.findOne({
          where: {
            conversationId: conversation.id,
            externalMessageId: input.externalMessageId,
          },
        });
      }

      return null;
    }

    return this.messageRepository.findOne({
      where: { externalMessageId: input.externalMessageId },
    });
  }

  private async updateProviderConversationMessageStatuses(
    input: ProviderMessageStatusInput,
  ) {
    const conversation = await this.conversationRepository.findOne({
      where: {
        channelId: input.channelId,
        conversationId: input.externalConversationId,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const messages = await this.messageRepository.find({
      where: {
        conversationId: conversation.id,
        senderType: 'agent',
      },
      order: { createdAt: 'ASC' },
    });
    const watermark = input.watermark ? new Date(input.watermark) : undefined;
    const matchingMessages = messages.filter((message) => {
      if (watermark && message.createdAt && message.createdAt > watermark) {
        return false;
      }
      return this.shouldApplyProviderStatus(message.status, input.status);
    });

    for (const message of matchingMessages) {
      message.status = input.status;
      message.metadata = this.withProviderDeliveryMetadata(
        message.metadata,
        input,
        true,
      );
    }

    if (matchingMessages.length > 0) {
      await this.messageRepository.save(matchingMessages);
    }

    return {
      updated: true,
      updatedCount: matchingMessages.length,
      conversationId: conversation.id,
      status: input.status,
      watermark: input.watermark,
    };
  }

  private shouldApplyProviderStatus(
    currentStatus: string,
    nextStatus: ProviderMessageStatusInput['status'],
  ) {
    if (currentStatus === nextStatus) return true;
    if (currentStatus === 'read') return false;
    if (currentStatus === 'failed') return false;
    if (currentStatus === 'delivered' && nextStatus === 'sent') return false;
    return true;
  }

  private withProviderDeliveryMetadata(
    metadata: Record<string, unknown> | undefined,
    input: ProviderMessageStatusInput,
    statusApplied: boolean,
  ) {
    const currentMetadata: Record<string, unknown> = metadata || {};
    const currentDelivery =
      currentMetadata.providerDelivery &&
      typeof currentMetadata.providerDelivery === 'object' &&
      !Array.isArray(currentMetadata.providerDelivery)
        ? (currentMetadata.providerDelivery as Record<string, unknown>)
        : {};
    const currentHistory: unknown[] = Array.isArray(currentDelivery.history)
      ? currentDelivery.history
      : [];
    const updatedAt = new Date().toISOString();
    const event = {
      provider: input.provider,
      status: input.status,
      providerStatus: input.providerStatus,
      providerError: input.providerError,
      retry: input.retry,
      providerMetadata: input.providerMetadata,
      watermark: input.watermark,
      statusApplied,
      receivedAt: updatedAt,
    };

    return {
      ...currentMetadata,
      providerDelivery: {
        ...currentDelivery,
        provider: input.provider,
        providerStatus: input.providerStatus,
        providerError: input.providerError,
        retry: input.retry,
        providerMetadata: input.providerMetadata,
        watermark: input.watermark,
        statusApplied,
        updatedAt,
        history: [...currentHistory, event].slice(-20),
      },
    };
  }

  /**
   * Download inbound provider attachments into file-storage and rewrite them
   * as stored refs, so threads and the media library read real fileIds.
   *
   * Without this, inbound media persists as raw provider refs the browser can
   * never resolve — Telegram `file_id`s, or Messenger CDN URLs that expire —
   * and never appears in media. Fail-soft per attachment: quota, oversize, or
   * provider hiccups keep the raw ref and the message still lands; a missing
   * preview must never eat the message. Gated by the same allowlist the
   * composer and send path enforce.
   */
  private readonly telegramFiles = new TelegramBotApiClient();

  private async persistInboundAttachments(
    tenantId: string,
    channel: TenantChannel,
    customerId: string,
    attachments: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    if (
      !Array.isArray(attachments) ||
      attachments.length === 0 ||
      !(MEDIA_MESSAGING_CHANNEL_TYPES as readonly string[]).includes(
        channel.channelType ?? '',
      )
    ) {
      return attachments;
    }

    const credentials = this.decryptChannelCredentials(channel);
    if (!credentials) return attachments;

    return Promise.all(
      attachments.map(async (attachment) => {
        try {
          const download =
            channel.channelType === 'telegram'
              ? await this.downloadTelegramAttachment(
                  attachment,
                  credentials.botToken,
                )
              : await this.downloadMessengerAttachment(attachment);
          if (!download) return attachment;

          const { bytes } = download;
          const providerFileName = download.fileName;
          const contentType = resolveInboundContentType(
            download.providerMime,
            download.downloadContentType,
            providerFileName,
            bytes,
          );
          if (!contentType) {
            // Nothing file-storage will accept — keep the raw ref rather than
            // firing a guaranteed-400 upload.
            console.warn(
              '[persistInboundAttachments] no usable content type, keeping raw provider ref',
              { tenantId, channelId: channel.id, fileName: providerFileName },
            );
            return attachment;
          }
          const hasExtension = /\.[a-z0-9]{2,5}$/i.test(providerFileName);
          const fileName = hasExtension
            ? providerFileName
            : `${providerFileName}${extensionForContentType(contentType)}`;
          const created = (await this.mediaLibraryService.createUpload(
            tenantId,
            customerId,
            {
              fileName,
              contentType,
              sizeBytes: bytes.length,
              purpose: 'message-media',
            },
          )) as {
            file: { id: string };
            upload: { url: string; headers?: Record<string, string> };
          };
          await fetch(created.upload.url, {
            method: 'PUT',
            headers: created.upload.headers,
            body: new Blob([new Uint8Array(bytes)], { type: contentType }),
          }).then((response) => {
            if (!response.ok) {
              throw new Error(`upload PUT ${response.status}`);
            }
          });
          return {
            ...attachment,
            fileId: created.file.id,
            fileName,
            contentType,
            sizeBytes: bytes.length,
            source: 'provider-inbound',
          };
        } catch (error) {
          // Fail-soft: the message must land even when media can't be stored.
          // Log so a broken preview is diagnosable without re-instrumenting.
          console.warn('[persistInboundAttachments] keeping raw provider ref', {
            tenantId,
            channelId: channel.id,
            provider: channel.channelType,
            attachmentType:
              typeof attachment?.type === 'string'
                ? attachment.type
                : undefined,
            error: error instanceof Error ? error.message : String(error),
          });
          return attachment;
        }
      }),
    );
  }

  /**
   * Decrypt the credentials the active provider's inbound media path needs.
   * Returns null when the channel cannot be used, which keeps the raw provider
   * ref instead of persisting media for a channel that can no longer send.
   */
  private decryptChannelCredentials(channel: TenantChannel): {
    botToken: string;
    pageAccessToken: string;
  } | null {
    try {
      const decrypted = decryptProviderCredentials(
        channel.credentials,
        process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
          process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY ||
          '',
      ) as { botToken?: string; pageAccessToken?: string };
      const botToken =
        typeof decrypted?.botToken === 'string' ? decrypted.botToken : '';
      const pageAccessToken =
        typeof decrypted?.pageAccessToken === 'string'
          ? decrypted.pageAccessToken
          : '';

      if (channel.channelType === 'telegram') {
        return botToken ? { botToken, pageAccessToken } : null;
      }
      if (channel.channelType === 'messenger') {
        return pageAccessToken ? { botToken, pageAccessToken } : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async downloadTelegramAttachment(
    attachment: Record<string, unknown>,
    botToken: string,
  ): Promise<InboundAttachmentDownload | null> {
    const rawProviderFile = attachment.providerFile;
    const providerFile =
      rawProviderFile && typeof rawProviderFile === 'object'
        ? (rawProviderFile as {
            file_id?: string;
            file_name?: string;
            mime_type?: string;
          })
        : undefined;
    const providerFileId =
      typeof providerFile?.file_id === 'string' ? providerFile.file_id : null;
    if (!providerFileId || !providerFile) return null;

    const { bytes, contentType } = await this.telegramFiles.downloadFile(
      botToken,
      providerFileId,
    );
    return {
      bytes,
      providerMime: providerFile.mime_type,
      downloadContentType: contentType,
      fileName:
        typeof providerFile.file_name === 'string' && providerFile.file_name
          ? providerFile.file_name
          : `telegram-${providerFileId.slice(0, 12)}`,
    };
  }

  /**
   * Messenger webhook attachments arrive as `{type, url}`: a signed CDN link
   * with no mime type and usually no filename, valid only briefly. Pull the
   * bytes now and let the shared content-type resolver label them.
   */
  private async downloadMessengerAttachment(
    attachment: Record<string, unknown>,
  ): Promise<InboundAttachmentDownload | null> {
    const url = typeof attachment.url === 'string' ? attachment.url.trim() : '';
    if (!url) return null;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(MESSENGER_ATTACHMENT_DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn('[persistInboundAttachments] messenger download failed', {
        status: response.status,
      });
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) return null;

    const type = typeof attachment.type === 'string' ? attachment.type : 'file';
    const hint =
      typeof attachment.fileName === 'string' ? attachment.fileName : '';
    return {
      bytes,
      providerMime: undefined,
      downloadContentType: response.headers.get('content-type') || '',
      fileName: messengerAttachmentFileName(hint, url, type),
    };
  }

  private async upsertProviderCustomer(
    manager: EntityManager,
    channel: TenantChannel,
    normalized: NormalizedProviderMessage,
    provider: string,
    now: Date,
  ) {
    await manager
      .createQueryBuilder()
      .insert()
      .into(Customer)
      .values({
        tenantId: channel.tenantId,
        channelId: channel.id,
        provider,
        externalId: normalized.senderId,
        fullName:
          normalized.senderDisplayName || `${provider} ${normalized.senderId}`,
        firstContactAt: now,
        lastContactAt: now,
        totalConversations: 0,
        profileData: {
          provider,
          externalSenderId: normalized.senderId,
        } as Record<string, any>,
      })
      .orIgnore()
      .execute();

    const customer = await manager.findOneByOrFail(Customer, {
      provider,
      channelId: channel.id,
      externalId: normalized.senderId,
    });
    customer.lastContactAt = now;
    const fallbackName = `${provider} ${normalized.senderId}`;
    const profileData = {
      ...(customer.profileData || {}),
      provider,
      externalSenderId: normalized.senderId,
    } as Record<string, any>;
    const providerName = normalized.senderDisplayName?.trim() || null;
    const previousProviderName =
      typeof profileData.providerDisplayName === 'string'
        ? profileData.providerDisplayName
        : null;
    // Adopt the provider's name unless an agent has deliberately renamed the
    // customer. The subset branch repairs names resolved before we started
    // requesting Meta's full `name` — "Ye San" is a subset of "Ye Htet San",
    // so the next inbound message upgrades it in place.
    if (
      providerName &&
      profileData.nameManuallyEdited !== true &&
      (!customer.fullName ||
        customer.fullName === fallbackName ||
        customer.fullName === previousProviderName ||
        isNameSubset(customer.fullName, providerName))
    ) {
      customer.fullName = providerName;
    } else if (!customer.fullName) {
      customer.fullName = fallbackName;
    }
    if (providerName) {
      profileData.providerDisplayName = providerName;
    }
    // Provider avatars are cached, never written to `avatarUrl`: Messenger's
    // CDN link expires, so the resolver re-checks it against Graph and this
    // value only spares it a call on the first render after ingest.
    if (normalized.senderAvatarUrl) {
      profileData.providerAvatarUrl = normalized.senderAvatarUrl;
      profileData.providerAvatarFetchedAt = now.toISOString();
      profileData.noProviderAvatar = false;
    }
    customer.profileData = profileData;
    customer.botBlockedAt = null;
    customer.botBlockedReason = null;
    return manager.save(Customer, customer);
  }

  private async upsertProviderConversation(
    manager: EntityManager,
    channel: TenantChannel,
    customer: Customer,
    normalized: NormalizedProviderMessage,
    provider: string,
    now: Date,
    markCustomerActivity = true,
  ) {
    const insert = await manager
      .createQueryBuilder()
      .insert()
      .into(Conversation)
      .values({
        tenantId: channel.tenantId,
        customerId: customer.id,
        channelId: channel.id,
        provider,
        conversationId: normalized.externalConversationId,
        status: 'open',
        priority: 'normal',
        firstMessageAt: now,
        lastMessageAt: now,
        lastCustomerMessageAt: markCustomerActivity ? now : undefined,
        metadata: {
          externalConversationId: normalized.externalConversationId,
        } as Record<string, any>,
      })
      .orIgnore()
      .execute();

    const conversation = await manager.findOneByOrFail(Conversation, {
      provider,
      channelId: channel.id,
      conversationId: normalized.externalConversationId,
    });
    if (insert.identifiers.length) {
      await manager.increment(
        Customer,
        { id: customer.id },
        'totalConversations',
        1,
      );
    }
    return conversation;
  }

  private normalizeProvider(provider: string) {
    return (provider || '').trim().toLowerCase() || 'unknown';
  }

  private deriveProviderEventId(
    input: ProviderIngestionInput,
    normalized: NormalizedProviderMessage,
  ) {
    const metadata = normalized.metadata || {};
    const native =
      this.stringValue(input.eventId) ||
      this.stringValue(metadata.providerEventId) ||
      this.stringValue(metadata.eventId);
    if (native) return native;

    if (normalized.externalMessageId) {
      return `message:${normalized.externalMessageId}`;
    }

    const stable = {
      provider: input.provider,
      channelId: input.channelId,
      externalConversationId: normalized.externalConversationId,
      senderId: normalized.senderId,
      messageType: normalized.messageType,
      content: normalized.content,
    };
    return `sha256:${this.hashStablePayload(stable)}`;
  }

  private deriveEventType(
    normalized: NormalizedProviderMessage,
  ): ProviderEventType {
    if (
      normalized.eventType === 'callback_query' ||
      normalized.metadata?.telegramCallbackQueryId
    ) {
      return 'callback_query';
    }
    const eventType = this.stringValue(normalized.metadata?.eventType);
    if (
      eventType &&
      [
        'message',
        'callback_query',
        'message_edit',
        'delivery',
        'read',
        'reaction',
        'conversation_update',
        'other',
      ].includes(eventType)
    ) {
      return eventType as ProviderEventType;
    }
    return 'message';
  }

  private isCallbackQuery(normalized: NormalizedProviderMessage) {
    return (
      normalized.eventType === 'callback_query' ||
      Boolean(normalized.metadata?.telegramCallbackQueryId)
    );
  }

  private providerOccurredAt(
    normalized: NormalizedProviderMessage,
    fallback: Date,
  ) {
    const metadata = normalized.metadata || {};
    const raw = metadata.providerTimestamp || metadata.occurredAt;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const timestamp = raw > 10_000_000_000 ? raw : raw * 1000;
      return new Date(timestamp);
    }
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return fallback;
  }

  private hashStablePayload(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private currentMonthlyPeriod(now = new Date()) {
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return { periodStart, periodEnd };
  }
}
