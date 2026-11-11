import type { Message } from './entities/message.entity';

export const INTERNAL_SYSTEM_EVENT_TYPE = 'system_event';

export function isInternalSystemMessage(
  message: Pick<Message, 'senderType' | 'messageType' | 'isInternal'>,
) {
  return (
    message.senderType === 'system' &&
    message.messageType === INTERNAL_SYSTEM_EVENT_TYPE &&
    message.isInternal === true
  );
}

export type ShoppingStage =
  | 'browsing'
  | 'checkout'
  | 'awaiting_payment'
  | 'payment_submitted'
  | 'confirmed'
  | null;

export const TELEGRAM_BROWSE_VISIT_WINDOW_MS = 30 * 60 * 1000;

export function telegramShoppingIdentityKey(
  channelId: string,
  senderId: string,
  externalConversationId: string,
) {
  return `${channelId}:${senderId}:${externalConversationId}`;
}

export function resolveTelegramBrowseVisitId(
  previousVisitId: unknown,
  previousLastActivityAt: unknown,
  candidateVisitId: string,
  now: Date,
) {
  if (
    typeof previousVisitId === 'string' &&
    typeof previousLastActivityAt === 'string' &&
    now.getTime() - new Date(previousLastActivityAt).getTime() <=
      TELEGRAM_BROWSE_VISIT_WINDOW_MS
  ) {
    return previousVisitId;
  }
  return candidateVisitId;
}

export type ShoppingActivityMetadata = {
  shoppingStage?: ShoppingStage;
  shoppingStageUpdatedAt?: string | null;
  needsAttention?: boolean;
  attentionReason?: string | null;
  attentionAt?: string | null;
  lastShoppingActivityAt?: string | null;
  newShoppingActivity?: boolean;
};

export function getShoppingActivityMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ShoppingActivityMetadata {
  const value = metadata || {};
  return {
    shoppingStage:
      value.shoppingStage === 'browsing' ||
      value.shoppingStage === 'checkout' ||
      value.shoppingStage === 'awaiting_payment' ||
      value.shoppingStage === 'payment_submitted' ||
      value.shoppingStage === 'confirmed'
        ? value.shoppingStage
        : null,
    shoppingStageUpdatedAt:
      typeof value.shoppingStageUpdatedAt === 'string'
        ? value.shoppingStageUpdatedAt
        : null,
    needsAttention: value.needsAttention === true,
    attentionReason:
      typeof value.attentionReason === 'string' ? value.attentionReason : null,
    attentionAt:
      typeof value.attentionAt === 'string' ? value.attentionAt : null,
    lastShoppingActivityAt:
      typeof value.lastShoppingActivityAt === 'string'
        ? value.lastShoppingActivityAt
        : null,
    newShoppingActivity: value.newShoppingActivity === true,
  };
}

export function withShoppingActivityMetadata(
  metadata: Record<string, unknown> | null | undefined,
  patch: ShoppingActivityMetadata,
) {
  return {
    ...(metadata || {}),
    ...patch,
  };
}

export function conversationShoppingFields(
  metadata: Record<string, unknown> | null | undefined,
) {
  return getShoppingActivityMetadata(metadata);
}
