## Mục tiêu

Chuyển module `brands` từ mảng trong bộ nhớ sang **SQL Server** bằng TypeORM: viết **entity** khớp với bảng `Brands` có sẵn, dùng **Repository** để đọc/ghi. Các API giữ nguyên, nhưng dữ liệu giờ còn mãi sau khi tắt API.

**Làm sau:** task "DTO và validation cho brands" (Phần 3) và task "Đọc hiểu schema.sql" (Phần 4). Bắt đầu bằng `git switch main`, `git pull`, `npm run setup`, `npm run db:reset`.

**Đọc trước:** giáo trình Bài 7 (kết nối NestJS với SQL Server bằng TypeORM).

## Khác với giáo trình ở điểm nào?

Giáo trình Bài 7 bật `synchronize: true`: TypeORM **tự tạo bảng** theo entity. Dự án này thì ngược lại: bảng đã có sẵn trong `database/schema.sql`, `.env` để `DB_SYNCHRONIZE=false`, nên entity phải **mô tả đúng** bảng có sẵn. Đây cũng là cách làm ở hầu hết dự án thật, khi database đã tồn tại trước code.

Kết nối SQL Server đã được cấu hình sẵn trong `src/app.module.ts`, task này chỉ cần thêm entity cho module.

| Khái niệm | Là gì |
|---|---|
| **Entity** | Class mô tả một bảng: mỗi property là một cột |
| **Repository** | Object có sẵn các hàm `find`, `findOneBy`, `save`, `remove`... cho bảng đó |

## Bước 1: Entity

Tạo `src/brands/brand.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Maps the existing Brands table (database/schema.sql).
// DB_SYNCHRONIZE=false, so TypeORM never changes the table: these decorators
// must describe it exactly (names, types, lengths, nullability).
@Entity('Brands')
export class Brand {
  // INT IDENTITY(1,1): SQL Server generates the id
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'nvarchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  // NULL allowed in the table, so the property can be null too
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'bit', default: true })
  isActive: boolean;

  // Filled by SQL Server (DEFAULT SYSUTCDATETIME()) when the row is inserted
  @CreateDateColumn({ type: 'datetime2' })
  createdAt: Date;
}
```

So từng dòng với bảng `Brands` trong `database/schema.sql`:

| schema.sql | Entity |
|---|---|
| `CREATE TABLE Brands` | `@Entity('Brands')` |
| `id INT IDENTITY(1,1)` | `@PrimaryGeneratedColumn()` |
| `name NVARCHAR(100) NOT NULL` | `@Column({ type: 'nvarchar', length: 100 })` |
| `slug VARCHAR(120)` + `UNIQUE` | `@Column({ type: 'varchar', length: 120, unique: true })` |
| `logoUrl NVARCHAR(500) NULL` | `@Column({ type: 'nvarchar', length: 500, nullable: true })` |
| `isActive BIT ... DEFAULT 1` | `@Column({ type: 'bit', default: true })` |
| `createdAt DATETIME2 ... DEFAULT SYSUTCDATETIME()` | `@CreateDateColumn({ type: 'datetime2' })` |

`logoUrl` có `nullable: true` vì cột cho phép `NULL`. Với kiểu `string | null`, **bắt buộc** ghi `type: 'nvarchar'`: TypeScript không tự cho TypeORM biết kiểu của một union (nó chỉ báo được là `Object`), thiếu `type` thì API không khởi động được.

**Xoá file `src/brands/brand.interface.ts`**: entity thay thế nó.

## Bước 2: Đăng ký entity trong module

Thay toàn bộ `src/brands/brands.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from './brand.entity.js';
import { BrandsController } from './brands.controller.js';
import { BrandsService } from './brands.service.js';

@Module({
  // Registers the entity and makes Repository<Brand> injectable in this module
  imports: [TypeOrmModule.forFeature([Brand])],
  controllers: [BrandsController],
  providers: [BrandsService],
})
export class BrandsModule {}
```

`TypeOrmModule.forFeature([Brand])` cho TypeORM biết entity `Brand` và tạo sẵn `Repository<Brand>` để service trong module inject được.

## Bước 3: Service dùng Repository

Thay toàn bộ `src/brands/brands.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from './brand.entity.js';
import type { CreateBrandDto } from './dto/create-brand.dto.js';
import type { UpdateBrandDto } from './dto/update-brand.dto.js';

@Injectable()
export class BrandsService {
  // Repository<Brand>: find/save/remove... on the Brands table,
  // provided by TypeOrmModule.forFeature([Brand]) in BrandsModule
  constructor(
    @InjectRepository(Brand)
    private readonly brandsRepo: Repository<Brand>,
  ) {}

  // SELECT ... FROM Brands ORDER BY name
  findAll(): Promise<Brand[]> {
    return this.brandsRepo.find({ order: { name: 'ASC' } });
  }

  // SELECT ... WHERE id = @0
  async findOne(id: number): Promise<Brand> {
    const brand = await this.brandsRepo.findOneBy({ id });
    if (!brand) throw new NotFoundException(`Không tìm thấy hãng id=${id}`);
    return brand;
  }

  async create(dto: CreateBrandDto): Promise<Brand> {
    await this.ensureSlugIsFree(dto.slug);
    const brand = this.brandsRepo.create(dto); // builds the object, nothing saved yet
    return this.brandsRepo.save(brand); // INSERT INTO Brands ...
  }

  async update(id: number, dto: UpdateBrandDto): Promise<Brand> {
    const brand = await this.findOne(id); // throws 404 when missing
    if (dto.slug !== undefined) await this.ensureSlugIsFree(dto.slug, id);
    Object.assign(brand, dto);
    return this.brandsRepo.save(brand); // has an id, so this is an UPDATE
  }

  async remove(id: number): Promise<void> {
    const brand = await this.findOne(id); // throws 404 when missing
    await this.brandsRepo.remove(brand); // DELETE FROM Brands WHERE id = @0
  }

  // Slugs appear in URLs, so two brands can't share one (409 Conflict).
  // The UNIQUE constraint in SQL Server is the final safety net.
  private async ensureSlugIsFree(
    slug: string,
    exceptId?: number,
  ): Promise<void> {
    const existing = await this.brandsRepo.findOneBy({ slug });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`Slug "${slug}" đã được dùng`);
    }
  }
}
```

