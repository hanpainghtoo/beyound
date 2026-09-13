import { WebSocketService } from './websocket.service';

describe('WebSocketService', () => {
  it('emits tenant events to every registered namespace server', () => {
    const service = new WebSocketService();
    const csrsEmit = jest.fn();
    const conversationsEmit = jest.fn();

    service.setServer('csrs', {
      to: jest.fn().mockReturnValue({ emit: csrsEmit }),
    } as any);
    service.setServer('conversations', {
      to: jest.fn().mockReturnValue({ emit: conversationsEmit }),
    } as any);

    service.emitNewMessage('tenant-1', 'conversation-1', { id: 'message-1' });

    expect(csrsEmit).toHaveBeenCalledWith('new_message', {
      conversationId: 'conversation-1',
      message: { id: 'message-1' },
    });
    expect(conversationsEmit).toHaveBeenCalledWith('new_message', {
      conversationId: 'conversation-1',
      message: { id: 'message-1' },
    });
  });

  it('does not throw before websocket namespaces are initialized', () => {
    const service = new WebSocketService();

    expect(() =>
      service.emitConversationUpdate('tenant-1', 'conversation-1', {
        status: 'open',
      }),
    ).not.toThrow();
  });
});
