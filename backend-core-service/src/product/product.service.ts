import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { Product } from './entities/product.entity';
import { ProductCategory } from './entities/product-category.entity';
import type { CreateProductDto } from './dto/create-product.dto';
import type { PaginationDto } from '../common/dto/pagination.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';

const productSortColumns: Record<string, string> = {
  createdAt: 'product.createdAt',
  updatedAt: 'product.updatedAt',
  name: 'product.name',
  sku: 'product.sku',
  type: 'product.type',
  status: 'product.status',
  price: 'product.price',
  stockQuantity: 'product.stockQuantity',
};

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductCategory)
    private productCategoryRepository: Repository<ProductCategory>,
  ) {}

  async createProduct(
    tenantId: string,
    createProductDto: CreateProductDto,
  ): Promise<Product> {
    // Check if SKU already exists
    if (createProductDto.sku) {
      const existingProduct = await this.productRepository.findOne({
        where: { sku: createProductDto.sku, tenantId },
      });

      if (existingProduct) {
        throw new ConflictException('Product with this SKU already exists');
      }
    }

    const product = this.productRepository.create({
      ...createProductDto,
      tenantId,
      type: createProductDto.type || 'product',
      status: createProductDto.status || 'active',
    });

    return this.productRepository.save(product);
  }

  async updateProduct(
    tenantId: string,
    productId: string,
    updateProductDto: Partial<CreateProductDto>,
  ): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId, tenantId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (updateProductDto.sku) {
      const existingProduct = await this.productRepository.findOne({
        where: { sku: updateProductDto.sku, tenantId },
      });

      if (existingProduct && existingProduct.id !== productId) {
        throw new ConflictException('Product with this SKU already exists');
      }
    }

    Object.assign(product, updateProductDto);
    return this.productRepository.save(product);
  }

  async deleteProduct(tenantId: string, productId: string): Promise<void> {
    const product = await this.productRepository.findOne({
      where: { id: productId, tenantId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.productRepository.remove(product);
  }

  async getAllProducts(
    tenantId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<Product>> {
    const { page = 1, limit = 100, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.tenant_id = :tenantId', { tenantId });

    if (search) {
      queryBuilder.andWhere(
        'product.name ILIKE :search OR product.sku ILIKE :search',
        {
          search: `%${search}%`,
        },
      );
    }

    queryBuilder.orderBy(
      productSortColumns[sortBy || 'createdAt'] || 'product.createdAt',
      sortOrder || 'DESC',
    );

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getProductById(tenantId: string, productId: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId, tenantId },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async getAllCategories(tenantId: string): Promise<ProductCategory[]> {
    return this.productCategoryRepository.find({
      where: { tenantId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async createCategory(
    tenantId: string,
    name: string,
    description?: string,
  ): Promise<ProductCategory> {
    const existingCategory = await this.productCategoryRepository.findOne({
      where: { name, tenantId },
    });

    if (existingCategory) {
      throw new ConflictException('Category with this name already exists');
    }

    const category = this.productCategoryRepository.create({
      tenantId,
      name,
      description,
    });

    return this.productCategoryRepository.save(category);
  }
}
