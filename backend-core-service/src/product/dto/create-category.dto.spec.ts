import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CreateCategoryDto } from './create-category.dto';

// Mirrors the global ValidationPipe options in src/main.ts.
const pipeOptions = { whitelist: true, forbidNonWhitelisted: true } as const;

async function validateCategory(overrides: Record<string, unknown> = {}) {
  const dto = plainToInstance(CreateCategoryDto, {
    name: 'Phones',
    ...overrides,
  });
  return (await validate(dto, pipeOptions)).map((error) => error.property);
}

describe('CreateCategoryDto', () => {
  it('accepts a valid category name with an optional description', async () => {
    await expect(
      validateCategory({ name: 'Accessories', description: 'Add-ons' }),
    ).resolves.toEqual([]);
  });

  it('accepts a category with no description', async () => {
    await expect(validateCategory()).resolves.toEqual([]);
  });

  it('trims surrounding whitespace from the name', () => {
    const dto = plainToInstance(CreateCategoryDto, { name: '  Phones  ' });
    expect(dto.name).toBe('Phones');
  });

  it('rejects an empty name', async () => {
    await expect(validateCategory({ name: '' })).resolves.toContain('name');
  });

  it('rejects a whitespace-only name', async () => {
    await expect(validateCategory({ name: '   ' })).resolves.toContain('name');
  });

  it('rejects a non-string name', async () => {
    await expect(validateCategory({ name: 123 })).resolves.toContain('name');
  });

  it('rejects a name longer than 120 characters', async () => {
    await expect(
      validateCategory({ name: 'a'.repeat(121) }),
    ).resolves.toContain('name');
  });

  it('rejects a non-string description', async () => {
    await expect(validateCategory({ description: 42 })).resolves.toContain(
      'description',
    );
  });
});
