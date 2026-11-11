import { WebSocketService } from './websocket.service';

describe('WebSocketService', () => {
  it('emits tenant events to every registered namespace server', () => {
    const service = new WebSocketService();
    const agentsEmit = jest.fn();
    const conversationsEmit = jest.fn();

    service.setServer('agents', {
      to: jest.fn().mockReturnValue({ emit: agentsEmit }),
    } as any);
    service.setServer('conversations', {
      to: jest.fn().mockReturnValue({ emit: conversationsEmit }),
    } as any);

    service.emitNewMessage('tenant-1', 'conversation-1', { id: 'message-1' });

    expect(agentsEmit).toHaveBeenCalledWith('new_message', {
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

  it('keeps a user online while another tab is still connected', () => {
    jest.useFakeTimers();
    try {
      const service = new WebSocketService();
      const presenceEmit = jest.fn();
      service.setServer('conversations', {
        to: jest.fn().mockReturnValue({ emit: presenceEmit }),
      } as any);
      const user = { id: 'user-1', tenantId: 'tenant-1' } as any;
      const firstTab = { id: 'socket-1' } as any;
      const secondTab = { id: 'socket-2' } as any;

      service.markPresenceOnline(firstTab, user);
      service.markPresenceOnline(secondTab, user);
      service.markPresenceOffline(firstTab, user);
      jest.advanceTimersByTime(5_000);

      expect(service.getOnlineUserIds('tenant-1')).toEqual(['user-1']);
      expect(presenceEmit).toHaveBeenCalledTimes(1);
      expect(presenceEmit).toHaveBeenLastCalledWith('presence_changed', {
        userId: 'user-1',
        isOnline: true,
      });

      service.markPresenceOffline(secondTab, user);
      jest.advanceTimersByTime(4_999);
      expect(service.getOnlineUserIds('tenant-1')).toEqual(['user-1']);
      jest.advanceTimersByTime(1);

      expect(service.getOnlineUserIds('tenant-1')).toEqual([]);
      expect(presenceEmit).toHaveBeenLastCalledWith('presence_changed', {
        userId: 'user-1',
        isOnline: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
