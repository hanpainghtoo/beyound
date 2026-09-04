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
import { ConversationService } from '../../conversation/conversation.service';
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
  namespace: '/conversations',
})
@UseGuards(WsJwtGuard)
export class ConversationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger(ConversationGateway.name);

  constructor(
    private readonly websocketService: WebSocketService,
    private readonly conversationService: ConversationService,
    private readonly wsJwtGuard: WsJwtGuard,
  ) {}

  afterInit(server: Server) {
    this.websocketService.setServer('conversations', server);
    this.logger.log('Conversation WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const user = (await this.wsJwtGuard.authenticateClient(
        client,
      )) as TenantUser;
      if (!user) {
        client.disconnect();
        return;
      }

      this.websocketService.addClient(client.id, client);

      // Join tenant room
      await client.join(`tenant:${user.tenantId}`);

      // Join csr-specific room if user is an csr
      if (user.role === 'csr') {
        await client.join(`csr:${user.id}`);
      }

      this.logger.log(
        `Client connected: ${client.id} (User: ${user.id}, Tenant: ${user.tenantId})`,
      );

      // Emit csr online status
      if (user.role === 'csr') {
        this.websocketService.emitCsrStatusChange(
          user.tenantId,
          user.id,
          'online',
        );
      }
    } catch (error) {
      this.logger.error('Connection error:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user as TenantUser;
    if (user) {
      this.websocketService.removeClient(client.id);

      // Emit csr offline status
      if (user.role === 'csr') {
        this.websocketService.emitCsrStatusChange(
          user.tenantId,
          user.id,
          'offline',
        );
      }

      this.logger.log(`Client disconnected: ${client.id} (User: ${user.id})`);
    }
  }

  async handleJoinConversation(
    client: Socket,
    data: { conversationId: string },
  ) {
    const user = client.data.user as TenantUser;
    const { conversationId } = data;

    try {
      // Verify user has access to this conversation
      const conversation = await this.conversationService.findOne(
        conversationId,
        user.tenantId,
      );
      if (!conversation) {
        client.emit('error', { message: 'Conversation not found' });
        return;
      }

      client.join(`conversation:${conversationId}`);
      client.emit('joined_conversation', { conversationId });

      this.logger.log(`User ${user.id} joined conversation ${conversationId}`);
    } catch (error) {
      this.logger.error('Error joining conversation:', error);
      client.emit('error', { message: 'Failed to join conversation' });
    }
  }

  handleLeaveConversation(client: Socket, data: { conversationId: string }) {
    const { conversationId } = data;
    client.leave(`conversation:${conversationId}`);
    client.emit('left_conversation', { conversationId });
  }

  handleTypingStart(client: Socket, data: { conversationId: string }) {
    const user = client.data.user as TenantUser;
    const { conversationId } = data;

    client.to(`conversation:${conversationId}`).emit('user_typing', {
      conversationId,
      userId: user.id,
      userName: user.firstName + ' ' + user.lastName,
      isTyping: true,
    });
  }

  handleTypingStop(client: Socket, data: { conversationId: string }) {
    const user = client.data.user as TenantUser;
    const { conversationId } = data;

    client.to(`conversation:${conversationId}`).emit('user_typing', {
      conversationId,
      userId: user.id,
      userName: user.firstName + ' ' + user.lastName,
      isTyping: false,
    });
  }
}
