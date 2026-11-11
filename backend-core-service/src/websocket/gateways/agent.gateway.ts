import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtGuard } from '../guards/ws-jwt.guard';
import { WebSocketService } from '../websocket.service';
import type { TenantUser } from '../../auth/entities/tenant-user.entity';

/**
 * Roles admitted to the agent inbox socket. Mirrors the `@Roles` on the
 * conversations REST endpoints (`owner`, `admin`, `supervisor`, `agent`):
 * the socket carries the same tenant-scoped conversation/message events
 * those endpoints already serve, so gating narrower leaks nothing but
 * realtime. A previous `!== 'agent'` check admitted nobody at all — zero
 * `agent`-role users are seeded and supervisors, who work this queue daily,
 * were silently dropped to polling with an "Offline" badge.
 */
const AGENT_INBOX_SOCKET_ROLES = ['owner', 'admin', 'supervisor', 'agent'];

@WebSocketGateway({
  cors: {
    origin: (() => {
      const origins = (
        process.env.FRONTEND_URLS ||
        process.env.FRONTEND_URL ||
        ''
      )
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
      return origins.length > 0 ? origins : false;
    })(),
    credentials: true,
  },
  namespace: '/agents',
})
@UseGuards(WsJwtGuard)
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger(AgentGateway.name);

  constructor(
    private readonly websocketService: WebSocketService,
    private readonly wsJwtGuard: WsJwtGuard,
  ) {}

  afterInit(server: Server) {
    this.websocketService.setServer('agents', server);
    this.logger.log('Agent WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const user = (await this.wsJwtGuard.authenticateClient(
        client,
      )) as TenantUser;
      if (!user || !AGENT_INBOX_SOCKET_ROLES.includes(user.role)) {
        client.disconnect();
        return;
      }

      this.websocketService.addClient(client.id, client);

      // Join tenant and agent rooms
      await client.join(`tenant:${user.tenantId}`);
      await client.join(`agent:${user.id}`);

      this.websocketService.markPresenceOnline(client, user);

      this.logger.log(
        `Agent connected: ${client.id} (Agent: ${user.id}, Tenant: ${user.tenantId})`,
      );

      // Emit agent online status
      this.websocketService.emitAgentStatusChange(
        user.tenantId,
        user.id,
        'online',
      );
    } catch (error) {
      this.logger.error('Agent connection error:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user as TenantUser;
    if (user) {
      this.websocketService.removeClient(client.id);
      this.websocketService.markPresenceOffline(client, user);

      // Emit agent offline status
      this.websocketService.emitAgentStatusChange(
        user.tenantId,
        user.id,
        'offline',
      );

      this.logger.log(`Agent disconnected: ${client.id} (Agent: ${user.id})`);
    }
  }

  handleUpdateStatus(
    client: Socket,
    data: { status: 'available' | 'busy' | 'away' },
  ) {
    const user = client.data.user as TenantUser;
    const { status } = data;

    // Update agent status in database (you might want to add this to your agent service)
    // await this.agentService.updateStatus(user.id, status);

    // Emit status change to other agents and admins
    this.websocketService.emitAgentStatusChange(user.tenantId, user.id, status);

    client.emit('status_updated', { status });
    this.logger.log(`Agent ${user.id} status updated to: ${status}`);
  }

  handleGetOnlineAgents(client: Socket) {
    const user = client.data.user as TenantUser;
    const onlineAgents = this.websocketService.getOnlineAgents(user.tenantId);

    client.emit('online_agents', { agents: onlineAgents });
  }

  @SubscribeMessage('get_presence')
  handleGetPresence(client: Socket) {
    const user = client.data.user as TenantUser;
    return { userIds: this.websocketService.getOnlineUserIds(user.tenantId) };
  }
}
