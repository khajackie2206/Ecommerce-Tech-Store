import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminProductsService } from './admin-products.service.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';

describe('AdminProductsService', () => {
  let service: AdminProductsService;
  const productsRepo = {
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    findAndCount: vi.fn(),
    create: vi.fn((data: object) => data),
    save: vi.fn(async (data: object) => ({ id: 7, ...data })),
    update: vi.fn(),
  };
  const variantsRepo = {
    findOneBy: vi.fn(),
    create: vi.fn((data: object) => ({ ...data })),
    save: vi.fn(async (data: object) => data),
    remove: vi.fn(),
  };

  const newProduct = (variant: object = {}): CreateProductDto => ({
    categoryId: 1,
    brandId: 1,
    name: 'Google Pixel 10',
    slug: 'google-pixel-10',
    variants: [
      {
        sku: 'GP10-128-BLK',
        name: '128GB - Đen',
        price: 18990000,
        stock: 20,
        ...variant,
      },
    ],
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    productsRepo.findOneBy.mockResolvedValue(null); // slug free
    variantsRepo.findOneBy.mockResolvedValue(null); // sku free
    productsRepo.findOne.mockResolvedValue({ id: 7 }); // read back after save
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminProductsService,
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: variantsRepo },
      ],
    }).compile();
    service = module.get(AdminProductsService);
  });

  describe('create', () => {
    it('saves the product with its variants in one save()', async () => {
      await service.create(newProduct());

      expect(productsRepo.save).toHaveBeenCalledOnce();
      expect(productsRepo.save.mock.calls[0]?.[0]).toMatchObject({
        slug: 'google-pixel-10',
        variants: [{ sku: 'GP10-128-BLK' }],
      });
    });

    it('rejects a sale price above the price', async () => {
      await expect(
        service.create(newProduct({ salePrice: 19990000 })),
      ).rejects.toThrow(BadRequestException);
      expect(productsRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a SKU already used by another variant', async () => {
      variantsRepo.findOneBy.mockResolvedValue({ id: 99, sku: 'GP10-128-BLK' });
      await expect(service.create(newProduct())).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateVariant', () => {
    const existing = () => ({
      id: 3,
      sku: 'GP10-128-BLK',
      price: 18990000,
      salePrice: 17990000,
      stock: 20,
    });

    // The rule is checked on the pair AFTER the change, not on the body alone
    it('rejects lowering the price below the current sale price', async () => {
      variantsRepo.findOneBy.mockResolvedValue(existing());
      await expect(
        service.updateVariant(3, { price: 15000000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts lowering the price when the sale price is removed too', async () => {
      variantsRepo.findOneBy.mockResolvedValue(existing());
      await expect(
        service.updateVariant(3, { price: 15000000, salePrice: null }),
      ).resolves.toMatchObject({ price: 15000000, salePrice: null });
    });

    it('returns 404 for an unknown variant', async () => {
      variantsRepo.findOneBy.mockResolvedValue(null);
      await expect(service.updateVariant(999, { stock: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
