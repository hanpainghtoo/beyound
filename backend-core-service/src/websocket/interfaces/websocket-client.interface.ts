import type { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  userId: string;
  tenantId: string;
  userType: 'platform_admin' | 'tenant_admin' | 'csr' | 'customer';
  role?: string;
}

export interface SocketRoom {
  tenantId: string;
  conversationId?: string;
  csrId?: string;
}

export interface WebSocketResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}
