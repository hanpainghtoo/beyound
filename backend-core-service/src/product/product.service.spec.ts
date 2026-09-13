/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { ConflictException, NotFoundException } from '@nestjs/common';

import { ProductService } from './product.service';

function createQueryBuilder(result: { data?: unknown[]; total?: number } = {}) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest
      .fn()
      .mockResolvedValue([result.data || [], result.total || 0]),
  };
}

function createService() {
  const productRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: value.id || 'product-1', ...value })),
    remove: jest.fn(async () => undefined),
    createQueryBuilder: jest.fn(),
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
    expect(chain.andWhere).toHaveBeenCalledWith(
      'product.name ILIKE :search OR product.sku ILIKE :search',
      {
        search: '%Phone%',
      },
    );
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
});
