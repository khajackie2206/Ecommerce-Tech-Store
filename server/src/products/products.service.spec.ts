import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { Product } from './entities/product.entity.js';
import { ProductsService } from './products.service.js';

// The SQL expression the service uses for "price after sale"
const EFFECTIVE_PRICE = 'MIN(COALESCE(v.salePrice, v.price))';

// Fake QueryBuilder: every builder method records its call and returns the same
// object (mockReturnThis), so chains like qb.select(...).where(...).limit(...) work.
// Only the final "run" methods return data.
function fakeQueryBuilder(rows: object[], total: number) {
  const chain = [
    'clone',
    'select',
    'addSelect',
    'innerJoin',
    'where',
    'andWhere',
    'groupBy',
    'addGroupBy',
    'andHaving',
    'orderBy',
    'addOrderBy',
    'offset',
    'limit',
    'from',
    'setParameters',
  ];
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of chain) qb[method] = vi.fn().mockReturnThis();
  qb.getQuery = vi.fn().mockReturnValue('SELECT ...');
  qb.getParameters = vi.fn().mockReturnValue({});
  qb.getRawMany = vi.fn().mockResolvedValue(rows);
  qb.getRawOne = vi.fn().mockResolvedValue({ total });
  return qb;
}

// A row as SQL Server returns it for the list query (flat, aliased columns)
const rawRow = {
  id: 7,
  name: 'iPhone 17',
  slug: 'iphone-17',
  shortDescription: null,
  thumbnailUrl: 'https://placehold.co/600x600',
  isFeatured: true,
  categoryName: 'Điện thoại',
  categorySlug: 'dien-thoai',
  brandName: 'Apple',
  brandSlug: 'apple',
  fromPrice: 22990000,
  listPrice: 24990000,
  totalStock: 0,
};

// Same defaults the DTO gives when the query string is empty
const query = (extra: Partial<ListProductsQueryDto> = {}) =>
  ({ sort: 'newest', page: 1, limit: 12, ...extra }) as ListProductsQueryDto;

describe('ProductsService', () => {
  let service: ProductsService;
  let qb: ReturnType<typeof fakeQueryBuilder>;
  const productsRepo = {
    findOne: vi.fn(),
    createQueryBuilder: vi.fn(),
    // the count query is built from repo.manager, so it needs a fake too
    manager: { createQueryBuilder: vi.fn() },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // One fake builder serves both the data query and the count query
    qb = fakeQueryBuilder([rawRow], 1);
    productsRepo.createQueryBuilder.mockReturnValue(qb);
    productsRepo.manager.createQueryBuilder.mockReturnValue(qb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productsRepo },
      ],
    }).compile();

    service = module.get(ProductsService);
  });

  describe('findAll', () => {
    it('turns flat SQL rows into nested JSON items', async () => {
      const result = await service.findAll(query());

      expect(result).toEqual({
        items: [
          {
            id: 7,
            name: 'iPhone 17',
            slug: 'iphone-17',
            shortDescription: null,
            thumbnailUrl: 'https://placehold.co/600x600',
            isFeatured: true,
            category: { name: 'Điện thoại', slug: 'dien-thoai' },
            brand: { name: 'Apple', slug: 'apple' },
            fromPrice: 22990000,
            listPrice: 24990000,
            inStock: false, // totalStock 0 -> out of stock
          },
        ],
        total: 1,
        page: 1,
        limit: 12,
      });
    });

    it('adds a WHERE condition only for the filters that were sent', async () => {
      await service.findAll(query({ category: 'laptop', q: 'asus' }));

      expect(qb.andWhere).toHaveBeenCalledWith('c.slug = :category', {
        category: 'laptop',
      });
      // The search text goes in a parameter, wrapped in % for LIKE
      expect(qb.andWhere).toHaveBeenCalledWith('p.name LIKE :q', {
        q: '%asus%',
      });
      expect(qb.andWhere).toHaveBeenCalledTimes(2); // no brand, no featured
    });

    it('filters prices with HAVING, on the price after sale', async () => {
      await service.findAll(query({ minPrice: 20000000, maxPrice: 30000000 }));

      expect(qb.andHaving).toHaveBeenCalledWith(
        `${EFFECTIVE_PRICE} >= :minPrice`,
        { minPrice: 20000000 },
      );
      expect(qb.andHaving).toHaveBeenCalledWith(
        `${EFFECTIVE_PRICE} <= :maxPrice`,
        { maxPrice: 30000000 },
      );
    });

    // One row per sort option: [sort, expected ORDER BY]
    it.each<[ListProductsQueryDto['sort'], string, 'ASC' | 'DESC']>([
      ['newest', 'p.createdAt', 'DESC'],
      ['price_asc', EFFECTIVE_PRICE, 'ASC'],
      ['price_desc', EFFECTIVE_PRICE, 'DESC'],
      ['name_asc', 'p.name', 'ASC'],
    ])('sort=%s orders by %s %s', async (sort, column, direction) => {
      await service.findAll(query({ sort }));
      expect(qb.orderBy).toHaveBeenCalledWith(column, direction);
    });

    it('skips (page - 1) * limit rows', async () => {
      await service.findAll(query({ page: 3, limit: 10 }));

      expect(qb.offset).toHaveBeenCalledWith(20);
      expect(qb.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('findBySlug', () => {
    it('throws 404 for an unknown or hidden product', async () => {
      productsRepo.findOne.mockResolvedValue(null);
      await expect(service.findBySlug('khong-co')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('hides variants that are not for sale', async () => {
      productsRepo.findOne.mockResolvedValue({
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
});
