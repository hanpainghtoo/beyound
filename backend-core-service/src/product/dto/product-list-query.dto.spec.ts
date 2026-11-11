import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { ProductListQueryDto } from './product-list-query.dto';

// Mirrors the global ValidationPipe options in src/main.ts.
const pipeOptions = { whitelist: true, forbidNonWhitelisted: true } as const;

async function validateQuery(overrides: Record<string, unknown> = {}) {
  const dto = plainToInstance(ProductListQueryDto, overrides);
  return (await validate(dto, pipeOptions)).map((error) => error.property);
}

describe('ProductListQueryDto', () => {
  it('accepts a query with no filters', async () => {
    await expect(validateQuery()).resolves.toEqual([]);
  });

  it('accepts pagination params', async () => {
    await expect(validateQuery({ page: 2, limit: 8 })).resolves.toEqual([]);
  });

  it('accepts the uncategorized sentinel', async () => {
    await expect(
      validateQuery({ categoryId: 'uncategorized' }),
    ).resolves.toEqual([]);
  });

  it('accepts a real category uuid', async () => {
    await expect(
      validateQuery({ categoryId: '1f2aed6d-4258-4baa-af7d-fcbd2c2ff779' }),
    ).resolves.toEqual([]);
  });

  it('rejects a non-uuid categoryId instead of letting it reach Postgres and 500', async () => {
    await expect(validateQuery({ categoryId: 'foo' })).resolves.toContain(
      'categoryId',
    );
  });

  it('rejects an explicitly null categoryId', async () => {
    await expect(validateQuery({ categoryId: null })).resolves.toContain(
      'categoryId',
    );
  });
});
