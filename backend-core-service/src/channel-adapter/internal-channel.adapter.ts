import {
  ChannelAdapter,
  ChannelAdapterSendInput,
  ChannelAdapterSendResult,
  NormalizedInboundMessage,
} from './channel-adapter.types';

export class InternalChannelAdapter implements ChannelAdapter {
  readonly type = 'internal';

  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    return { valid: true, errors: [] };
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
    return {
      externalMessageId: `internal-${input.conversationId}-${Date.now()}`,
      status: 'sent',
    };
  }
}
