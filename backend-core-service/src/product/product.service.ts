import {
  Injectable,
  NotFoundException,
  ConflictException,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { Product } from './entities/product.entity';
import { ProductCategory } from './entities/product-category.entity';
import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';
import type { ProductListQueryDto } from './dto/product-list-query.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { paginateQueryBuilder } from '../common/pagination/paginate';
import { MediaLibraryService } from '../media/media-library.service';
import {
  toProductResponse,
  type ProductResponseDto,
} from './dto/product-response.dto';

const DIRECT_IMAGE_URL_PATTERN = /^(https?:\/\/|\/)/;

type DownloadUrlResponse = {
  download?: { url?: string };
};

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
    @Optional()
    @Inject(forwardRef(() => MediaLibraryService))
    private readonly mediaLibraryService?: MediaLibraryService,
  ) {}

  async createProduct(
    tenantId: string,
    createProductDto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    // Check if SKU already exists
    if (createProductDto.sku) {
      const existingProduct = await this.productRepository.findOne({
        where: { sku: createProductDto.sku, tenantId },
      });

      if (existingProduct) {
        throw new ConflictException('Product with this SKU already exists');
      }
    }

    // Mirrors the SKU guard so a duplicate barcode surfaces as a 409 rather
    // than a raw unique-violation 500 from the partial index.
    if (createProductDto.barcode) {
      const existingBarcode = await this.productRepository.findOne({
        where: { barcode: createProductDto.barcode, tenantId },
      });

      if (existingBarcode) {
        throw new ConflictException('Product with this barcode already exists');
      }
    }

    const product = this.productRepository.create({
      ...createProductDto,
      tenantId,
      type: createProductDto.type || 'product',
      status: createProductDto.status || 'active',
    });

    const saved = await this.productRepository.save(product);
    return this.withResolvedImages(tenantId, saved);
  }

  async updateProduct(
    tenantId: string,
    productId: string,
    updateProductDto: Partial<CreateProductDto>,
  ): Promise<ProductResponseDto> {
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

    if (updateProductDto.barcode) {
      const existingBarcode = await this.productRepository.findOne({
        where: { barcode: updateProductDto.barcode, tenantId },
      });

      if (existingBarcode && existingBarcode.id !== productId) {
        throw new ConflictException('Product with this barcode already exists');
      }
    }

    Object.assign(product, updateProductDto);
    const saved = await this.productRepository.save(product);
    return this.withResolvedImages(tenantId, saved);
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
    paginationDto: ProductListQueryDto,
  ): Promise<PaginatedResult<ProductResponseDto>> {
    const {
      page = 1,
      limit = 100,
      search,
      sortBy,
      sortOrder,
      status,
      categoryId,
    } = paginationDto;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.tenant_id = :tenantId', { tenantId });

    if (search) {
      // Parenthesized: TypeORM joins these raw strings into one expression,
      // and unparenthesized OR would bind the status/category predicates to
      // only the last branch (`... OR category.name ILIKE :search`).
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.sku ILIKE :search OR category.name ILIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (status && status !== 'all') {
      queryBuilder.andWhere('product.status = :status', { status });
    }

    if (categoryId === 'uncategorized') {
      queryBuilder.andWhere('product.category_id IS NULL');
    } else if (categoryId) {
      queryBuilder.andWhere('product.category_id = :categoryId', {
        categoryId,
      });
    }

    const result = await paginateQueryBuilder(queryBuilder, {
      page,
      limit,
      sortBy,
      sortOrder,
      columnMap: productSortColumns,
      defaultSort: 'product.createdAt',
      tieBreaker: 'product.id',
    });

    const urlById = await this.resolveMediaIdBatch(
      tenantId,
      result.data.flatMap((product) => product.images ?? []),
    );

    return {
      ...result,
      data: result.data.map((product) =>
        toProductResponse(
          product,
          this.resolveProductImageUrls(product.images, urlById),
        ),
      ),
    };
  }

  async getProductById(
    tenantId: string,
    productId: string,
  ): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id: productId, tenantId },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.withResolvedImages(tenantId, product);
  }

  async getAllCategories(
    tenantId: string,
    includeInactive = false,
  ): Promise<ProductCategory[]> {
    return this.productCategoryRepository.find({
      where: includeInactive ? { tenantId } : { tenantId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async createCategory(
    tenantId: string,
    name: string,
    description?: string,
  ): Promise<ProductCategory> {
    const trimmedName = name.trim();

    const existingCategory = await this.productCategoryRepository.findOne({
      where: { name: trimmedName, tenantId },
    });

    if (existingCategory) {
      throw new ConflictException('Category with this name already exists');
    }

    const category = this.productCategoryRepository.create({
      tenantId,
      name: trimmedName,
      description,
    });

    return this.productCategoryRepository.save(category);
  }

  async updateCategory(
    tenantId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ): Promise<ProductCategory> {
    const category = await this.productCategoryRepository.findOne({
      where: { id: categoryId, tenantId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const nextName = dto.name === undefined ? category.name : dto.name.trim();

    if (nextName !== category.name) {
      const existingCategory = await this.productCategoryRepository.findOne({
        where: { name: nextName, tenantId },
      });

      if (existingCategory && existingCategory.id !== categoryId) {
        throw new ConflictException('Category with this name already exists');
      }
    }

    category.name = nextName;
    if (dto.description !== undefined) {
      category.description = dto.description;
    }
    if (dto.isActive !== undefined) {
      category.isActive = dto.isActive;
    }

    return this.productCategoryRepository.save(category);
  }

  async deleteCategory(tenantId: string, categoryId: string): Promise<void> {
    const category = await this.productCategoryRepository.findOne({
      where: { id: categoryId, tenantId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Detach referencing products first: products.category_id is FK
    // ON DELETE NO ACTION, so a straight delete would raise a Postgres error.
    await this.productRepository.manager.transaction(async (manager) => {
      await manager.update(
        Product,
        { categoryId, tenantId },
        { categoryId: null },
      );
      await manager.delete(ProductCategory, { id: categoryId });
    });
  }

  private async withResolvedImages(
    tenantId: string,
    product: Product,
  ): Promise<ProductResponseDto> {
    const urlById = await this.resolveMediaIdBatch(
      tenantId,
      product.images ?? [],
    );
    return toProductResponse(
      product,
      this.resolveProductImageUrls(product.images, urlById),
    );
  }

  private resolveProductImageUrls(
    images: string[] | undefined,
    urlById: Map<string, string | null>,
  ): string[] {
    const urls: string[] = [];
    for (const image of images ?? []) {
      if (!image) continue;
      if (DIRECT_IMAGE_URL_PATTERN.test(image)) {
        urls.push(image);
        continue;
      }
      const resolved = urlById.get(image);
      if (resolved) urls.push(resolved);
    }
    return urls;
  }

  private async resolveMediaIdBatch(
    tenantId: string,
    images: string[],
  ): Promise<Map<string, string | null>> {
    const uniqueIds = new Set<string>();
    for (const image of images ?? []) {
      if (image && !DIRECT_IMAGE_URL_PATTERN.test(image)) {
        uniqueIds.add(image);
      }
    }

    const urlById = new Map<string, string | null>();
    if (uniqueIds.size === 0 || !this.mediaLibraryService) return urlById;

    await Promise.all(
      [...uniqueIds].map(async (fileId) => {
        try {
          const response = (await this.mediaLibraryService!.getDownloadUrl(
            tenantId,
            fileId,
          )) as DownloadUrlResponse;
          const url = response?.download?.url;
          urlById.set(fileId, typeof url === 'string' && url ? url : null);
        } catch {
          urlById.set(fileId, null);
        }
      }),
    );
    return urlById;
  }
}
