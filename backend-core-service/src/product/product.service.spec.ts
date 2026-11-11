/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { ConflictException, NotFoundException } from '@nestjs/common';

import { ProductService } from './product.service';
import { Product } from './entities/product.entity';
import { ProductCategory } from './entities/product-category.entity';

function createQueryBuilder(result: { data?: unknown[]; total?: number } = {}) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest
      .fn()
      .mockResolvedValue([result.data || [], result.total || 0]),
  };
}

function createService(mediaLibraryService?: any) {
  const productRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: value.id || 'product-1', ...value })),
    remove: jest.fn(async () => undefined),
    createQueryBuilder: jest.fn(),
    manager: {} as { transaction: jest.Mock },
  };
  const productCategoryRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({
      id: value.id || 'category-1',
      ...value,
    })),
  };

  return {
    service: new ProductService(
      productRepository as any,
      productCategoryRepository as any,
      mediaLibraryService,
    ),
    repositories: {
      product: productRepository,
      category: productCategoryRepository,
    },
  };
}

describe('ProductService', () => {
  it('lists tenant products with pagination metadata', async () => {
    const { service, repositories } = createService();
    const chain = createQueryBuilder({
      data: [{ id: 'product-1', name: 'Phone' }],
      total: 1,
    });
    repositories.product.createQueryBuilder.mockReturnValue(chain);

    await expect(
      service.getAllProducts('tenant-1', {
        page: 1,
        limit: 20,
        search: 'Phone',
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      }),
    ).resolves.toMatchObject({
      data: [{ id: 'product-1', name: 'Phone' }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });

    expect(chain.where).toHaveBeenCalledWith('product.tenant_id = :tenantId', {
      tenantId: 'tenant-1',
    });
    // The OR group must be parenthesized: TypeORM concatenates andWhere()
    // clauses into a single parenthesized expression, and AND binds tighter
    // than OR — without parens `category_id = :x` attaches only to the last
    // OR branch, silently defeating every later filter (and leaving `sku`
    // and `category.name` outside the tenant predicate).
    expect(chain.andWhere).toHaveBeenCalledWith(
      '(product.name ILIKE :search OR product.sku ILIKE :search OR category.name ILIKE :search)',
      {
        search: '%Phone%',
      },
    );
  });

  it('filters tenant products by status', async () => {
    const { service, repositories } = createService();
    const chain = createQueryBuilder({ data: [], total: 0 });
    repositories.product.createQueryBuilder.mockReturnValue(chain);

    await service.getAllProducts('tenant-1', {
      page: 2,
      limit: 8,
      status: 'inactive',
    });

    expect(chain.andWhere).toHaveBeenCalledWith('product.status = :status', {
      status: 'inactive',
    });
    expect(chain.skip).toHaveBeenCalledWith(8);
    expect(chain.take).toHaveBeenCalledWith(8);
  });

  it('returns a tenant-scoped product by id', async () => {
    const { service, repositories } = createService();
    repositories.product.findOne.mockResolvedValue({
      id: 'product-1',
      tenantId: 'tenant-1',
    });

    await expect(
      service.getProductById('tenant-1', 'product-1'),
    ).resolves.toMatchObject({
      id: 'product-1',
      tenantId: 'tenant-1',
    });
    expect(repositories.product.findOne).toHaveBeenCalledWith({
      where: { id: 'product-1', tenantId: 'tenant-1' },
      relations: ['category'],
    });
  });

  it('rejects reading a missing tenant product', async () => {
    const { service, repositories } = createService();
    repositories.product.findOne.mockResolvedValue(null);

    await expect(
      service.getProductById('tenant-1', 'missing-product'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a product and prevents duplicate tenant sku values', async () => {
    const { service, repositories } = createService();
    repositories.product.findOne.mockResolvedValueOnce(null);

    await expect(
      service.createProduct('tenant-1', {
        name: 'Phone',
        sku: 'PHONE-1',
        price: 1000,
        stockQuantity: 5,
      } as any),
    ).resolves.toMatchObject({
      tenantId: 'tenant-1',
      sku: 'PHONE-1',
      type: 'product',
      status: 'active',
    });

    repositories.product.findOne.mockResolvedValueOnce({
      id: 'product-duplicate',
      sku: 'PHONE-1',
    });
    await expect(
      service.createProduct('tenant-1', {
        name: 'Phone',
        sku: 'PHONE-1',
        price: 1000,
        stockQuantity: 5,
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates and deletes only existing tenant products', async () => {
    const { service, repositories } = createService();
    repositories.product.findOne
      .mockResolvedValueOnce({
        id: 'product-1',
        tenantId: 'tenant-1',
        name: 'Old Name',
      })
      .mockResolvedValueOnce({
        id: 'product-1',
        tenantId: 'tenant-1',
        name: 'Phone',
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.updateProduct('tenant-1', 'product-1', { name: 'New Name' }),
    ).resolves.toMatchObject({ id: 'product-1', name: 'New Name' });

    await expect(
      service.deleteProduct('tenant-1', 'product-1'),
    ).resolves.toBeUndefined();
    expect(repositories.product.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'product-1' }),
    );

    await expect(
      service.deleteProduct('tenant-1', 'missing-product'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists active categories and prevents duplicate category names per tenant', async () => {
    const { service, repositories } = createService();
    repositories.category.find.mockResolvedValue([
      { id: 'category-1', name: 'Phones' },
    ]);
    repositories.category.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'category-1', name: 'Phones' });

    await expect(service.getAllCategories('tenant-1')).resolves.toEqual([
      { id: 'category-1', name: 'Phones' },
    ]);
    expect(repositories.category.find).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    await expect(
      service.createCategory('tenant-1', 'Phones', 'Devices'),
    ).resolves.toMatchObject({
      tenantId: 'tenant-1',
      name: 'Phones',
    });

    await expect(
      service.createCategory('tenant-1', 'Phones'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('resolves media IDs to signed URLs and passes direct URLs through', async () => {
    const mediaLibraryService = {
      getDownloadUrl: jest.fn(async (_tenantId: string, fileId: string) => ({
        file: { id: fileId },
        download: { url: `https://files.example/${fileId}` },
      })),
    };
    const { service, repositories } = createService(mediaLibraryService);
    repositories.product.findOne.mockResolvedValue({
      id: 'product-1',
      tenantId: 'tenant-1',
      images: [
        'file-1',
        'https://cdn.example/direct.jpg',
        '/uploads/local.jpg',
      ],
    });

    const result = await service.getProductById('tenant-1', 'product-1');

    expect(mediaLibraryService.getDownloadUrl).toHaveBeenCalledWith(
      'tenant-1',
      'file-1',
    );
    expect(result.imageUrls).toEqual([
      'https://files.example/file-1',
      'https://cdn.example/direct.jpg',
      '/uploads/local.jpg',
    ]);
    expect(result.primaryImageUrl).toBe('https://files.example/file-1');
  });

  it('drops unresolvable media IDs and returns null primary when empty', async () => {
    const mediaLibraryService = {
      getDownloadUrl: jest.fn(async () => {
        throw new Error('not found');
      }),
    };
    const { service, repositories } = createService(mediaLibraryService);
    repositories.product.findOne.mockResolvedValueOnce({
      id: 'product-broken',
      tenantId: 'tenant-1',
      images: ['missing-file'],
    });
    repositories.product.findOne.mockResolvedValueOnce({
      id: 'product-empty',
      tenantId: 'tenant-1',
      images: [],
    });

    const broken = await service.getProductById('tenant-1', 'product-broken');
    expect(broken.imageUrls).toEqual([]);
    expect(broken.primaryImageUrl).toBeNull();

    const empty = await service.getProductById('tenant-1', 'product-empty');
    expect(empty.imageUrls).toEqual([]);
    expect(empty.primaryImageUrl).toBeNull();
  });

  it('batches unique media IDs across list pages', async () => {
    const mediaLibraryService = {
      getDownloadUrl: jest.fn(async (_tenantId: string, fileId: string) => ({
        download: { url: `https://files.example/${fileId}` },
      })),
    };
    const { service, repositories } = createService(mediaLibraryService);
    const chain = createQueryBuilder({
      data: [
        { id: 'p1', images: ['shared-file'] },
        { id: 'p2', images: ['shared-file', 'file-2'] },
      ],
      total: 2,
    });
    repositories.product.createQueryBuilder.mockReturnValue(chain);

    const result = await service.getAllProducts('tenant-1', {
      page: 1,
      limit: 8,
    });

    expect(mediaLibraryService.getDownloadUrl).toHaveBeenCalledTimes(2);
    expect(result.data[0].primaryImageUrl).toBe(
      'https://files.example/shared-file',
    );
    expect(result.data[1].imageUrls).toEqual([
      'https://files.example/shared-file',
      'https://files.example/file-2',
    ]);
  });

  it('trims a new category name before saving it', async () => {
    const { service, repositories } = createService();
    repositories.category.findOne.mockResolvedValueOnce(null);

    await expect(
      service.createCategory('tenant-1', '  Phones  ', 'Devices'),
    ).resolves.toMatchObject({ name: 'Phones', tenantId: 'tenant-1' });
    expect(repositories.category.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Phones', description: 'Devices' }),
    );
  });

  it('keeps the active-only category list unless includeInactive is requested', async () => {
    const { service, repositories } = createService();
    repositories.category.find.mockResolvedValue([]);

    await service.getAllCategories('tenant-1', true);

    expect(repositories.category.find).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  });

  it('renames a tenant category and trims the new name', async () => {
    const { service, repositories } = createService();
    repositories.category.findOne
      .mockResolvedValueOnce({
        id: 'category-1',
        tenantId: 'tenant-1',
        name: 'Phones',
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.updateCategory('tenant-1', 'category-1', {
        name: '  Smartphones  ',
      }),
    ).resolves.toMatchObject({ name: 'Smartphones', tenantId: 'tenant-1' });
    expect(repositories.category.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'category-1', name: 'Smartphones' }),
    );
  });

  it('toggles category activation without a collision lookup', async () => {
    const { service, repositories } = createService();
    repositories.category.findOne.mockResolvedValueOnce({
      id: 'category-1',
      tenantId: 'tenant-1',
      name: 'Phones',
      isActive: true,
    });

    await expect(
      service.updateCategory('tenant-1', 'category-1', { isActive: false }),
    ).resolves.toMatchObject({ name: 'Phones', isActive: false });
    expect(repositories.category.findOne).toHaveBeenCalledTimes(1);
  });

  it('rejects updating a category that belongs to another tenant', async () => {
    const { service, repositories } = createService();
    repositories.category.findOne.mockResolvedValueOnce(null);

    await expect(
      service.updateCategory('tenant-1', 'foreign-category', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repositories.category.save).not.toHaveBeenCalled();
  });

  it('rejects renaming a category onto an existing tenant name', async () => {
    const { service, repositories } = createService();
    repositories.category.findOne
      .mockResolvedValueOnce({
        id: 'category-1',
        tenantId: 'tenant-1',
        name: 'Phones',
      })
      .mockResolvedValueOnce({
        id: 'category-2',
        tenantId: 'tenant-1',
        name: 'Accessories',
      });

    await expect(
      service.updateCategory('tenant-1', 'category-1', {
        name: 'Accessories',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repositories.category.save).not.toHaveBeenCalled();
  });

  it('nulls product references before deleting the category in one transaction', async () => {
    const { service, repositories } = createService();
    const manager = {
      update: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    };
    repositories.product.manager = {
      transaction: jest.fn(
        async (callback: (tx: typeof manager) => Promise<void>) =>
          callback(manager),
      ),
    };
    repositories.category.findOne.mockResolvedValueOnce({
      id: 'category-1',
      tenantId: 'tenant-1',
      name: 'Phones',
    });

    await expect(
      service.deleteCategory('tenant-1', 'category-1'),
    ).resolves.toBeUndefined();

    expect(repositories.product.manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(
      Product,
      { categoryId: 'category-1', tenantId: 'tenant-1' },
      { categoryId: null },
    );
    expect(manager.delete).toHaveBeenCalledWith(ProductCategory, {
      id: 'category-1',
    });
    expect(manager.update.mock.invocationCallOrder[0]).toBeLessThan(
      manager.delete.mock.invocationCallOrder[0],
    );
  });

  it('rejects deleting a category that belongs to another tenant', async () => {
    const { service, repositories } = createService();
    repositories.product.manager = {
      transaction: jest.fn(async () => undefined),
    };
    repositories.category.findOne.mockResolvedValueOnce(null);

    await expect(
      service.deleteCategory('tenant-1', 'foreign-category'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repositories.product.manager.transaction).not.toHaveBeenCalled();
  });

  it('filters tenant products by category and by uncategorized', async () => {
    const { service, repositories } = createService();
    const chain = createQueryBuilder({ data: [], total: 0 });
    repositories.product.createQueryBuilder.mockReturnValue(chain);

    await service.getAllProducts('tenant-1', {
      page: 1,
      limit: 8,
      categoryId: 'category-1',
    });
    expect(chain.andWhere).toHaveBeenCalledWith(
      'product.category_id = :categoryId',
      { categoryId: 'category-1' },
    );

    await service.getAllProducts('tenant-1', {
      page: 1,
      limit: 8,
      categoryId: 'uncategorized',
    });
    expect(chain.andWhere).toHaveBeenCalledWith('product.category_id IS NULL');
  });
});
