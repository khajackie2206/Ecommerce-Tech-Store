## Mục tiêu

API cho trang chi tiết sản phẩm: `GET /api/v1/products/:slug` trả sản phẩm kèm danh mục, hãng, các **phiên bản đang bán** (xếp theo giá) và **ảnh** (xếp theo thứ tự). Không có hoặc đã ẩn → 404.

**Làm sau:** task "API danh sách sản phẩm" (cùng sửa `products.service.ts`, `products.controller.ts`).

**Đọc trước:** giáo trình Bài 8, mục 8.3 (đọc dữ liệu kèm quan hệ).

## Vì sao lần này dùng `find()`?

Trang chi tiết cần **một** sản phẩm với **toàn bộ** quan hệ, không cần gộp hay tính toán. `findOne` với `relations` (giáo trình Bài 8.3) gọn và dễ đọc hơn QueryBuilder. Chọn công cụ theo việc: `find` cho đọc đơn giản kèm quan hệ, QueryBuilder khi cần `GROUP BY`/`HAVING`/tính toán.

## Bước 1: Service

Trong `src/products/products.service.ts`:

1. Đổi dòng import đầu tiên thành:

   ```ts
   import { Injectable, NotFoundException } from '@nestjs/common';
   ```

2. Thêm method này vào **cuối** class `ProductsService` (sau `buildListQuery`):

   ```ts
     // Product detail page: everything about one product
     async findBySlug(slug: string): Promise<Product> {
       const product = await this.productsRepo.findOne({
         where: { slug, isActive: true },
         relations: { category: true, brand: true, variants: true, images: true },
         order: { images: { sortOrder: 'ASC' }, variants: { price: 'ASC' } },
       });
       if (!product)
         throw new NotFoundException(`Không tìm thấy sản phẩm "${slug}"`);

       // Hidden variants (isActive = false) are not for sale
       product.variants = product.variants.filter((variant) => variant.isActive);
       return product;
     }
   ```

File hoàn chỉnh sau bước này:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { Product } from './entities/product.entity.js';

// One card in a product list: what the shop pages need, nothing more
export interface ProductListItem {
  id: number;
  name: string;
  slug: string;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  isFeatured: boolean;
  category: { name: string; slug: string };
  brand: { name: string; slug: string };
  fromPrice: number; // cheapest variant, sale price included ("Giá từ ...")
  listPrice: number; // cheapest list price, shown struck through when higher
  inStock: boolean;
}

export interface ProductListResult {
  items: ProductListItem[];
  total: number;
  page: number;
  limit: number;
}

// Shape of one row returned by the list query (column aliases below)
interface ProductListRow {
  id: number;
  name: string;
  slug: string;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  isFeatured: boolean;
  categoryName: string;
  categorySlug: string;
  brandName: string;
  brandSlug: string;
  fromPrice: number;
  listPrice: number;
  totalStock: number;
}

