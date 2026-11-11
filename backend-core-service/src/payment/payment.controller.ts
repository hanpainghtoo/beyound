import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentService, PaymentMethodInput } from './payment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaymentImageUploadDto } from './dto/payment-image-upload.dto';

@ApiTags('Payment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller()
export class PaymentController {
  constructor(private readonly service: PaymentService) {}
  @Get('tenant/payment-methods')
  @Roles('owner', 'admin', 'supervisor', 'agent')
  getCurrent(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: any,
  ) {
    return this.settingsWithPermission(tenant.id, user);
  }
  @Post('tenant/payment-methods')
  @Roles('owner', 'admin', 'supervisor', 'agent')
  saveCurrent(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: any,
    @Body()
    body: { expectedVersion: number | null; methods: PaymentMethodInput[] },
  ) {
    return this.service.saveAndPublish(tenant.id, user.id, user.role, body);
  }
  @Get('tenants/:tenantId/payment-methods')
  @Roles('owner', 'admin', 'supervisor', 'agent')
  get(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    return this.settingsWithPermission(tenantId, user);
  }
  @Post('tenants/:tenantId/payment-methods')
  @Roles('owner', 'admin', 'supervisor', 'agent')
  save(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Body()
    body: { expectedVersion: number | null; methods: PaymentMethodInput[] },
  ) {
    return this.service.saveAndPublish(tenantId, user.id, user.role, body);
  }
  @Post('tenant/payment-methods/image-upload')
  @Roles('owner', 'admin', 'supervisor')
  createImageUpload(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: any,
    @Body() input: PaymentImageUploadDto,
  ) {
    return this.service.createImageUpload(tenant.id, user.id, user.role, input);
  }
  @Post('orders/:orderId/payment-method')
  @Roles('owner', 'admin', 'supervisor', 'agent')
  select(
    @CurrentTenant() tenant: { id: string },
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: any,
    @Body('methodId') methodId: string,
  ) {
    return this.service.selectMethod(tenant.id, orderId, methodId, user.id);
  }

  private async settingsWithPermission(tenantId: string, user: any) {
    const canEdit =
      ['owner', 'admin'].includes(user.role) ||
      user.permissions?.['tenant.payment_methods.edit'] === true;
    return { ...(await this.service.getSettings(tenantId, canEdit)), canEdit };
  }
}
