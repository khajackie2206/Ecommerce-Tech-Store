## Mục tiêu

API danh sách sản phẩm cho trang cửa hàng, có lọc, tìm kiếm, sắp xếp và phân trang:

```
GET /api/v1/products?category=dien-thoai&brand=apple&q=pro&minPrice=20000000&maxPrice=40000000&featured=true&sort=price_asc&page=1&limit=12
```

| Tham số | Ý nghĩa | Mặc định |
|---|---|---|
| `category`, `brand` | Slug danh mục / hãng | (tất cả) |
| `q` | Từ khoá tìm trong tên sản phẩm | |
| `minPrice`, `maxPrice` | Khoảng giá (theo giá bán thấp nhất của sản phẩm) | |
| `featured` | `true`: chỉ sản phẩm nổi bật | |
| `sort` | `newest`, `price_asc`, `price_desc`, `name_asc` | `newest` |
| `page`, `limit` | Trang (từ 1), số sản phẩm mỗi trang (tối đa 50) | `1`, `12` |

Kết quả:

```json
{
  "items": [
    {
      "id": 1, "name": "iPhone 17 Pro Max", "slug": "iphone-17-pro-max",
      "shortDescription": "...", "thumbnailUrl": "...", "isFeatured": true,
      "category": { "name": "Điện thoại", "slug": "dien-thoai" },
      "brand": { "name": "Apple", "slug": "apple" },
      "fromPrice": 36990000, "listPrice": 37990000, "inStock": true
    }
  ],
  "total": 25, "page": 1, "limit": 12
}
```

**Làm sau:** task "Entity Product, ProductVariant, ProductImage". **Làm trước** task "API chi tiết sản phẩm" (cùng sửa `products.service.ts`).

**Đọc trước:** giáo trình Bài 8 và Phần 4 của bài học (truy vấn báo cáo, phân trang `OFFSET ... FETCH`).

## Vì sao dùng QueryBuilder thay vì `find()`?

Giá và tồn kho nằm ở **phiên bản**, không ở sản phẩm. "Giá từ" của một sản phẩm là `MIN(COALESCE(salePrice, price))` của các phiên bản, đúng câu truy vấn 2 ở task "Truy vấn báo cáo" (Phần 4). Lọc và sắp xếp theo con số **gộp** đó cần `GROUP BY` + `HAVING`, việc mà `find()` không làm được. **QueryBuilder** cho phép viết câu SQL như vậy bằng TypeScript, vẫn an toàn vì mọi giá trị đi qua tham số.

## Bước 1: DTO cho query string

Tạo `src/products/dto/list-products-query.dto.ts`:

```ts
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const PRODUCT_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'name_asc',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Query string of GET /api/v1/products, e.g.
// ?category=dien-thoai&brand=apple&minPrice=10000000&sort=price_asc&page=2
// Everything in a query string arrives as text, so numbers need @Type(() => Number).
export class ListProductsQueryDto {
  @IsOptional()
  @Matches(SLUG, { message: 'category phải là slug hợp lệ' })
  category?: string;

  @IsOptional()
  @Matches(SLUG, { message: 'brand phải là slug hợp lệ' })
  brand?: string;

  // Search text matched against the product name
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Từ khoá tối đa 100 ký tự' })
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'minPrice phải là số nguyên' })
  @Min(0, { message: 'minPrice không được âm' })
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxPrice phải là số nguyên' })
  @Min(0, { message: 'maxPrice không được âm' })
  maxPrice?: number;

  // "true" / "false" in the URL -> boolean; anything else fails @IsBoolean
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'featured phải là true hoặc false' })
  featured?: boolean;

  @IsOptional()
  @IsIn(PRODUCT_SORTS, {
    message: `sort chỉ nhận: ${PRODUCT_SORTS.join(', ')}`,
  })
  sort: ProductSort = 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page bắt đầu từ 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu 1' })
  @Max(50, { message: 'limit tối đa 50' })
  limit: number = 12;
}
```

