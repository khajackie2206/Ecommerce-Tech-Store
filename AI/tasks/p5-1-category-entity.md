## Mục tiêu

Chuyển module `categories` từ mảng trong bộ nhớ sang **SQL Server** bằng TypeORM: viết **entity** khớp với bảng `Categories` có sẵn, dùng **Repository** để đọc/ghi. Các API giữ nguyên, nhưng dữ liệu giờ còn mãi sau khi tắt API.

**Làm sau:** task "DTO và validation cho categories" (Phần 3) và task "Đọc hiểu schema.sql" (Phần 4). Bắt đầu bằng `git switch main`, `git pull`, `npm run setup`, `npm run db:reset`.

**Đọc trước:** giáo trình Bài 7 (kết nối NestJS với SQL Server bằng TypeORM).

## Khác với giáo trình ở điểm nào?

Giáo trình Bài 7 bật `synchronize: true`: TypeORM **tự tạo bảng** theo entity. Dự án này thì ngược lại: bảng đã có sẵn trong `database/schema.sql`, `.env` để `DB_SYNCHRONIZE=false`, nên entity phải **mô tả đúng** bảng có sẵn (tên bảng, tên cột, kiểu, độ dài). Đây cũng là cách làm ở hầu hết dự án thật, khi database đã tồn tại trước code.

Kết nối SQL Server đã được cấu hình sẵn trong `src/app.module.ts` (`TypeOrmModule.forRootAsync`, `autoLoadEntities: true`), task này chỉ cần thêm entity cho module.

| Khái niệm | Là gì |
|---|---|
| **Entity** | Class mô tả một bảng: mỗi property là một cột |
| **Repository** | Object có sẵn các hàm `find`, `findOneBy`, `save`, `remove`... cho bảng đó |

## Bước 1: Entity

Tạo `src/categories/category.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Maps the existing Categories table (database/schema.sql).
// DB_SYNCHRONIZE=false, so TypeORM never changes the table: these decorators
// must describe it exactly (names, types, lengths).
@Entity('Categories')
export class Category {
  // INT IDENTITY(1,1): SQL Server generates the id
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'nvarchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'bit', default: true })
  isActive: boolean;

  // Filled by SQL Server (DEFAULT SYSUTCDATETIME()) when the row is inserted
  @CreateDateColumn({ type: 'datetime2' })
  createdAt: Date;
}
```

Đặt cạnh định nghĩa bảng trong `database/schema.sql` để so từng dòng:

| schema.sql | Entity |
|---|---|
| `CREATE TABLE Categories` | `@Entity('Categories')` |
| `id INT IDENTITY(1,1)` | `@PrimaryGeneratedColumn()` (không tham số = số tự tăng) |
| `name NVARCHAR(100) NOT NULL` | `@Column({ type: 'nvarchar', length: 100 })` |
| `slug VARCHAR(120)` + `UNIQUE` | `@Column({ type: 'varchar', length: 120, unique: true })` |
| `sortOrder INT ... DEFAULT 0` | `@Column({ type: 'int', default: 0 })` |
| `isActive BIT ... DEFAULT 1` | `@Column({ type: 'bit', default: true })` (`BIT` là đúng/sai) |
| `createdAt DATETIME2 ... DEFAULT SYSUTCDATETIME()` | `@CreateDateColumn({ type: 'datetime2' })` |

Tên property (`sortOrder`, `createdAt`) trùng tên cột, nên không phải khai báo thêm `name: '...'`. Đó là lý do bảng dùng tên cột kiểu camelCase.

**Xoá file `src/categories/category.interface.ts`**: entity thay thế nó.

## Bước 2: Đăng ký entity trong module

Thay toàn bộ `src/categories/categories.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { Category } from './category.entity.js';

@Module({
  // Registers the entity and makes Repository<Category> injectable in this module
  imports: [TypeOrmModule.forFeature([Category])],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
```

`TypeOrmModule.forFeature([Category])` làm hai việc: cho TypeORM biết entity `Category` (nhờ `autoLoadEntities`), và tạo sẵn `Repository<Category>` để service trong module này inject được.

## Bước 3: Service dùng Repository

Thay toàn bộ `src/categories/categories.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

@Injectable()
export class CategoriesService {
  // Repository<Category>: find/save/remove... on the Categories table,
  // provided by TypeOrmModule.forFeature([Category]) in CategoriesModule
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
  ) {}

  // SELECT ... FROM Categories ORDER BY sortOrder
  findAll(): Promise<Category[]> {
    return this.categoriesRepo.find({ order: { sortOrder: 'ASC' } });
  }

  // SELECT ... WHERE id = @0
  async findOne(id: number): Promise<Category> {
    const category = await this.categoriesRepo.findOneBy({ id });
    if (!category)
      throw new NotFoundException(`Không tìm thấy danh mục id=${id}`);
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    await this.ensureSlugIsFree(dto.slug);
    const category = this.categoriesRepo.create(dto); // builds the object, nothing saved yet
    return this.categoriesRepo.save(category); // INSERT INTO Categories ...
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id); // throws 404 when missing
    if (dto.slug !== undefined) await this.ensureSlugIsFree(dto.slug, id);
    Object.assign(category, dto);
    return this.categoriesRepo.save(category); // has an id, so this is an UPDATE
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id); // throws 404 when missing
    await this.categoriesRepo.remove(category); // DELETE FROM Categories WHERE id = @0
  }

  // Slugs appear in URLs, so two categories can't share one (409 Conflict).
  // The UNIQUE constraint in SQL Server is the final safety net.
  private async ensureSlugIsFree(
    slug: string,
    exceptId?: number,
  ): Promise<void> {
    const existing = await this.categoriesRepo.findOneBy({ slug });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`Slug "${slug}" đã được dùng`);
    }
  }
}
```

