export type NormalizedInboundMessage = {
  externalMessageId?: string;
  externalConversationId?: string;
  senderId?: string;
  content?: string;
  messageType: string;
  attachments: Record<string, any>[];
  metadata: Record<string, any>;
};

export type ChannelAdapterSendInput = {
  channelId: string;
  conversationId: string;
  recipientId?: string;
  content: string;
  messageType?: string;
  attachments?: Record<string, any>[];
  metadata?: Record<string, any>;
  credentials?: Record<string, any>;
};

export type ChannelAdapterSendResult = {
  externalMessageId?: string;
  status: 'sent' | 'failed' | 'delivery_unknown';
  metadata?: Record<string, any>;
};

export type ChannelAdapterValidationResult = {
  valid: boolean;
  errors: string[];
  status?: string;
  verifiedIdentity?: Record<string, any>;
  metadata?: Record<string, any>;
};

export interface ChannelAdapter {
  readonly type: string;
  validateConfig(
    configuration: Record<string, any>,
    credentials?: Record<string, any>,
  ): Promise<ChannelAdapterValidationResult>;
  normalizeInbound(
    payload: Record<string, any>,
  ): Promise<NormalizedInboundMessage>;
  sendMessage(
    input: ChannelAdapterSendInput,
  ): Promise<ChannelAdapterSendResult>;
}
