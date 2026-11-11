import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AllowExpiredAccess } from '../common/decorators/allow-expired-access.decorator';
import { tenantBillingRoles } from '../common/constants/tenant-roles';
import { SubscriptionAddOnService } from './subscription-add-on.service';
import { AddOnProductResponseDto } from './dto/add-on-product-response.dto';

@ApiTags('Tenant - Top-Up Catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
@Controller('tenant/add-on-products')
export class TenantAddOnCatalogController {
  constructor(private readonly addOnService: SubscriptionAddOnService) {}

  @ApiOperation({
    summary: 'List published top-up products available to this workspace',
  })
  @ApiResponse({ status: 200, type: AddOnProductResponseDto, isArray: true })
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @Get()
  async listProducts(): Promise<AddOnProductResponseDto[]> {
    return this.addOnService.listActiveProducts();
  }
}