Giải thích:
- `@InjectRepository(Category)`: xin NestJS đưa `Repository<Category>` vào. Lại là dependency injection, giống cách controller nhận service.
- Mọi hàm giờ là `async` và trả `Promise`, vì đọc/ghi database là **bất đồng bộ**: phải chờ SQL Server trả lời.
- `find({ order: { sortOrder: 'ASC' } })` → `SELECT ... ORDER BY sortOrder ASC`.
- `findOneBy({ id })` → `SELECT ... WHERE id = @0`. TypeORM luôn truyền giá trị bằng **tham số** (`@0`), không ghép chuỗi vào câu SQL, nên không bị SQL Injection.
- `create(dto)` chỉ **tạo object** trong bộ nhớ; `save(...)` mới thật sự `INSERT`. Object chưa có `id` → `INSERT`; đã có `id` → `UPDATE`.
- `findAll()` không có `async` nhưng vẫn trả `Promise`, vì nó trả thẳng Promise của `find(...)`. Hàm nào cần `await` bên trong thì mới cần `async`.

## Bước 4: Controller phải `return` kết quả của `remove`

Trong `src/categories/categories.controller.ts`, method `remove` phải là:

```ts
  // DELETE /api/v1/categories/1 - 204 No Content: success, empty body
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    // Return the Promise so Nest waits for it and turns a thrown 404 into the response
    return this.categoriesService.remove(id);
  }
```

Nếu thiếu `return`, NestJS trả 204 **ngay**, không chờ service. Xoá một `id` không tồn tại vẫn ra 204 "thành công", còn lỗi 404 bị ném ra sau khi đã trả lời, thành lỗi Promise không ai bắt. Các method khác đã `return` sẵn.

## Bước 5: Sửa test

Service giờ cần `Repository<Category>`, nên test cũ báo lỗi "can't resolve dependencies". Unit test **không** dùng SQL Server thật: ta đưa vào một repository giả.

Thay toàn bộ `src/categories/categories.service.spec.ts`:

```ts
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
```

Thay toàn bộ `src/categories/categories.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

describe('CategoriesController', () => {
  let controller: CategoriesController;

  // The controller only talks to the service, so a fake service is enough here
  const fakeService = {
    findAll: vi.fn().mockResolvedValue([{ id: 1, slug: 'dien-thoai' }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: fakeService }],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns what the service returns', async () => {
    await expect(controller.findAll()).resolves.toEqual([
      { id: 1, slug: 'dien-thoai' },
    ]);
  });
});
```

Giải thích:
- `getRepositoryToken(Category)`: "tên" mà NestJS dùng để tìm `Repository<Category>`. `{ provide: ..., useValue: fakeRepo }` nghĩa là ai xin repository đó thì đưa object giả.
- `vi.fn()`: hàm giả của Vitest. `mockResolvedValue(x)`: cho hàm giả trả `Promise` có giá trị `x`, giả lập database trả kết quả.
- `rejects.toThrow(ConflictException)`: kiểm tra hàm async ném đúng loại lỗi. Nhớ có `await` phía trước, nếu không test luôn qua dù code sai.
- Test controller dùng **service giả**: test controller thì chỉ kiểm tra controller, không kéo theo service và database.

## Bước 6: Gọi thử, lần này dữ liệu nằm trong SQL Server

Dùng lại `server/requests/categories.http` từ Phần 2–3:

1. `POST` tạo danh mục "Đồng hồ thông minh" (`dong-ho`) → 201, `id` là 5.
2. Mở VS Code extension SQL Server, chạy `SELECT * FROM Categories` trong `TechStoreDb`: thấy dòng vừa tạo.
3. **Tắt API rồi bật lại**: `GET /api/v1/categories` vẫn còn "Đồng hồ thông minh". Đó là khác biệt lớn nhất so với Phần 2.
4. `PATCH`, `DELETE` danh mục đó, kiểm tra lại trong SQL Server.
5. Giờ `createdAt` trả về đúng giờ UTC lúc tạo (so với giờ máy trừ 7 tiếng).

Thử thêm:

```http
### Delete a category that still has products
DELETE {{baseUrl}}/categories/1
```

Kết quả: **500 Internal server error**, log của API có `The DELETE statement conflicted with the REFERENCE constraint "FK_Products_Categories"`. Database đã tự bảo vệ dữ liệu (lỗi 547 ở task ERD). Task "Exception filter cho lỗi SQL Server" ở Phần 6 sẽ đổi lỗi này thành thông báo dễ hiểu thay cho 500.

## Kiểm tra

- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Tạo, sửa, xoá danh mục qua API và thấy thay đổi trong SQL Server
- [ ] Tắt/bật API, dữ liệu vẫn còn
- [ ] `DB_SYNCHRONIZE` trong `.env` vẫn là `false`
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

Tạo thử dữ liệu xong muốn quay về dữ liệu mẫu: `npm run db:reset` ở thư mục gốc.

## Tự luyện

1. Thêm `GET /api/v1/categories/slug/:slug` tìm danh mục theo slug (`findOneBy({ slug })`), 404 nếu không có. Trang web ở Phần 9 sẽ cần API này.
2. Cho `findAll` chỉ trả danh mục đang hoạt động: `find({ where: { isActive: true }, order: ... })`.
