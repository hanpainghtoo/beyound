import type { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  userId: string;
  tenantId: string;
  userType: 'platform_admin' | 'tenant_admin' | 'agent' | 'customer';
  role?: string;
}

export interface SocketRoom {
  tenantId: string;
  conversationId?: string;
  agentId?: string;
}

export interface WebSocketResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}
