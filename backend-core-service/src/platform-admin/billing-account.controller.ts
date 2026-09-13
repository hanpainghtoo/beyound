import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';
import { BillingAccountService } from './billing-account.service';
import {
  BillingAccountQueryDto,
  CreateBillingAccountDto,
  UpdateBillingAccountDto,
} from './dto/billing-account.dto';
import { BillingAccountResponseDto } from './dto/billing-account-response.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';

const billingAccountReaderRoles = [
  'super_admin',
  'ops_admin',
  'it_admin',
  'finance_viewer',
  'support_viewer',
  'read_only',
] as const;
const billingAccountWriterRoles = ['super_admin', 'ops_admin'] as const;

@ApiTags('Platform Admin - Billing Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform-admin/billing-accounts')
export class BillingAccountController {
  constructor(private readonly billingAccountService: BillingAccountService) {}

  @ApiOperation({ summary: 'List platform billing accounts' })
  @ApiResponse({
    status: 200,
    description: 'Billing accounts retrieved successfully',
  })
  @Roles(...billingAccountReaderRoles)
  @Get()
  async getAllBillingAccounts(
    @Query() query: BillingAccountQueryDto,
  ): Promise<PaginatedResult<BillingAccountResponseDto>> {
    return this.billingAccountService.getAllBillingAccounts(query);
  }

  @ApiOperation({ summary: 'Get a platform billing account by ID' })
  @ApiResponse({
    status: 200,
    type: BillingAccountResponseDto,
    description: 'Billing account retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Billing account not found' })
  @Roles(...billingAccountReaderRoles)
  @Get(':id')
  async getBillingAccountById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillingAccountResponseDto> {
    return this.billingAccountService.getBillingAccountById(id);
  }

  @ApiOperation({ summary: 'Create a platform billing account' })
  @ApiResponse({
    status: 201,
    type: BillingAccountResponseDto,
    description: 'Billing account created successfully',
  })
  @Roles(...billingAccountWriterRoles)
  @AuditLog({
    action: 'billing_account_created',
    resourceType: 'billing_account',
  })
  @Post()
  async createBillingAccount(
    @Body() dto: CreateBillingAccountDto,
    @Request() request: { user?: { id?: string } },
  ): Promise<BillingAccountResponseDto> {
    return this.billingAccountService.createBillingAccount(
      dto,
      request.user?.id || '',
    );
  }

  @ApiOperation({ summary: 'Update a platform billing account' })
  @ApiResponse({
    status: 200,
    type: BillingAccountResponseDto,
    description: 'Billing account updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Billing account not found' })
  @Roles(...billingAccountWriterRoles)
  @AuditLog({
    action: 'billing_account_updated',
    resourceType: 'billing_account',
  })
  @Patch(':id')
  async updateBillingAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBillingAccountDto,
    @Request() request: { user?: { id?: string } },
  ): Promise<BillingAccountResponseDto> {
    return this.billingAccountService.updateBillingAccount(
      id,
      dto,
      request.user?.id || '',
    );
  }

  @ApiOperation({
    summary: 'Soft-delete a platform billing account',
    description:
      'Marks the account inactive without removing its database row.',
  })
  @ApiResponse({
    status: 200,
    description: 'Billing account deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Billing account not found' })
  @Roles('super_admin')
  @AuditLog({
    action: 'billing_account_deleted',
    resourceType: 'billing_account',
  })
  @Delete(':id')
  async deleteBillingAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() request: { user?: { id?: string } },
  ): Promise<{ message: string }> {
    await this.billingAccountService.deleteBillingAccount(
      id,
      request.user?.id || '',
    );
    return { message: 'Billing account deleted successfully' };
  }

  @ApiOperation({
    summary: 'Activate a deactivated platform billing account',
    description: 'Re-enables an inactive billing account.',
  })
  @ApiResponse({
    status: 200,
    type: BillingAccountResponseDto,
    description: 'Billing account activated successfully',
  })
  @ApiResponse({ status: 404, description: 'Billing account not found' })
  @Roles(...billingAccountWriterRoles)
  @AuditLog({
    action: 'billing_account_activated',
    resourceType: 'billing_account',
  })
  @Post(':id/activate')
  async activateBillingAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() request: { user?: { id?: string } },
  ): Promise<BillingAccountResponseDto> {
    return this.billingAccountService.activateBillingAccount(
      id,
      request.user?.id || '',
    );
  }
}
