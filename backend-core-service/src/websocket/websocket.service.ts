import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { TenantUser } from '../auth/entities/tenant-user.entity';

@Injectable()
export class WebSocketService {
  private static readonly PRESENCE_GRACE_PERIOD_MS = 5_000;
  private servers = new Map<string, Server>();
  private connectedClients = new Map<string, Socket>();
  private presenceSockets = new Map<string, Set<string>>();
  private presenceUsers = new Map<
    string,
    { tenantId: string; userId: string }
  >();
  private presenceTimers = new Map<string, NodeJS.Timeout>();

  setServer(namespace: string, server: Server) {
    this.servers.set(namespace, server);
  }

  addClient(clientId: string, socket: Socket) {
    this.connectedClients.set(clientId, socket);
  }

  removeClient(clientId: string) {
    this.connectedClients.delete(clientId);
  }

  markPresenceOnline(socket: Socket, user: TenantUser) {
    const presenceKey = this.getPresenceKey(user.tenantId, user.id);
    const wasOnline =
      (this.presenceSockets.get(presenceKey)?.size || 0) > 0 ||
      this.presenceTimers.has(presenceKey);
    const pendingTimer = this.presenceTimers.get(presenceKey);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.presenceTimers.delete(presenceKey);
    }

    const sockets = this.presenceSockets.get(presenceKey) || new Set<string>();
    sockets.add(socket.id);
    this.presenceSockets.set(presenceKey, sockets);
    this.presenceUsers.set(presenceKey, {
      tenantId: user.tenantId,
      userId: user.id,
    });

    if (!wasOnline) {
      this.emitPresenceChange(user.tenantId, user.id, true);
    }
  }

  markPresenceOffline(socket: Socket, user: TenantUser) {
    const presenceKey = this.getPresenceKey(user.tenantId, user.id);
    const sockets = this.presenceSockets.get(presenceKey);
    if (!sockets) return;

    sockets.delete(socket.id);
    if (sockets.size > 0 || this.presenceTimers.has(presenceKey)) return;

    const timer = setTimeout(() => {
      this.presenceTimers.delete(presenceKey);
      const currentSockets = this.presenceSockets.get(presenceKey);
      if (currentSockets && currentSockets.size > 0) return;
      this.presenceSockets.delete(presenceKey);
      this.presenceUsers.delete(presenceKey);
      this.emitPresenceChange(user.tenantId, user.id, false);
    }, WebSocketService.PRESENCE_GRACE_PERIOD_MS);
    this.presenceTimers.set(presenceKey, timer);
  }

  forceOffline(tenantId: string, userId: string) {
    const presenceKey = this.getPresenceKey(tenantId, userId);
    const timer = this.presenceTimers.get(presenceKey);
    if (timer) {
      clearTimeout(timer);
      this.presenceTimers.delete(presenceKey);
    }
    this.presenceSockets.delete(presenceKey);
    this.presenceUsers.delete(presenceKey);
    this.emitPresenceChange(tenantId, userId, false);
  }

  getClient(clientId: string): Socket | undefined {
    return this.connectedClients.get(clientId);
  }

  // Emit to specific tenant room
  emitToTenant(tenantId: string, event: string, data: any) {
    this.emitToRoom(`tenant:${tenantId}`, event, data);
  }

  // Emit to specific agent
  emitToAgent(agentId: string, event: string, data: any) {
    this.emitToRoom(`agent:${agentId}`, event, data);
  }

  // Emit to conversation participants
  emitToConversation(conversationId: string, event: string, data: any) {
    this.emitToRoom(`conversation:${conversationId}`, event, data);
  }

  // Emit new message to relevant agents
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

  // Emit agent status change (Plan 35 shim: emit legacy `csr_*` event
  // alongside so pre-rename listeners keep working; remove next release).
  emitAgentStatusChange(tenantId: string, agentId: string, status: string) {
    this.emitToTenant(tenantId, 'agent_status_changed', {
      agentId,
      status,
    });
    this.emitToTenant(tenantId, 'csr_status_changed', {
      agentId,
      csrId: agentId,
      status,
    });
  }

  private emitToRoom(room: string, event: string, data: any) {
    this.servers.forEach((server) => {
      server.to(room).emit(event, data);
    });
  }

  // Get online agents for a tenant
  getOnlineAgents(tenantId: string): string[] {
    const onlineAgents: string[] = [];
    this.connectedClients.forEach((socket, clientId) => {
      const user = socket.data.user as TenantUser;
      if (user && user.tenantId === tenantId && user.role === 'agent') {
        onlineAgents.push(user.id);
      }
    });
    return onlineAgents;
  }

  getOnlineUserIds(tenantId: string): string[] {
    const onlineUserIds = new Set<string>();
    this.presenceUsers.forEach((user, presenceKey) => {
      if (user.tenantId !== tenantId) return;
      const sockets = this.presenceSockets.get(presenceKey);
      if (
        (sockets && sockets.size > 0) ||
        this.presenceTimers.has(presenceKey)
      ) {
        onlineUserIds.add(user.userId);
      }
    });
    return [...onlineUserIds];
  }

  private getPresenceKey(tenantId: string, userId: string) {
    return `${tenantId}:${userId}`;
  }

  private emitPresenceChange(
    tenantId: string,
    userId: string,
    isOnline: boolean,
  ) {
    this.emitToTenant(tenantId, 'presence_changed', { userId, isOnline });
  }
}
