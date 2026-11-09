## Mục tiêu

Tạo module `products` và 3 entity khớp với 3 bảng sản phẩm có sẵn: `Product`, `ProductVariant`, `ProductImage`, cùng các **quan hệ** giữa chúng và với `Category`, `Brand`. Kết quả: một câu lệnh TypeORM lấy được sản phẩm kèm danh mục, hãng, phiên bản và ảnh.

**Làm sau:** cả hai task DTO của Phần 3 (`categories`, `brands`) đã merge. Bắt đầu bằng `git switch main`, `git pull`, `npm run setup`, `npm run db:reset`.

**Đọc trước:** giáo trình Bài 8, mục 8.1–8.3 (quan hệ giữa các bảng).

## Quan hệ cần mô tả

```
Categories 1 ──< Products >── 1 Brands
                    │
            1 ──────┴────── 1
            │               │
    ProductVariants (n)  ProductImages (n)
```

| Quan hệ | Phía "nhiều" (có cột khoá ngoại) | Phía "một" |
|---|---|---|
| Danh mục – sản phẩm | `Product.categoryId` + `@ManyToOne` | (không cần khai báo ở `Category`) |
| Hãng – sản phẩm | `Product.brandId` + `@ManyToOne` | (không cần khai báo ở `Brand`) |
| Sản phẩm – phiên bản | `ProductVariant.productId` + `@ManyToOne` | `Product.variants` + `@OneToMany` |
| Sản phẩm – ảnh | `ProductImage.productId` + `@ManyToOne` | `Product.images` + `@OneToMany` |

Quy tắc của giáo trình Bài 8: `@ManyToOne` đặt ở bảng **chứa khoá ngoại**. `@OneToMany` là chiều ngược lại, chỉ để đọc dữ liệu tiện hơn, nó **không** tạo cột nào. `Category` và `Brand` không cần chiều ngược vì ta không bao giờ cần "danh mục kèm toàn bộ sản phẩm" trong một lần đọc.

## Bước 1: Sinh khung

```powershell
cd server
npx nest g module products
npx nest g service products
npx nest g controller products
```

## Bước 2: Transformer cho cột JSON

Cột `Products.specs` là `NVARCHAR(MAX)` chứa **chuỗi** JSON. Ta muốn trong TypeScript nó là **object** (`product.specs.chip`). Transformer là cặp hàm TypeORM gọi mỗi khi ghi (`to`) và đọc (`from`) cột đó.

Tạo `src/common/transformers.ts`:

```ts
import type { ValueTransformer } from 'typeorm';

// NVARCHAR(MAX) column holding JSON text <-> plain object in TypeScript.
// Example: '{"chip":"Apple A19 Pro"}' in SQL Server becomes { chip: 'Apple A19 Pro' }.
export const jsonTransformer: ValueTransformer = {
  to: (value: unknown) => (value == null ? null : JSON.stringify(value)),
  from: (value: string | null) => (value == null ? null : JSON.parse(value)),
};
```

`value == null` (hai dấu bằng) đúng cho cả `null` lẫn `undefined`.

## Bước 3: Ba entity

Tạo thư mục `src/products/entities/` và 3 file.

`src/products/entities/product.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Brand } from '../../brands/brand.entity.js';
import { Category } from '../../categories/category.entity.js';
import { jsonTransformer } from '../../common/transformers.js';
import { ProductImage } from './product-image.entity.js';
import { ProductVariant } from './product-variant.entity.js';

// Maps the existing Products table (database/schema.sql). One row per model,
// e.g. "iPhone 17 Pro Max"; prices and stock live in ProductVariant.
@Entity('Products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  // Foreign key column, kept as a plain property so filters can use it directly
  @Column({ type: 'int' })
  categoryId: number;

  // MANY products belong to ONE category; @JoinColumn reuses the categoryId column above
  @ManyToOne(() => Category)
  @JoinColumn({ name: 'categoryId' })
  category: Relation<Category>;

  @Column({ type: 'int' })
  brandId: number;

  @ManyToOne(() => Brand)
  @JoinColumn({ name: 'brandId' })
  brand: Relation<Brand>;

  @Column({ type: 'nvarchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 220, unique: true })
  slug: string;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  shortDescription: string | null;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  description: string | null;

  // JSON text in the database, a plain object in TypeScript
  @Column({
    type: 'nvarchar',
    length: 'MAX',
    nullable: true,
    transformer: jsonTransformer,
  })
  specs: Record<string, string> | null;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  thumbnailUrl: string | null;

  @Column({ type: 'bit', default: false })
  isFeatured: boolean;

  @Column({ type: 'bit', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime2' })
  createdAt: Date;

  // TypeORM sets this automatically every time the row is saved
  @UpdateDateColumn({ type: 'datetime2' })
  updatedAt: Date;

  // ONE product has MANY variants / images (the inverse side: creates no column)
  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants: Relation<ProductVariant[]>;

  @OneToMany(() => ProductImage, (image) => image.product)
  images: Relation<ProductImage[]>;
}
```

`src/products/entities/product-variant.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Product } from './product.entity.js';

// Maps the existing ProductVariants table: a buyable option of a product,
// e.g. "256GB - Cam vũ trụ", with its own price and stock.
@Entity('ProductVariants')
export class ProductVariant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  productId: number;

  // MANY variants belong to ONE product
  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  @Column({ type: 'varchar', length: 50, unique: true })
  sku: string;

  @Column({ type: 'nvarchar', length: 150 })
  name: string;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  color: string | null;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  storage: string | null;

  // DECIMAL(18,2): money is never stored as FLOAT. The mssql driver returns it as a number.
  @Column({ type: 'decimal', precision: 18, scale: 2 })
  price: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  salePrice: number | null;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'bit', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime2' })
  createdAt: Date;
}
```

