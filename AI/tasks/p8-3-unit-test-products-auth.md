## Mục tiêu

Viết unit test cho phần logic khó nhất của API:

- `ProductsService.findAll`: lọc, sắp xếp, phân trang bằng **QueryBuilder**, rồi chuyển dòng dữ liệu SQL thành JSON lồng nhau.
- `ProductsService.findBySlug` và `ProductsController` (thay hai file spec "should be defined" đang hỏng).
- `AuthService.getProfile` (Phần 7 đã test đăng ký, đăng nhập; phần này còn thiếu).

Cuối task `npm test` qua hết, `products.service.ts` và `auth.service.ts` đạt gần 100% số dòng trong `npm run test:cov`.

**Làm sau:** Phần 7 đã merge. Làm **song song** được với hai task còn lại của Phần 8. Nếu task "Unit test CategoriesService và BrandsService" chưa merge thì chưa có cấu hình coverage trong `vitest.config.ts`: `npm run test:cov` vẫn chạy được, chỉ là bảng dài hơn.

**Đọc trước:** giáo trình Bài 10; task "Unit test CategoriesService và BrandsService" (giải thích `vi.fn()`, `mockResolvedValueOnce`, `it.each`).

## Làm sao test code dùng QueryBuilder mà không có database?

`findAll` gọi một chuỗi dài: `createQueryBuilder('p').innerJoin(...).where(...).andWhere(...)...getRawMany()`. Ta không cần SQL Server thật, chỉ cần một object **giả** mà:

1. mọi method dựng câu (`select`, `andWhere`, `orderBy`...) **trả về chính nó**, để chuỗi gọi nối tiếp được;
2. các method **chạy câu** (`getRawMany`, `getRawOne`) trả về dữ liệu ta tự chọn.

Sau đó kiểm tra: service có gọi `andWhere` với đúng điều kiện không, `orderBy` đúng cột không, `offset` đúng số không. Câu SQL thật có chạy đúng hay không thì test e2e (Phần 6) đã lo.

## Bước 1: Test `ProductsService`

Thay toàn bộ `src/products/products.service.spec.ts`:

```ts
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
```

Giải thích:
- `vi.fn().mockReturnThis()`: hàm giả trả về `this`, tức chính object `qb`. Nhờ vậy `qb.select(...).addSelect(...)` không bị lỗi `undefined`. Danh sách `chain` liệt kê mọi method service gọi; thêm method mới vào service mà quên thêm vào đây thì test báo `qb.xxx is not a function`.
- `productsRepo.manager.createQueryBuilder`: câu đếm tổng được dựng từ `repo.manager`, không phải từ repo, nên đồ giả cũng phải có `manager`.
- Một `qb` giả dùng chung cho cả câu lấy dữ liệu lẫn câu đếm: `getRawMany` trả các dòng, `getRawOne` trả `{ total }`.
- Test đầu kiểm tra phần **biến đổi dữ liệu**: dòng phẳng (`categoryName`, `categorySlug`) thành object lồng (`category: { name, slug }`), `totalStock: 0` thành `inStock: false`. Đây là logic của ta, đáng test nhất.
- `toHaveBeenCalledTimes(2)`: chỉ gửi `category` và `q` thì chỉ có 2 điều kiện, không thừa điều kiện `brand` hay `featured` nào.
- `it.each<[sort, column, direction]>`: một test cho mỗi kiểu sắp xếp. Thêm kiểu sắp xếp mới (ví dụ `bestseller`) thì chỉ cần thêm một dòng.
- `as ListProductsQueryDto`: hàm `query()` dựng object có các giá trị mặc định như DTO (`page: 1`, `limit: 12`), rồi ép kiểu vì không phải instance thật của class DTO. Chỉ dùng cách này trong test.

## Bước 2: Test `ProductsController`