Giải thích:
- Trên URL **mọi thứ đều là chuỗi** (`?page=2` cho ra `"2"`). `@Type(() => Number)` (từ `class-transformer`) đổi sang số **trước** khi `@IsInt()` kiểm tra. Có được nhờ `transform: true` trong ValidationPipe.
- `featured`: `@Type(() => Boolean)` **không** dùng được, vì `Boolean("false")` là `true` (chuỗi khác rỗng). `@Transform` tự đổi `"true"`/`"false"`, giá trị khác giữ nguyên để `@IsBoolean` báo lỗi.
- `sort: ProductSort = 'newest'`: giá trị mặc định khi không gửi. `as const` + `(typeof PRODUCT_SORTS)[number]` biến mảng thành kiểu `'newest' | 'price_asc' | ...` (giáo trình Phần 3, utility type).
- `@Max(50)` cho `limit`: không cho client xin 1 triệu sản phẩm một lần.

## Bước 2: Service

Thay toàn bộ `src/products/products.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
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
}
```

Giải thích theo thứ tự chạy:
1. `buildListQuery` dựng phần **dùng chung**: JOIN danh mục, hãng, phiên bản; `WHERE` theo bộ lọc; `GROUP BY` theo sản phẩm; `HAVING` theo giá.
   - `.innerJoin('p.variants', 'v', 'v.isActive = 1')`: tham số thứ ba là điều kiện JOIN thêm, chỉ tính phiên bản đang bán.
   - `.andWhere('c.slug = :category', { category: query.category })`: `:category` là **tham số**. TypeORM gửi giá trị riêng, không ghép vào câu SQL, nên `?category='; DROP TABLE Products;--` vô hại.
   - `q: \`%${query.q}%\``: dấu `%` của `LIKE` nằm trong **giá trị**, không trong câu SQL.
   - Lọc giá đặt ở `HAVING` chứ không ở `WHERE`: `WHERE` chạy **trước** `GROUP BY` nên chưa có `MIN(...)`; `HAVING` chạy **sau**, lọc trên kết quả đã gộp.
2. `findAll` lấy **một trang**: `base.clone()` để không sửa query gốc, rồi chọn các cột kèm **alias** (`'categoryName'`...), sắp xếp, `offset`/`limit` (TypeORM sinh `OFFSET ... FETCH NEXT ...`).
   - `addOrderBy('p.id', 'DESC')`: dữ liệu mẫu có nhiều sản phẩm cùng `createdAt`, cùng giá. Không có cột phụ để phân định thì SQL Server được phép trả thứ tự khác nhau mỗi lần, một sản phẩm có thể xuất hiện ở cả trang 1 lẫn trang 2.
3. Đếm tổng: bọc query gốc thành **truy vấn con** rồi `COUNT(*)`, tức đếm số nhóm (số sản phẩm) thoả bộ lọc.
4. `Promise.all([...])`: hai câu SQL chạy **song song**, không chờ nhau.
5. `getRawMany` trả từng dòng phẳng (`categoryName`, `brandName`...); `rows.map(...)` gom lại thành object lồng nhau `category: { name, slug }` cho dễ dùng ở frontend.

`ProductListItem`, `ProductListResult` là `interface` mô tả kết quả trả về, để controller và (sau này) frontend biết chính xác hình dạng dữ liệu.

## Bước 3: Controller

Thay toàn bộ `src/products/products.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
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
}
```

`@Query() query: ListProductsQueryDto`: lấy **toàn bộ** query string, ValidationPipe kiểm tra theo DTO. Tham số lạ như `?foo=1` bị trả 400 (nhờ `forbidNonWhitelisted`).

## Bước 4: Sửa 2 file test do CLI sinh ra

