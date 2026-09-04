import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtGuard } from '../guards/ws-jwt.guard';
import { WebSocketService } from '../websocket.service';
import type { TenantUser } from '../../auth/entities/tenant-user.entity';

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
  namespace: '/csrs',
})
@UseGuards(WsJwtGuard)
export class CsrGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger(CsrGateway.name);

  constructor(
    private readonly websocketService: WebSocketService,
    private readonly wsJwtGuard: WsJwtGuard,
  ) {}

  afterInit(server: Server) {
    this.websocketService.setServer('csrs', server);
    this.logger.log('CSR WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const user = (await this.wsJwtGuard.authenticateClient(
        client,
      )) as TenantUser;
      if (!user || user.role !== 'csr') {
        client.disconnect();
        return;
      }

      this.websocketService.addClient(client.id, client);

      // Join tenant and csr rooms
      await client.join(`tenant:${user.tenantId}`);
      await client.join(`csr:${user.id}`);

      this.logger.log(
        `CSR connected: ${client.id} (CSR: ${user.id}, Tenant: ${user.tenantId})`,
      );

      // Emit csr online status
      this.websocketService.emitCsrStatusChange(
        user.tenantId,
        user.id,
        'online',
      );
    } catch (error) {
      this.logger.error('CSR connection error:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user as TenantUser;
    if (user) {
      this.websocketService.removeClient(client.id);

      // Emit csr offline status
      this.websocketService.emitCsrStatusChange(
        user.tenantId,
        user.id,
        'offline',
      );

      this.logger.log(`CSR disconnected: ${client.id} (CSR: ${user.id})`);
    }
  }

  handleUpdateStatus(
    client: Socket,
    data: { status: 'available' | 'busy' | 'away' },
  ) {
    const user = client.data.user as TenantUser;
    const { status } = data;

    // Update csr status in database (you might want to add this to your csr service)
    // await this.csrService.updateStatus(user.id, status);

    // Emit status change to other csrs and admins
    this.websocketService.emitCsrStatusChange(user.tenantId, user.id, status);

    client.emit('status_updated', { status });
    this.logger.log(`CSR ${user.id} status updated to: ${status}`);
  }

  handleGetOnlineCsrs(client: Socket) {
    const user = client.data.user as TenantUser;
    const onlineCsrs = this.websocketService.getOnlineCsrs(user.tenantId);

    client.emit('online_csrs', { csrs: onlineCsrs });
  }
}