Thay toàn bộ `src/products/products.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

describe('ProductsController', () => {
  let controller: ProductsController;

  // Fake service: list and detail return recognisable values
  const fakeService = {
    findAll: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 12 }),
    findBySlug: vi.fn().mockResolvedValue({ slug: 'iphone-17' }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: fakeService }],
    }).compile();

    controller = module.get(ProductsController);
  });

  it('findAll passes the parsed query string to the service', async () => {
    const query = {
      category: 'laptop',
      page: 1,
      limit: 12,
    } as ListProductsQueryDto;

    await expect(controller.findAll(query)).resolves.toMatchObject({
      total: 0,
    });
    expect(fakeService.findAll).toHaveBeenCalledWith(query);
  });

  it('findBySlug passes the slug to the service', async () => {
    await expect(controller.findBySlug('iphone-17')).resolves.toEqual({
      slug: 'iphone-17',
    });
    expect(fakeService.findBySlug).toHaveBeenCalledWith('iphone-17');
  });
});
```

## Bước 3: Bổ sung test `getProfile` cho `AuthService`

Trong `src/auth/auth.service.spec.ts`:

1. Thêm `findById` vào `UsersService` giả:

   ```ts
   const usersService = {
     findByEmail: vi.fn(),
     create: vi.fn(),
     findById: vi.fn(),
   };
   ```

2. Thêm khối sau vào **cuối** `describe('AuthService', ...)`, ngay trước dấu `});` cuối file:

   ```ts
     describe('getProfile', () => {
       it('returns fresh data from the database', async () => {
         usersService.findById.mockResolvedValue(
           makeUser({ fullName: 'Tên mới' }),
         );

         const user = await service.getProfile(
           'A1B2C3D4-0000-0000-0000-000000000001',
         );

         expect(user.fullName).toBe('Tên mới');
         expect(usersService.findById).toHaveBeenCalledWith(
           'A1B2C3D4-0000-0000-0000-000000000001',
         );
       });

       // Token still valid, but the account changed after login
       it.each([
         ['deleted', null],
         ['locked', makeUser({ isActive: false })],
       ])('rejects a %s account with 401', async (_why, found) => {
         usersService.findById.mockResolvedValue(found);
         await expect(service.getProfile('any-id')).rejects.toThrow(
           UnauthorizedException,
         );
       });
     });
   ```

Hai trường hợp `deleted` và `locked` là lý do `getProfile` đọc lại database thay vì tin vào token (Phần 7, task AuthGuard).

## Bước 4: Chạy và đo độ phủ

```powershell
cd server
npm test
npm run test:cov
```

Kết quả mong đợi: `npm test` qua hết (khi viết hướng dẫn: 83 test). Trong bảng coverage:

```
 src/products      |   95.45 |    81.81 |     100 |    97.5 |
  ...ts.service.ts |   94.87 |       85 |     100 |   97.14 | 161
  auth.service.ts  |     100 |    93.75 |     100 |     100 | 20
```

Cột cuối `Uncovered Line #s` chỉ đúng dòng chưa test nào chạy tới. Dòng 161 của `products.service.ts` (vị trí có thể lệch một chút với code của bạn) là bộ lọc `featured`: chưa test nào gửi `featured`.

## Kiểm tra

- [ ] `npm test` qua hết, không còn file spec "should be defined" nào hỏng
- [ ] Giải thích được vì sao QueryBuilder giả cần `mockReturnThis()`
- [ ] Giải thích được unit test `findAll` kiểm tra gì và **không** kiểm tra gì (câu SQL thật do e2e kiểm tra)
- [ ] `npm run lint` qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Viết test cho bộ lọc `featured` và `brand` để `products.service.ts` đạt 100% số dòng.
2. Tạm sửa `service.findAll` cho `offset` thành `query.page * query.limit` (quên trừ 1). Test nào đỏ? Thông báo lỗi nói gì? Trả lại như cũ.
3. Viết `src/users/users.service.spec.ts` có thêm test cho `findById` (dòng 27 của `users.service.ts` đang chưa được test).
