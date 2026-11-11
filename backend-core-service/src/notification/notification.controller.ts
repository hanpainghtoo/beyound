import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { NotificationService } from './notification.service';
import { tenantOperationalRoles } from '../common/constants/tenant-roles';

@ApiTags('Agent Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(...tenantOperationalRoles)
@Controller('agent/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the authenticated Agent' })
  list(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.notificationService.list(tenant.id, user.id);
  }

  @Post('read-all')
  @ApiOperation({
    summary: 'Mark all authenticated Agent notifications as read',
  })
  markAllRead(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.notificationService.markAllRead(tenant.id, user.id);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark an authenticated Agent notification as read' })
  markRead(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationService.markRead(
      tenant.id,
      user.id,
      notificationId,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an authenticated Agent notification' })
  remove(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationService.remove(tenant.id, user.id, notificationId);
  }
}
