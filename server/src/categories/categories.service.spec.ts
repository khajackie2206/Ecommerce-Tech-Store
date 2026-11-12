import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service.js';
import { Category } from './category.entity.js';

describe('CategoriesService', () => {
  let service: CategoriesService;

  // Fake repository: unit tests run without SQL Server
  const fakeRepo = {
    find: vi.fn(),
    findOneBy: vi.fn(),
    create: vi.fn((data: Partial<Category>) => data),
    save: vi.fn(async (data: Partial<Category>) => ({ id: 1, ...data })),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        // Whoever asks for Repository<Category> gets the fake one
        { provide: getRepositoryToken(Category), useValue: fakeRepo },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('creates a category when the slug is free', async () => {
    fakeRepo.findOneBy.mockResolvedValue(null); // no category uses this slug
    const result = await service.create({ name: 'Đồng hồ', slug: 'dong-ho' });
    expect(result).toEqual({ id: 1, name: 'Đồng hồ', slug: 'dong-ho' });
  });

  it('rejects a duplicate slug with 409', async () => {
    fakeRepo.findOneBy.mockResolvedValue({ id: 2, slug: 'laptop' });
    await expect(
      service.create({ name: 'Laptop', slug: 'laptop' }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws 404 when the category does not exist', async () => {
    fakeRepo.findOneBy.mockResolvedValue(null);
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });
});