Service giờ cần `Repository<Product>`, controller cần `ProductsService`, nên 2 file test cũ lỗi "can't resolve dependencies". Thay `src/products/products.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from './entities/product.entity.js';
import { ProductsService } from './products.service.js';

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        // The service now needs Repository<Product>: give it an empty fake one
        { provide: getRepositoryToken(Product), useValue: {} },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      // The controller now needs ProductsService: give it an empty fake one
      providers: [{ provide: ProductsService, useValue: {} }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
```

`useValue: {}`: object rỗng là đủ cho test "should be defined". Logic danh sách phụ thuộc vào SQL thật, nên được kiểm tra bằng test e2e ở bước sau.

## Bước 5: Xem câu SQL TypeORM sinh ra

Trong `src/app.module.ts`, thêm vào cấu hình `TypeOrmModule.forRootAsync`, ngay dưới dòng `synchronize`:

```ts
        // DB_LOGGING=true prints every SQL query TypeORM sends (handy while learning)
        logging: config.get('DB_LOGGING') === 'true',
```

Thêm vào cuối `.env.example` (và `.env` của bạn):

```
# true = print every SQL query in the API log
DB_LOGGING=false
```

Đặt `DB_LOGGING=true` trong `.env`, khởi động lại API, gọi `GET /api/v1/products?category=laptop`. Log hiện **đúng 2 câu** `query:` cho mỗi request: một lấy dữ liệu, một đếm tổng. Nếu viết kiểu lấy danh sách sản phẩm rồi lặp từng sản phẩm để hỏi giá, sẽ thành 1 + 25 câu: đó là lỗi **N+1**.

## Bước 6: Test e2e

Trong `test/products.e2e-spec.ts`, thêm `import request from 'supertest';` lên đầu file, và thêm test này vào trong `describe`:

```ts
  it('GET /api/v1/products filters by category and sorts by price', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products?category=laptop&sort=price_asc')
      .expect(200);

    expect(res.body.total).toBe(9);
    const prices = res.body.items.map(
      (item: { fromPrice: number }) => item.fromPrice,
    );
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
```

`[...prices].sort(...)`: tạo bản đã sắp xếp rồi so với bản gốc; bằng nhau nghĩa là API đã trả đúng thứ tự tăng dần.

## Bước 7: Gọi thử

Tạo `server/requests/products.http`:

```http
@baseUrl = http://localhost:3000/api/v1

### Laptops, cheapest first -> total 9, first: ASUS Vivobook 15 (13.990.000)
GET {{baseUrl}}/products?category=laptop&sort=price_asc

### Apple phones -> total 4
GET {{baseUrl}}/products?brand=apple&category=dien-thoai

### 20-30 million, most expensive first -> total 5, first: Galaxy S25 Ultra
GET {{baseUrl}}/products?minPrice=20000000&maxPrice=30000000&sort=price_desc

### Search -> total 4 (Samsung Galaxy ...)
GET {{baseUrl}}/products?q=galaxy

### Featured on the home page -> total 5
GET {{baseUrl}}/products?featured=true

### Page 3 of 10 -> 5 items (25 products in total)
GET {{baseUrl}}/products?page=3&limit=10&sort=name_asc

### Invalid values -> 400 with 6 messages
GET {{baseUrl}}/products?sort=cheap&limit=100&minPrice=-1&featured=yes&page=0&brand=Apple%20Inc
```

## Kiểm tra

- [ ] Các request ở Bước 7 trả đúng tổng số và thứ tự như ghi chú
- [ ] Với `DB_LOGGING=true`, mỗi request danh sách chỉ có 2 câu SQL
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Giải thích được: vì sao lọc giá dùng `HAVING`; vì sao cần `addOrderBy('p.id')`
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Cho phép lọc nhiều hãng một lúc: `?brand=apple,samsung` (gợi ý: tách chuỗi bằng `split(',')`, dùng `b.slug IN (:...brands)`).
2. Thêm `sort=discount`: sản phẩm giảm giá nhiều nhất trước.
