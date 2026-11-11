import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { SubscriptionAddOnService } from './subscription-add-on.service';
import { CreateAddOnProductDto } from './dto/create-add-on-product.dto';
import { UpdateAddOnProductDto } from './dto/update-add-on-product.dto';
import { AddOnProductResponseDto } from './dto/add-on-product-response.dto';

const catalogReaderRoles = [
  'super_admin',
  'ops_admin',
  'it_admin',
  'finance_viewer',
  'support_viewer',
  'read_only',
] as const;
const catalogWriterRoles = ['super_admin', 'ops_admin'] as const;

/**
 * Platform-admin top-up catalog. Tenant-scoped routes are intentionally absent:
 * the catalog is a platform-owned sellable catalog, and no refund or
 * cancellation operations are exposed (out of scope for the catalog phase).
 */
@ApiTags('Platform Admin - Top-Up Catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform-admin/add-on-products')
export class SubscriptionAddOnController {
  constructor(private addOnService: SubscriptionAddOnService) {}

  @ApiOperation({ summary: 'List top-up catalog products with all components' })
  @ApiResponse({ status: 200, type: AddOnProductResponseDto, isArray: true })
  @Roles(...catalogReaderRoles)
  @Get()
  async listProducts(): Promise<AddOnProductResponseDto[]> {
    return this.addOnService.listProducts();
  }

  @ApiOperation({ summary: 'Get a top-up product with all components' })
  @ApiResponse({ status: 200, type: AddOnProductResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @Roles(...catalogReaderRoles)
  @Get(':id')
  async getProduct(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AddOnProductResponseDto> {
    return this.addOnService.getProductById(id);
  }

  @ApiOperation({ summary: 'Create a top-up catalog product' })
  @ApiResponse({ status: 201, type: AddOnProductResponseDto })
  @ApiResponse({ status: 409, description: 'Product code already exists' })
  @Roles(...catalogWriterRoles)
  @AuditLog({
    action: 'add_on_product_created',
    resourceType: 'subscription_add_on_product',
  })
  @Post()
  async createProduct(
    @Body() dto: CreateAddOnProductDto,
  ): Promise<AddOnProductResponseDto> {
    return this.addOnService.createProduct(dto);
  }

  @ApiOperation({ summary: 'Update a top-up catalog product' })
  @ApiResponse({ status: 200, type: AddOnProductResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @Roles(...catalogWriterRoles)
  @AuditLog({
    action: 'add_on_product_updated',
    resourceType: 'subscription_add_on_product',
  })
  @Put(':id')
  async updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddOnProductDto,
  ): Promise<AddOnProductResponseDto> {
    return this.addOnService.updateProduct(id, dto);
  }

  @ApiOperation({ summary: 'Publish a top-up product (make it sellable)' })
  @ApiResponse({ status: 200, type: AddOnProductResponseDto })
  @ApiResponse({ status: 400, description: 'Product has no valid components' })
  @Roles(...catalogWriterRoles)
  @AuditLog({
    action: 'add_on_product_published',
    resourceType: 'subscription_add_on_product',
  })
  @Post(':id/publish')
  async publishProduct(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AddOnProductResponseDto> {
    return this.addOnService.publishProduct(id);
  }

  @ApiOperation({
    summary: 'Archive a top-up product (soft, keeps audit trail)',
  })
  @ApiResponse({ status: 200, type: AddOnProductResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @Roles(...catalogWriterRoles)
  @AuditLog({
    action: 'add_on_product_archived',
    resourceType: 'subscription_add_on_product',
  })
  @Post(':id/archive')
  async archiveProduct(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AddOnProductResponseDto> {
    return this.addOnService.archiveProduct(id);
  }

  @ApiOperation({
    summary: 'Delete a never-published top-up product (super_admin only)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 409, description: 'Product is active or archived' })
  @Roles('super_admin')
  @AuditLog({
    action: 'add_on_product_deleted',
    resourceType: 'subscription_add_on_product',
  })
  @Delete(':id')
  async deleteProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.addOnService.deleteProduct(id);
  }
}