`src/products/entities/product-image.entity.ts`:

```ts
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Product } from './product.entity.js';

// Maps the existing ProductImages table: gallery images of a product
@Entity('ProductImages')
export class ProductImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  productId: number;

  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  @Column({ type: 'nvarchar', length: 500 })
  url: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
```

Giải thích:
- **Cột khoá ngoại + quan hệ đi cặp**: `categoryId: number` là cột thật, `category: Relation<Category>` là object được nạp khi cần. `@JoinColumn({ name: 'categoryId' })` nói rằng quan hệ dùng **chính cột đó**, không tạo cột mới. Giữ cả hai giúp lọc nhanh `where: { categoryId: 1 }` mà không phải JOIN.
- **`Relation<...>` và `import type { Relation }`**: `product.entity.ts` import `product-variant.entity.ts` và ngược lại (import vòng). Với ES Module của NestJS 12, viết kiểu trực tiếp có thể làm app lỗi lúc khởi động. Quy tắc từ giáo trình Bài 8.2: **thuộc tính quan hệ luôn bọc `Relation<>`**.
- **`() => Category`** (hàm trả về class) thay vì `Category`: vì import vòng, lúc file được nạp class có thể chưa sẵn sàng; hàm chỉ được gọi sau khi mọi thứ đã nạp xong.
- **`(variant) => variant.product`**: chỉ cho TypeORM biết hai đầu `@OneToMany` / `@ManyToOne` là cùng một quan hệ.
- **`length: 'MAX'`**: ứng với `NVARCHAR(MAX)`.
- **`decimal`**: driver `mssql` trả `DECIMAL(18,2)` về **kiểu number** (đã kiểm tra), nên dùng thẳng được. Giá VND đủ nhỏ để `number` của JavaScript giữ chính xác.
- **`@UpdateDateColumn`**: TypeORM tự cập nhật thời điểm mỗi lần `save()`.
- **`onDelete: 'CASCADE'`**: khớp với `ON DELETE CASCADE` trong `schema.sql`. Vì `DB_SYNCHRONIZE=false`, tuỳ chọn này chỉ để mô tả, quy tắc thật do SQL Server thực thi.

## Bước 4: Đăng ký entity

Thay toàn bộ `src/products/products.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  // One module owns the three product tables
  imports: [TypeOrmModule.forFeature([Product, ProductVariant, ProductImage])],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
```

## Bước 5: Test e2e kiểm tra entity khớp với bảng thật

Unit test với repository giả **không** phát hiện được entity khai báo sai tên cột hay sai kiểu. Chỉ chạy với SQL Server thật mới biết. Tạo `test/products.e2e-spec.ts` (chỉ phần đầu, các task sau thêm tiếp):

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Product } from './../src/products/entities/product.entity.js';

// Checks that the product entities match the real tables (SQL Server must be running)
describe('Product entities (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('loads a product with its category, brand, variants and images', async () => {
    const repo = app.get(DataSource).getRepository(Product);
    const product = await repo.findOne({
      where: { slug: 'iphone-17-pro-max' },
      relations: { category: true, brand: true, variants: true, images: true },
    });

    expect(product?.name).toBe('iPhone 17 Pro Max');
    expect(product?.category.slug).toBe('dien-thoai');
    expect(product?.brand.slug).toBe('apple');
    expect(product?.variants).toHaveLength(4);
    expect(product?.images).toHaveLength(3);
    // Transformers: JSON text -> object, DECIMAL -> number
    expect(product?.specs?.chip).toBe('Apple A19 Pro');
    expect(typeof product?.variants[0]?.price).toBe('number');
  });
});
```

- `app.get(DataSource)`: lấy kết nối TypeORM từ app đang chạy trong test.
- `relations: { category: true, ... }`: yêu cầu TypeORM JOIN và nạp luôn các quan hệ (giáo trình Bài 8.3). Bỏ một mục đi thì thuộc tính đó là `undefined`.

`ProductsService` và `ProductsController` do CLI sinh ra lúc này vẫn là class rỗng, chưa cần gì, nên 2 file test do CLI sinh ra vẫn qua. Task tiếp theo (API danh sách) thêm repository vào service thì mới phải sửa chúng.

## Thứ tự 4 task của Phần 6

| Task | Làm khi nào |
|---|---|
| Entity sản phẩm (task này) | Đầu tiên: 3 task kia đều cần |
| Exception filter cho lỗi SQL Server | Làm **song song** với task này được, không đụng file nào chung |
| API danh sách sản phẩm | Sau task này |
| API chi tiết sản phẩm | Sau API danh sách (cùng sửa `products.service.ts`) |

## Kiểm tra

- [ ] `npm run lint`, `npm test`, `npm run test:e2e` (cần `npm run db:up`) đều qua
- [ ] Đổi thử `@Column({ type: 'nvarchar', length: 200 }) name` thành `title`, chạy `test:e2e` để thấy lỗi `Invalid column name 'title'`, rồi sửa lại
- [ ] Giải thích được: vì sao `Product` có cả `categoryId` lẫn `category`; vì sao `Category` không cần `@OneToMany`
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review
