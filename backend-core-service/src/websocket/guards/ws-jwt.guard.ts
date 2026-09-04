import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private logger = new Logger(WsJwtGuard.name);

  constructor(
    private jwtService: JwtService,
    private authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient<Socket>();
      await this.authenticateClient(client);
      return true;
    } catch (error) {
      this.logger.error('WebSocket authentication failed:', error.message);
      throw new WsException('Authentication failed');
    }
  }

  async authenticateClient(client: Socket) {
    const authToken = this.extractTokenFromHandshake(client);

    if (!authToken) {
      throw new WsException('No token provided');
    }

    const payload = this.jwtService.verify(authToken);
    const user = await this.authService.validateJwtPayload(payload);

    if (!user) {
      throw new WsException('Invalid token');
    }

    client.data.user = user;
    return user;
  }

  private extractTokenFromHandshake(client: Socket): string | null {
    const token =
      client.handshake.auth?.token || client.handshake.headers?.authorization;

    if (!token) {
      return null;
    }

    // Handle "Bearer TOKEN" format
    if (token.startsWith('Bearer ')) {
      return token.substring(7);
    }

    return token;
  }
}
