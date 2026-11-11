import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CustomerTagService, CustomerTagInput } from './customer-tag.service';

@ApiTags('Customer Tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('customer-tags')
export class CustomerTagController {
  constructor(private customerTagService: CustomerTagService) {}

  @ApiOperation({ summary: 'List tenant customer tags' })
  @ApiResponse({ status: 200, description: 'Customer tags retrieved' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get()
  list(@CurrentTenant() tenant: { id: string }) {
    return this.customerTagService.list(tenant.id);
  }

  @ApiOperation({ summary: 'Create a customer tag' })
  @ApiResponse({ status: 201, description: 'Customer tag created' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Post()
  create(
    @CurrentTenant() tenant: { id: string },
    @Body() body: CustomerTagInput,
  ) {
    return this.customerTagService.create(tenant.id, body);
  }

  @ApiOperation({ summary: 'Rename a customer tag' })
  @ApiResponse({ status: 200, description: 'Customer tag renamed' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Patch(':id')
  rename(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CustomerTagInput,
  ) {
    return this.customerTagService.rename(tenant.id, id, body);
  }

  @ApiOperation({ summary: 'Delete a customer tag' })
  @ApiResponse({ status: 200, description: 'Customer tag deleted' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Delete(':id')
  remove(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerTagService.remove(tenant.id, id);
  }
}
