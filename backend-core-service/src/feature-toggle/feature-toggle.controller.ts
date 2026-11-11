import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { FeatureToggleService } from './feature-toggle.service';
import {
  SetTenantFeatureParamDto,
  TenantFeatureListDto,
  UpdateTenantFeatureDto,
} from './dto/tenant-feature.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AllowExpiredAccess } from '../common/decorators/allow-expired-access.decorator';
import { tenantFeatureToggleRoles } from '../common/constants/tenant-roles';

@ApiTags('Tenant Features')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
@Controller('tenant/features')
export class FeatureToggleController {
  constructor(private readonly featureToggleService: FeatureToggleService) {}

  @ApiOperation({
    summary: 'List feature toggles for the current tenant',
    description:
      'Readable by every tenant user so navigation can hide disabled modules.',
  })
  @ApiResponse({ status: 200, type: TenantFeatureListDto })
  @AllowExpiredAccess()
  @Get()
  async list(
    @CurrentTenant() tenant: { id: string },
  ): Promise<TenantFeatureListDto> {
    const features = await this.featureToggleService.getForTenant(tenant.id);
    return { features };
  }

  @ApiOperation({
    summary: 'Enable or disable a tenant feature toggle',
    description:
      'Owner/admin only. Disabling a module cascades to its dependents; re-enabling a module never restores its dependents.',
  })
  @ApiResponse({ status: 200, type: TenantFeatureListDto })
  @ApiResponse({ status: 400, description: 'Unknown or locked feature' })
  @Roles(...tenantFeatureToggleRoles)
  @Patch(':key')
  async update(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id?: string },
    @Param() params: SetTenantFeatureParamDto,
    @Body() body: UpdateTenantFeatureDto,
  ): Promise<TenantFeatureListDto> {
    const features = await this.featureToggleService.setEnabled(
      tenant.id,
      params.key,
      body.isEnabled,
      user?.id ?? null,
    );
    return { features };
  }
}