Giải thích:
- `@InjectRepository(Brand)`: xin NestJS đưa `Repository<Brand>` vào (dependency injection).
- Mọi hàm giờ là `async` và trả `Promise`: đọc/ghi database là **bất đồng bộ**, phải chờ SQL Server trả lời.
- `find({ order: { name: 'ASC' } })` → `SELECT ... ORDER BY name ASC`.
- `findOneBy({ id })` → `SELECT ... WHERE id = @0`. TypeORM truyền giá trị bằng **tham số** (`@0`), không ghép chuỗi vào câu SQL, nên không bị SQL Injection.
- `create(dto)` chỉ **tạo object** trong bộ nhớ; `save(...)` mới thật sự ghi. Chưa có `id` → `INSERT`; đã có `id` → `UPDATE`.

## Bước 4: Controller phải `return` kết quả của `remove`

Trong `src/brands/brands.controller.ts`, method `remove` phải là:

```ts
  // DELETE /api/v1/brands/1 - 204 No Content: success, empty body
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    // Return the Promise so Nest waits for it and turns a thrown 404 into the response
    return this.brandsService.remove(id);
  }
```

Thiếu `return` thì NestJS trả 204 **ngay**, không chờ service: xoá `id` không tồn tại vẫn ra "thành công", còn lỗi 404 thành lỗi Promise không ai bắt.

## Bước 5: Sửa test

Service giờ cần `Repository<Brand>`. Unit test **không** dùng SQL Server thật: đưa vào repository giả.

Thay toàn bộ `src/brands/brands.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Brand } from './brand.entity.js';
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
```

Thay toàn bộ `src/brands/brands.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { BrandsController } from './brands.controller.js';
import { BrandsService } from './brands.service.js';

describe('BrandsController', () => {
  let controller: BrandsController;

  // The controller only talks to the service, so a fake service is enough here
  const fakeService = {
    findAll: vi.fn().mockResolvedValue([{ id: 1, slug: 'apple' }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandsController],
      providers: [{ provide: BrandsService, useValue: fakeService }],
    }).compile();

    controller = module.get<BrandsController>(BrandsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns what the service returns', async () => {
    await expect(controller.findAll()).resolves.toEqual([
      { id: 1, slug: 'apple' },
    ]);
  });
});
```

Giải thích:
- `getRepositoryToken(Brand)`: "tên" NestJS dùng để tìm `Repository<Brand>`; `useValue: fakeRepo` thay nó bằng object giả.
- `vi.fn()`: hàm giả của Vitest. `mockResolvedValue(x)`: cho hàm giả trả `Promise` có giá trị `x`.
- `await expect(...).rejects.toThrow(...)`: kiểm tra hàm async ném đúng lỗi. Quên `await` thì test luôn qua dù code sai.

## Bước 6: Gọi thử, lần này dữ liệu nằm trong SQL Server

Dùng lại `server/requests/brands.http`:

1. `GET /api/v1/brands`: 10 hãng từ dữ liệu mẫu, có cả `logoUrl` (ảnh giữ chỗ).
2. `POST` tạo hãng Google → 201, `id` là 11.
3. Chạy `SELECT * FROM Brands` trong VS Code (database `TechStoreDb`): thấy dòng vừa tạo.
4. **Tắt API rồi bật lại**: Google vẫn còn.
5. `PATCH`, `DELETE` hãng đó, kiểm tra lại trong SQL Server.

Thử thêm:

```http
### Delete a brand that still has products
DELETE {{baseUrl}}/brands/1
```

Kết quả: **500 Internal server error**, log có `conflicted with the REFERENCE constraint "FK_Products_Brands"`. Database tự bảo vệ dữ liệu (lỗi 547). Task "Exception filter cho lỗi SQL Server" ở Phần 6 sẽ đổi lỗi này thành thông báo dễ hiểu.

## Kiểm tra

- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Tạo, sửa, xoá hãng qua API và thấy thay đổi trong SQL Server
- [ ] Tắt/bật API, dữ liệu vẫn còn
- [ ] `DB_SYNCHRONIZE` trong `.env` vẫn là `false`
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

Tạo thử dữ liệu xong muốn quay về dữ liệu mẫu: `npm run db:reset` ở thư mục gốc.

## Tự luyện

1. Xoá `type: 'nvarchar'` trong `@Column` của `logoUrl`, chạy lại API. Log báo `Unable to connect to the database. Retrying...`: thông báo này **gây hiểu lầm**, database vẫn ổn. Đọc dòng ngay bên dưới mới thấy lỗi thật: `DataTypeNotSupportedError: Data type "Object" in "Brand.logoUrl" is not supported by "mssql"`. Bài học: khi gặp lỗi, luôn đọc hết stack trace chứ đừng chỉ đọc dòng đầu. Sửa lại rồi tắt/bật API.
2. Thêm `GET /api/v1/brands/slug/:slug` tìm hãng theo slug, 404 nếu không có.
