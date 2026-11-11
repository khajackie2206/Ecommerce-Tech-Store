import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Brand } from './brands.entity.js';
import { BrandsService } from './brands.service.js';

describe('BrandsService', () => {
  let service: BrandsService;

  // Fake repository: unit tests run without SQL Server
  const fakeRepo = {
    find: vi.fn(),
    findOneBy: vi.fn(),
    create: vi.fn((data: Partial<Brand>) => data),
    save: vi.fn(async (data: Partial<Brand>) => ({ id: 1, ...data })),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandsService,
        // Whoever asks for Repository<Brand> gets the fake one
        { provide: getRepositoryToken(Brand), useValue: fakeRepo },
      ],
    }).compile();

    service = module.get<BrandsService>(BrandsService);
  });

  it('creates a brand when the slug is free', async () => {
    fakeRepo.findOneBy.mockResolvedValue(null); // no brand uses this slug
    const result = await service.create({ name: 'Google', slug: 'google' });
    expect(result).toEqual({ id: 1, name: 'Google', slug: 'google' });
  });

  it('rejects a duplicate slug with 409', async () => {
    fakeRepo.findOneBy.mockResolvedValue({ id: 1, slug: 'apple' });
    await expect(
      service.create({ name: 'Apple', slug: 'apple' }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws 404 when the brand does not exist', async () => {
    fakeRepo.findOneBy.mockResolvedValue(null);
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });
});