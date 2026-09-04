import { Module, forwardRef } from '@nestjs/common';
import { ConversationGateway } from './gateways/conversation.gateway';
import { CsrGateway } from './gateways/csr.gateway';
import { WebSocketService } from './websocket.service';
import { AuthModule } from '../auth/auth.module';
import { ConversationModule } from '../conversation/conversation.module';
import { TenantModule } from '../tenant/tenant.module';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@Module({
  imports: [AuthModule, forwardRef(() => ConversationModule), TenantModule],
  providers: [ConversationGateway, CsrGateway, WebSocketService, WsJwtGuard],
  exports: [WebSocketService],
})
export class WebSocketModule {}
