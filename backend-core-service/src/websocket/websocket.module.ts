import { Module, forwardRef } from '@nestjs/common';
import { AgentGateway } from './gateways/agent.gateway';
import { WebSocketService } from './websocket.service';
import { AuthModule } from '../auth/auth.module';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@Module({
  imports: [forwardRef(() => AuthModule)],
  providers: [AgentGateway, WebSocketService, WsJwtGuard],
  exports: [WebSocketService, WsJwtGuard],
})
export class WebSocketModule {}
