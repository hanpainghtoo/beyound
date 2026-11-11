import {
  Controller,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Get,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { ProductService } from './product.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { AuditLog } from '../logging/decorators/audit-log.decorator';

import { CreateProductDto } from './dto/create-product.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ProductListQueryDto } from './dto/product-list-query.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';

@ApiTags('Product Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
@Controller('tenant/products')
export class ProductController {
  constructor(private productService: ProductService) {}

  @ApiOperation({ summary: 'Get all product categories' })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    description: 'Include soft-hidden categories (management views only)',
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get('categories')
  async getAllCategories(
    @CurrentTenant() tenant: { id: string },
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.productService.getAllCategories(
      tenant.id,
      includeInactive === 'true',
    );
  }

  @ApiOperation({ summary: 'Get all products' })
  @ApiResponse({
    status: 200,
    description: 'Products retrieved successfully',
    type: [ProductResponseDto],
  })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get()
  async getAllProducts(
    @CurrentTenant() tenant: { id: string },
    @Query() paginationDto: ProductListQueryDto,
  ): Promise<PaginatedResult<ProductResponseDto>> {
    return this.productService.getAllProducts(tenant.id, paginationDto);
  }

  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({
    status: 200,
    description: 'Product retrieved successfully',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @Roles('owner', 'admin', 'supervisor', 'agent')
  @Get(':id')
  async getProductById(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) productId: string,
  ): Promise<ProductResponseDto> {
    return this.productService.getProductById(tenant.id, productId);
  }

  @ApiOperation({ summary: 'Create new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 409, description: 'Product SKU already exists' })
  @Roles('owner', 'admin', 'supervisor')
  @AuditLog({ action: 'product_created', resourceType: 'product' })
  @Post()
  async createProduct(
    @CurrentTenant() tenant: { id: string },
    @Body() createProductDto: CreateProductDto,
  ) {
    return this.productService.createProduct(tenant.id, createProductDto);
  }

  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @Roles('owner', 'admin', 'supervisor')
  @AuditLog({ action: 'product_updated', resourceType: 'product' })
  @Put(':id')
  async updateProduct(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() updateProductDto: Partial<CreateProductDto>,
  ) {
    return this.productService.updateProduct(
      tenant.id,
      productId,
      updateProductDto,
    );
  }

  @ApiOperation({ summary: 'Delete product' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @Roles('owner', 'admin')
  @AuditLog({ action: 'product_deleted', resourceType: 'product' })
  @Delete(':id')
  async deleteProduct(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) productId: string,
  ) {
    await this.productService.deleteProduct(tenant.id, productId);
    return { message: 'Product deleted successfully' };
  }

  @ApiOperation({ summary: 'Create new product category' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 409, description: 'Category name already exists' })
  @Roles('owner', 'admin', 'supervisor')
  @AuditLog({
    action: 'product_category_created',
    resourceType: 'product_category',
  })
  @Post('categories')
  async createCategory(
    @CurrentTenant() tenant: { id: string },
    @Body() body: CreateCategoryDto,
  ) {
    return this.productService.createCategory(
      tenant.id,
      body.name,
      body.description,
    );
  }

  @ApiOperation({ summary: 'Update a product category' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category name already exists' })
  @Roles('owner', 'admin', 'supervisor')
  @AuditLog({
    action: 'product_category_updated',
    resourceType: 'product_category',
  })
  @Patch('categories/:id')
  async updateCategory(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) categoryId: string,
    @Body() body: UpdateCategoryDto,
  ) {
    return this.productService.updateCategory(tenant.id, categoryId, body);
  }

  @ApiOperation({ summary: 'Delete a product category' })
  @ApiResponse({
    status: 200,
    description:
      'Category deleted; products previously using it become uncategorized',
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @Roles('owner', 'admin', 'supervisor')
  @AuditLog({
    action: 'product_category_deleted',
    resourceType: 'product_category',
  })
  @Delete('categories/:id')
  async deleteCategory(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) categoryId: string,
  ) {
    await this.productService.deleteCategory(tenant.id, categoryId);
    return { message: 'Category deleted successfully' };
  }
}
