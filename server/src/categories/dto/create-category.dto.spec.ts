import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto.js';

// Runs the DTO rules exactly like ValidationPipe does, without starting the API:
// plain JSON -> DTO instance -> validate(). Returns the names of the invalid fields.
async function invalidFields(body: object): Promise<string[]> {
  const dto = plainToInstance(CreateCategoryDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('CreateCategoryDto', () => {
  const valid = { name: 'Đồng hồ', slug: 'dong-ho', sortOrder: 5 };

  it('accepts a valid body', async () => {
    await expect(invalidFields(valid)).resolves.toEqual([]);
  });

  // it.each runs the same test once per row: [field, body, why]
  it.each<[field: string, body: object, why: string]>([
    ['name', { ...valid, name: '' }, 'empty name'],
    [
      'name',
      { ...valid, name: 'a'.repeat(101) },
      'name longer than NVARCHAR(100)',
    ],
    ['slug', { ...valid, slug: 'Dong Ho' }, 'uppercase and space in slug'],
    ['slug', { ...valid, slug: 'dong--ho' }, 'double dash in slug'],
    ['sortOrder', { ...valid, sortOrder: -1 }, 'negative sortOrder'],
    ['sortOrder', { ...valid, sortOrder: '5' }, 'sortOrder sent as a string'],
    ['isActive', { ...valid, isActive: 'yes' }, 'isActive not a boolean'],
    [
      'createdAt',
      { ...valid, createdAt: '2000-01-01' },
      'field not in the DTO',
    ],
  ])('rejects %s: %s (%s)', async (field, body) => {
    await expect(invalidFields(body)).resolves.toContain(field);
  });

  // The DTO limit must match the column: slug is VARCHAR(120) in schema.sql
  it('accepts a slug of exactly 120 characters', async () => {
    const slug = 'a'.repeat(120);
    await expect(invalidFields({ ...valid, slug })).resolves.toEqual([]);
  });

  it('rejects a slug of 121 characters', async () => {
    const slug = 'a'.repeat(121);
    await expect(invalidFields({ ...valid, slug })).resolves.toContain('slug');
  });
});