// Effective price of a variant: the sale price when there is one
const EFFECTIVE_PRICE = 'MIN(COALESCE(v.salePrice, v.price))';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  async findAll(query: ListProductsQueryDto): Promise<ProductListResult> {
    const base = this.buildListQuery(query);

    // 1. One page of rows: product + category + brand + prices, in ONE query (no N+1)
    const dataQuery = base
      .clone()
      .select('p.id', 'id')
      .addSelect('p.name', 'name')
      .addSelect('p.slug', 'slug')
      .addSelect('p.shortDescription', 'shortDescription')
      .addSelect('p.thumbnailUrl', 'thumbnailUrl')
      .addSelect('p.isFeatured', 'isFeatured')
      .addSelect('c.name', 'categoryName')
      .addSelect('c.slug', 'categorySlug')
      .addSelect('b.name', 'brandName')
      .addSelect('b.slug', 'brandSlug')
      .addSelect(EFFECTIVE_PRICE, 'fromPrice')
      .addSelect('MIN(v.price)', 'listPrice')
      .addSelect('SUM(v.stock)', 'totalStock');

    switch (query.sort) {
      case 'price_asc':
        dataQuery.orderBy(EFFECTIVE_PRICE, 'ASC');
        break;
      case 'price_desc':
        dataQuery.orderBy(EFFECTIVE_PRICE, 'DESC');
        break;
      case 'name_asc':
        dataQuery.orderBy('p.name', 'ASC');
        break;
      default:
        dataQuery.orderBy('p.createdAt', 'DESC');
    }
    // Tie-breaker: rows with the same price/date always come back in the same order,
    // otherwise a product could appear on two pages
    dataQuery.addOrderBy('p.id', 'DESC');

    // OFFSET ... FETCH NEXT ... (the pagination SQL from Part 4)
    dataQuery.offset((query.page - 1) * query.limit).limit(query.limit);

    // 2. Total number of matching products, for the pager:
    //    count the grouped rows of the same query
    const countQuery = this.productsRepo.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from(`(${base.getQuery()})`, 'matches')
      .setParameters(base.getParameters());

    const [rows, countRow] = await Promise.all([
      dataQuery.getRawMany<ProductListRow>(),
      countQuery.getRawOne<{ total: number }>(),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        shortDescription: row.shortDescription,
        thumbnailUrl: row.thumbnailUrl,
        isFeatured: row.isFeatured,
        category: { name: row.categoryName, slug: row.categorySlug },
        brand: { name: row.brandName, slug: row.brandSlug },
        fromPrice: row.fromPrice,
        listPrice: row.listPrice,
        inStock: row.totalStock > 0,
      })),
      total: countRow?.total ?? 0,
      page: query.page,
      limit: query.limit,
    };
  }

  // Joins, filters and grouping shared by the data query and the count query
  private buildListQuery(
    query: ListProductsQueryDto,
  ): SelectQueryBuilder<Product> {
    const qb = this.productsRepo
      .createQueryBuilder('p')
      .innerJoin('p.category', 'c')
      .innerJoin('p.brand', 'b')
      // Only active variants count towards price and stock
      .innerJoin('p.variants', 'v', 'v.isActive = 1')
      .select('p.id')
      .where('p.isActive = 1')
      .groupBy('p.id')
      .addGroupBy('p.name')
      .addGroupBy('p.slug')
      .addGroupBy('p.shortDescription')
      .addGroupBy('p.thumbnailUrl')
      .addGroupBy('p.isFeatured')
      .addGroupBy('p.createdAt')
      .addGroupBy('c.name')
      .addGroupBy('c.slug')
      .addGroupBy('b.name')
      .addGroupBy('b.slug');

    // Values are always passed as :parameters, never glued into the SQL text
    if (query.category)
      qb.andWhere('c.slug = :category', { category: query.category });
    if (query.brand) qb.andWhere('b.slug = :brand', { brand: query.brand });
    if (query.q) qb.andWhere('p.name LIKE :q', { q: `%${query.q}%` });
    if (query.featured !== undefined)
      qb.andWhere('p.isFeatured = :featured', { featured: query.featured });

    // Price filters apply to the aggregated price, so they go in HAVING, not WHERE
    if (query.minPrice !== undefined)
      qb.andHaving(`${EFFECTIVE_PRICE} >= :minPrice`, {
        minPrice: query.minPrice,
      });
    if (query.maxPrice !== undefined)
      qb.andHaving(`${EFFECTIVE_PRICE} <= :maxPrice`, {
        maxPrice: query.maxPrice,
      });

    return qb;
  }

  // Product detail page: everything about one product
  async findBySlug(slug: string): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: { slug, isActive: true },
      relations: { category: true, brand: true, variants: true, images: true },
      order: { images: { sortOrder: 'ASC' }, variants: { price: 'ASC' } },
    });
    if (!product)
      throw new NotFoundException(`Không tìm thấy sản phẩm "${slug}"`);

    // Hidden variants (isActive = false) are not for sale
    product.variants = product.variants.filter((variant) => variant.isActive);
    return product;
  }
}
```

Giải thích:
- `where: { slug, isActive: true }`: sản phẩm bị ẩn cũng trả 404, khách không xem được.
- `relations: {...}`: TypeORM JOIN 4 bảng và nạp đủ quan hệ.
- `order: { images: { sortOrder: 'ASC' }, variants: { price: 'ASC' } }`: sắp xếp **bên trong** các quan hệ: ảnh theo thứ tự hiển thị, phiên bản rẻ nhất trước.
- Lọc phiên bản `isActive` bằng `filter` trong JavaScript, **không** đưa vào `where`: nếu viết `where: { variants: { isActive: true } }`, sản phẩm mà mọi phiên bản đều đang ẩn sẽ biến mất hẳn (404) thay vì hiện "hết hàng".

## Bước 2: Controller

Đổi import đầu file `src/products/products.controller.ts` thành:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
```

