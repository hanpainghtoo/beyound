import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { UpdateCategoryDto } from './update-category.dto';

// Mirrors the global ValidationPipe options in src/main.ts.
const pipeOptions = { whitelist: true, forbidNonWhitelisted: true } as const;

async function validatePatch(overrides: Record<string, unknown> = {}) {
  const dto = plainToInstance(UpdateCategoryDto, overrides);
  return (await validate(dto, pipeOptions)).map((error) => error.property);
}

describe('UpdateCategoryDto', () => {
  it('accepts an empty patch', async () => {
    await expect(validatePatch()).resolves.toEqual([]);
  });

  it('accepts name, description and isActive together', async () => {
    await expect(
      validatePatch({
        name: 'Smartphones',
        description: 'Updated',
        isActive: false,
      }),
    ).resolves.toEqual([]);
  });

  it('accepts an isActive-only patch', async () => {
    await expect(validatePatch({ isActive: false })).resolves.toEqual([]);
  });

  it('trims surrounding whitespace from a provided name', () => {
    const dto = plainToInstance(UpdateCategoryDto, { name: '  Phones  ' });
    expect(dto.name).toBe('Phones');
  });

  it('rejects a blank name when one is provided', async () => {
    await expect(validatePatch({ name: '   ' })).resolves.toContain('name');
  });

  it('rejects an over-long name', async () => {
    await expect(validatePatch({ name: 'a'.repeat(121) })).resolves.toContain(
      'name',
    );
  });

  it('rejects a non-boolean isActive', async () => {
    await expect(validatePatch({ isActive: 'no' })).resolves.toContain(
      'isActive',
    );
  });

  it('rejects an unknown field', async () => {
    await expect(validatePatch({ sort_order: 4 })).resolves.toContain(
      'sort_order',
    );
  });

  it('rejects an explicit null name instead of letting it reach the service', async () => {
    await expect(validatePatch({ name: null })).resolves.toContain('name');
  });

  it('allows an explicit null description but rejects a null isActive', async () => {
    // description is a nullable column; is_active is NOT NULL, so a null
    // there would reach Postgres and 500.
    await expect(validatePatch({ description: null })).resolves.toEqual([]);
    await expect(validatePatch({ isActive: null })).resolves.toContain(
      'isActive',
    );
  });
});
