import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { TenantUser } from '../auth/entities/tenant-user.entity';

@Injectable()
export class WebSocketService {
  private servers = new Map<string, Server>();
  private connectedClients = new Map<string, Socket>();

  setServer(namespace: string, server: Server) {
    this.servers.set(namespace, server);
  }

  addClient(clientId: string, socket: Socket) {
    this.connectedClients.set(clientId, socket);
  }

  removeClient(clientId: string) {
    this.connectedClients.delete(clientId);
  }

  getClient(clientId: string): Socket | undefined {
    return this.connectedClients.get(clientId);
  }

  // Emit to specific tenant room
  emitToTenant(tenantId: string, event: string, data: any) {
    this.emitToRoom(`tenant:${tenantId}`, event, data);
  }

  // Emit to specific csr
  emitToCsr(csrId: string, event: string, data: any) {
    this.emitToRoom(`csr:${csrId}`, event, data);
  }

  // Emit to conversation participants
  emitToConversation(conversationId: string, event: string, data: any) {
    this.emitToRoom(`conversation:${conversationId}`, event, data);
  }

  // Emit new message to relevant csrs
  emitNewMessage(tenantId: string, conversationId: string, message: any) {
    this.emitToTenant(tenantId, 'new_message', {
      conversationId,
      message,
    });
  }

  // Emit conversation status update
  emitConversationUpdate(
    tenantId: string,
    conversationId: string,
    update: any,
  ) {
    this.emitToTenant(tenantId, 'conversation_updated', {
      conversationId,
      update,
    });
  }

  // Emit csr status change
  emitCsrStatusChange(tenantId: string, csrId: string, status: string) {
    this.emitToTenant(tenantId, 'csr_status_changed', {
      csrId,
      status,
    });
  }

  private emitToRoom(room: string, event: string, data: any) {
    this.servers.forEach((server) => {
      server.to(room).emit(event, data);
    });
  }

  // Get online csrs for a tenant
  getOnlineCsrs(tenantId: string): string[] {
    const onlineCsrs: string[] = [];
    this.connectedClients.forEach((socket, clientId) => {
      const user = socket.data.user as TenantUser;
      if (user && user.tenantId === tenantId && user.role === 'csr') {
        onlineCsrs.push(user.id);
      }
    });
    return onlineCsrs;
  }
}