và thêm method sau `findAll`. File hoàn chỉnh:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
// Regular import: ValidationPipe needs the DTO class at runtime
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // GET /api/v1/products?category=&brand=&q=&minPrice=&maxPrice=&featured=&sort=&page=&limit=
  @Get()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productsService.findAll(query);
  }

  // GET /api/v1/products/iphone-17-pro-max
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug);
  }
}
```

Route `GET /products` (danh sách) và `GET /products/:slug` không đụng nhau: có thêm một đoạn sau `/products` thì vào `:slug`.

## Bước 3: Unit test thật cho service và controller

Thay `src/products/products.service.spec.ts`:

```ts
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
```

Thay `src/products/products.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

describe('ProductsController', () => {
  let controller: ProductsController;

  // The controller only talks to the service, so a fake service is enough here
  const fakeService = {
    findBySlug: vi.fn().mockResolvedValue({ slug: 'iphone-17' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: fakeService }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes the slug to the service', async () => {
    await expect(controller.findBySlug('iphone-17')).resolves.toEqual({
      slug: 'iphone-17',
    });
    expect(fakeService.findBySlug).toHaveBeenCalledWith('iphone-17');
  });
});
```

- Test thứ hai của service kiểm tra **logic của ta** (lọc phiên bản ẩn), không kiểm tra TypeORM. Đó là điều unit test nên làm.
- `toHaveBeenCalledWith('iphone-17')`: kiểm tra controller truyền đúng slug xuống service.

## Bước 4: Test e2e

Thêm vào trong `describe` của `test/products.e2e-spec.ts`:

```ts
  it('GET /api/v1/products/:slug returns 404 for an unknown product', () => {
    return request(app.getHttpServer())
      .get('/api/v1/products/khong-ton-tai')
      .expect(404);
  });
```

## Bước 5: Gọi thử

Thêm vào `server/requests/products.http`:

```http
### Detail: 4 variants (cheapest first), 3 images, specs as an object
GET {{baseUrl}}/products/iphone-17-pro-max

### Unknown slug -> 404
GET {{baseUrl}}/products/khong-ton-tai
```

Trong kết quả của request đầu: `variants` xếp theo `price` tăng dần, `images` có `sortOrder` 1, 2, 3, `specs.chip` là `"Apple A19 Pro"`.

Thử ẩn một phiên bản rồi gọi lại, chạy trong VS Code (database `TechStoreDb`):

```sql
UPDATE ProductVariants SET isActive = 0 WHERE sku = 'IP17PM-1TB-ORG';
```

Gọi lại request đầu: còn 3 phiên bản. Trả lại như cũ bằng `UPDATE ... SET isActive = 1 ...` hoặc `npm run db:reset`.

## Kiểm tra

- [ ] Request chi tiết trả đủ quan hệ, đúng thứ tự; slug lạ trả 404
- [ ] Phiên bản bị ẩn không còn trong kết quả
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

Bật `DB_LOGGING=true` và gọi request chi tiết. Đếm số câu SQL TypeORM gửi đi, rồi đọc câu đó để thấy các `LEFT JOIN` được sinh ra từ `relations`.
