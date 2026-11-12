import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from './entities/product.entity.js';
import { ProductsService } from './products.service.js';

describe('ProductsService', () => {
  let service: ProductsService;

  // Fake repository: only findOne is needed by findBySlug
  const fakeRepo = { findOne: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: fakeRepo },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('throws 404 when the product does not exist', async () => {
    fakeRepo.findOne.mockResolvedValue(null);
    await expect(service.findBySlug('khong-co')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('hides inactive variants', async () => {
    fakeRepo.findOne.mockResolvedValue({
      slug: 'iphone-17',
      variants: [
        { sku: 'A', isActive: true },
        { sku: 'B', isActive: false },
      ],
    });
    const product = await service.findBySlug('iphone-17');
    expect(product.variants.map((v) => v.sku)).toEqual(['A']);
  });
});
