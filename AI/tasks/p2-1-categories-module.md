## Mục tiêu

Tạo module `categories` (danh mục: Điện thoại, Laptop...) theo đúng cấu trúc NestJS: **controller + service + module**, có đủ 5 API CRUD. Dữ liệu đọc/ghi **thẳng vào bảng `Categories` trong SQL Server** bằng TypeORM.

| Method | URL | Kết quả |
|---|---|---|
| GET | `/api/v1/categories` | Danh sách, sắp theo `sortOrder` |
| GET | `/api/v1/categories/:id` | Một danh mục, 404 nếu không có |
| POST | `/api/v1/categories` | Tạo mới, trả 201 |
| PATCH | `/api/v1/categories/:id` | Sửa một phần |
| DELETE | `/api/v1/categories/:id` | Xoá, trả 204 |

**Làm sau:** cả hai task Phần 1 (chạy được source, có dữ liệu mẫu bằng `npm run db:reset`).

**Đọc trước:** giáo trình Bài 3, Bài 4 (controller, service, module, dependency injection) và Bài 7 (TypeORM, entity, repository).

Task này song song với task module `brands`. Hai task cùng kiểu: làm xong thì review chéo Pull Request của nhau.

## Vì sao chia thành 3 file?

| File | Việc của nó | Ví dụ đời thường |
|---|---|---|
| `categories.controller.ts` | Nhận request, lấy tham số, gọi service, trả response | Nhân viên lễ tân |
| `categories.service.ts` | Xử lý nghiệp vụ, đọc/ghi database | Đầu bếp |
| `categories.module.ts` | Gom controller, service và bảng của tính năng này lại | Một gian bếp riêng |

Controller **không** tự đụng tới database. Nó chỉ gọi service, nên sau này đổi cách lưu trữ thì chỉ phải sửa service.

## Hai khái niệm mới: Entity và Repository

| Khái niệm | Là gì |
|---|---|
| **Entity** | Class mô tả một bảng: mỗi property là một cột |
| **Repository** | Object có sẵn các hàm `find`, `findOneBy`, `save`, `remove`... cho bảng đó, tự sinh câu SQL |

Kết nối SQL Server đã được cấu hình sẵn trong `src/app.module.ts` (`TypeOrmModule.forRootAsync`, `autoLoadEntities: true`), xem lại Phần 1. Task này chỉ cần thêm entity cho module.

**Khác với giáo trình Bài 7 ở điểm nào?** Giáo trình bật `synchronize: true`: TypeORM **tự tạo bảng** theo entity. Dự án này thì ngược lại: bảng đã có sẵn trong `database/schema.sql`, `.env` để `DB_SYNCHRONIZE=false`, nên entity phải **mô tả đúng** bảng có sẵn (tên bảng, tên cột, kiểu, độ dài). Đây cũng là cách làm ở hầu hết dự án thật, khi database có trước code.

## Bước 1: Sinh khung bằng Nest CLI

Trong thư mục `server`:

```powershell
cd server
npx nest g module categories
npx nest g controller categories
npx nest g service categories
```

CLI tạo thư mục `src/categories/` với 5 file, **tự** thêm `CategoriesModule` vào `imports` của `src/app.module.ts`, và tự khai báo controller, service trong `categories.module.ts`. Mở `app.module.ts` xem dòng CLI vừa thêm.

## Bước 2: Entity

Mở bảng `Categories` trong VS Code (extension SQL Server, database `TechStoreDb`) hoặc xem trong `database/schema.sql`, rồi tạo `src/categories/category.entity.ts`:

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

So từng dòng với định nghĩa bảng:

| schema.sql | Entity |
|---|---|
| `CREATE TABLE Categories` | `@Entity('Categories')` |
| `id INT IDENTITY(1,1)` | `@PrimaryGeneratedColumn()` (không tham số = số tự tăng) |
| `name NVARCHAR(100) NOT NULL` | `@Column({ type: 'nvarchar', length: 100 })` |
| `slug VARCHAR(120)` + `UNIQUE` | `@Column({ type: 'varchar', length: 120, unique: true })` |
| `sortOrder INT ... DEFAULT 0` | `@Column({ type: 'int', default: 0 })` |
| `isActive BIT ... DEFAULT 1` | `@Column({ type: 'bit', default: true })` (`BIT` là đúng/sai) |
| `createdAt DATETIME2 ... DEFAULT SYSUTCDATETIME()` | `@CreateDateColumn({ type: 'datetime2' })` |

- Tên property (`sortOrder`, `createdAt`) trùng tên cột, nên không phải khai báo thêm `name: '...'`. Đó là lý do bảng dùng tên cột kiểu camelCase.
- `NVARCHAR` (có chữ N) lưu được tiếng Việt có dấu; `VARCHAR` chỉ dùng cho slug không dấu.

## Bước 3: Đăng ký entity trong module

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

## Bước 4: Service

Thay toàn bộ `src/categories/categories.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity.js';

// Data accepted when creating a category (replaced by a validated DTO class in Part 3)
export interface CreateCategoryInput {
  name: string;
  slug: string;
  sortOrder?: number;
  isActive?: boolean;
}

// Same fields, all optional: PATCH only sends what changes
export type UpdateCategoryInput = Partial<CreateCategoryInput>;

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

  create(input: CreateCategoryInput): Promise<Category> {
    const category = this.categoriesRepo.create(input); // builds the object, nothing saved yet
    return this.categoriesRepo.save(category); // INSERT INTO Categories ...
  }

  async update(id: number, input: UpdateCategoryInput): Promise<Category> {
    const category = await this.findOne(id); // throws 404 when missing
    Object.assign(category, input); // copy the sent fields onto the loaded row
    return this.categoriesRepo.save(category); // has an id, so this is an UPDATE
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id); // throws 404 when missing
    await this.categoriesRepo.remove(category); // DELETE FROM Categories WHERE id = @0
  }
}
```

Giải thích:
- `@Injectable()`: cho phép NestJS **tự tạo** service này và **tiêm** (inject) vào controller.
- `@InjectRepository(Category)`: xin NestJS đưa `Repository<Category>` vào constructor. Bạn không viết `new Repository(...)` ở đâu cả: đây là **dependency injection**.
- Các hàm trả về `Promise`, vì đọc/ghi database là **bất đồng bộ**: phải chờ SQL Server trả lời. Hàm nào cần `await` bên trong (`findOne`, `update`, `remove`) thì có `async`; hàm trả thẳng Promise của repository (`findAll`, `create`) thì không cần.
- `find({ order: { sortOrder: 'ASC' } })` → `SELECT ... ORDER BY sortOrder ASC`.
- `findOneBy({ id })` → `SELECT ... WHERE id = @0`. TypeORM luôn truyền giá trị bằng **tham số** (`@0`), không ghép chuỗi vào câu SQL, nên không bị SQL Injection.
- `create(input)` chỉ **tạo object** trong bộ nhớ; `save(...)` mới thật sự ghi. Object chưa có `id` → `INSERT`; đã có `id` → `UPDATE`.
- `throw new NotFoundException(...)`: exception có sẵn của NestJS. Ném ra ở đâu cũng được, NestJS tự trả HTTP **404** kèm thông báo.
- `Partial<CreateCategoryInput>`: kiểu có sẵn của TypeScript, biến mọi field thành không bắt buộc. Dùng cho PATCH vì client chỉ gửi những field muốn đổi.
- `update` và `remove` gọi `findOne` trước: dùng lại phần kiểm tra 404, không phải viết lại.
- `CreateCategoryInput` là **interface**, chỉ để TypeScript kiểm tra lúc gõ code. Lúc chạy nó không kiểm tra gì cả. Bước 7 sẽ cho thấy hậu quả, Phần 3 sẽ sửa.

## Bước 5: Controller

Thay toàn bộ `src/categories/categories.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import {
  CategoriesService,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from './categories.service.js';

// Every route here starts with /api/v1/categories (global prefix + 'categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // GET /api/v1/categories
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  // GET /api/v1/categories/1 - ParseIntPipe turns "1" into 1, or returns 400 for "abc"
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.findOne(id);
  }

  // POST /api/v1/categories - responds 201 Created by default
  // @ApiBody: Swagger can't read an interface, so we give it a sample body.
  // Part 3 replaces the interface with a DTO class and this decorator goes away.
  @ApiBody({
    schema: {
      example: { name: 'Đồng hồ thông minh', slug: 'dong-ho', sortOrder: 5 },
    },
  })
  @Post()
  create(@Body() body: CreateCategoryInput) {
    return this.categoriesService.create(body);
  }

  // PATCH /api/v1/categories/1 - partial update
  @ApiBody({ schema: { example: { name: 'Smartwatch' } } })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCategoryInput,
  ) {
    return this.categoriesService.update(id, body);
  }

  // DELETE /api/v1/categories/1 - 204 No Content: success, empty body
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    // Return the Promise so Nest waits for it and turns a thrown 404 into the response
    return this.categoriesService.remove(id);
  }
}
```

Giải thích:
- `@Controller('categories')` + tiền tố toàn cục `api/v1` (trong `main.ts`) = mọi route bắt đầu bằng `/api/v1/categories`.
- `constructor(private readonly categoriesService: CategoriesService)`: lại là **dependency injection**. NestJS thấy controller cần service này, tự tạo (một lần, dùng chung cho cả app) rồi đưa vào.
- `@Param('id', ParseIntPipe)`: giá trị trên URL luôn là **chuỗi** (`"1"`). `ParseIntPipe` đổi sang số `1`, gặp `"abc"` thì tự trả **400**, controller không cần kiểm tra.
- `@Body()`: lấy JSON client gửi lên.
- `type CreateCategoryInput`: chữ `type` trong import là bắt buộc. Với cấu hình của dự án (`isolatedModules` + `emitDecoratorMetadata`), một kiểu dùng trong tham số có decorator (`@Body() body: ...`) phải được import bằng `type`, nếu không TypeScript báo lỗi TS1272.
- `@HttpCode(204)`: xoá thành công thì trả 204, không có nội dung. `POST` mặc định đã là 201, `GET`/`PATCH` là 200.
- `@ApiBody({ schema: { example: ... } })` (từ `@nestjs/swagger`): Swagger (trang thử API ở `/api/docs`) tự đọc route, tham số và **class** để mô tả API, nhưng không đọc được **interface** (`CreateCategoryInput` biến mất khi chạy). Nên ta đưa cho nó một body mẫu. Ở Phần 3, DTO class thay cho interface thì Swagger tự hiểu, decorator này sẽ được xoá.
- Method trả về Promise thì NestJS **chờ** kết quả rồi đổi sang JSON.
- `remove` phải có `return`. Thiếu `return`, NestJS trả 204 **ngay**, không chờ service: xoá một `id` không tồn tại vẫn ra 204 "thành công", còn lỗi 404 bị ném ra sau khi đã trả lời.

## Bước 6: Test

CLI sinh test lúc service chưa cần gì. Giờ service cần `Repository<Category>`, controller cần `CategoriesService`, nên `npm test` báo `Nest can't resolve dependencies...` (giáo trình Bài 4.5: module test thiếu provider). Unit test **không** dùng SQL Server thật: ta đưa vào đồ **giả**.

Thay toàn bộ `src/categories/categories.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
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

  it('creates a category', async () => {
    const result = await service.create({ name: 'Đồng hồ', slug: 'dong-ho' });
    expect(result).toEqual({ id: 1, name: 'Đồng hồ', slug: 'dong-ho' });
    expect(fakeRepo.save).toHaveBeenCalledOnce();
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
- `rejects.toThrow(NotFoundException)`: kiểm tra hàm async ném đúng loại lỗi. Nhớ có `await` phía trước, nếu không test luôn qua dù code sai.
- Test controller dùng **service giả**: test controller thì chỉ kiểm tra controller, không kéo theo service và database.

## Bước 7: Bật log SQL

Để thấy **từng câu SQL** mà TypeORM gửi xuống SQL Server, trong `src/app.module.ts` thêm vào cấu hình `TypeOrmModule.forRootAsync`, ngay dưới dòng `synchronize`:

```ts
        // DB_LOGGING=true prints every SQL query TypeORM sends (handy while learning)
        logging: config.get('DB_LOGGING') === 'true',
```

Thêm vào cuối `.env.example` (file được commit, mặc định tắt cho gọn log):

```dotenv
# true = print every SQL query in the API log
DB_LOGGING=false
```

và cùng dòng đó vào cuối `.env` của bạn, nhưng để `DB_LOGGING=true` trong lúc học. Khởi động lại API (`.env` chỉ được đọc lúc khởi động). Ghi chú trong Pull Request để teammate thêm dòng này vào `.env` của họ (thiếu thì log chỉ đơn giản là tắt, không lỗi).

## Bước 8: Gọi thử, rồi xem dữ liệu trong SQL Server

**Cách nhanh nhất: Swagger.** Chạy `npm run dev` ở thư mục gốc, mở http://localhost:3000/api/docs. Mỗi API là một dòng: bấm vào → **Try it out** → sửa body/tham số → **Execute**. Bên dưới hiện status, body trả về và lệnh `curl` tương ứng. Body mẫu của `POST` chính là `example` trong `@ApiBody` ở Bước 5: danh mục "Đồng hồ thông minh".

Swagger tiện để bấm thử; file `.http` dưới đây thì lưu lại được các request trong repo để chạy lại và chia sẻ với teammate. Dùng cái nào cũng được.

Dùng extension **REST Client** trong VS Code. Tạo file `server/requests/categories.http`:

```http
@baseUrl = http://localhost:3000/api/v1

### List categories (4 rows from seed.sql)
GET {{baseUrl}}/categories

### Get one
GET {{baseUrl}}/categories/2

### Not found -> 404
GET {{baseUrl}}/categories/99

### Not a number -> 400 (ParseIntPipe)
GET {{baseUrl}}/categories/abc

### Create -> 201, id 5
POST {{baseUrl}}/categories
Content-Type: application/json

{
  "name": "Đồng hồ thông minh",
  "slug": "dong-ho",
  "sortOrder": 5
}

### Update part of it
PATCH {{baseUrl}}/categories/5
Content-Type: application/json

{
  "name": "Smartwatch"
}

### Delete -> 204
DELETE {{baseUrl}}/categories/5
```

Chạy `npm run dev` ở thư mục gốc, mở file `.http`, bấm **Send Request** phía trên từng request. Sau mỗi `POST`/`PATCH`/`DELETE`, chạy câu này trong VS Code (database `TechStoreDb`) để thấy dữ liệu thật thay đổi:

```sql
SELECT * FROM Categories ORDER BY id;
```

**Tắt API rồi bật lại**: dữ liệu vẫn còn, vì nó nằm trong SQL Server chứ không nằm trong bộ nhớ của Node.js.

Nhìn log của API: mỗi request đều kèm các dòng `query: SELECT ...`, `query: INSERT ...`. Đó là SQL thật TypeORM gửi đi, với giá trị nằm trong `PARAMETERS: [...]`. Đọc log của request `PATCH` và trả lời: TypeORM gửi mấy câu, mỗi câu để làm gì?

<details>
<summary>Đáp án (tự trả lời trước rồi mới mở)</summary>

```
query: SELECT ... FROM "Categories" "Category" WHERE (("Category"."id" = @0)) ...
query: SELECT ... FROM "Categories" "Category" WHERE "Category"."id" = @0 ...
query: BEGIN TRANSACTION
query: UPDATE "Categories" SET "name" = @0 WHERE "id" = @1 -- PARAMETERS: [{"value":"Smartwatch",...},5]
query: COMMIT
```

1. `SELECT` thứ nhất: `findOne(id)` của ta, để có 404 nếu không tồn tại.
2. `SELECT` thứ hai: `save()` tự đọc lại dòng đó để so sánh, biết **cột nào thật sự đổi**.
3. `UPDATE` chỉ ghi cột `name`, không ghi lại cả dòng.
4. `BEGIN TRANSACTION` / `COMMIT`: `save()` luôn bọc thao tác ghi trong transaction (Phần 11 sẽ học kỹ khi đặt hàng).

</details>

## Bước 9: Ba thử nghiệm quan trọng

Thêm vào `categories.http`, tạo lại danh mục `dong-ho` (id mới) trước khi thử:

```http
### 1. Mass assignment: the client rewrites history
PATCH {{baseUrl}}/categories/6
Content-Type: application/json

{
  "createdAt": "2000-01-01T00:00:00Z",
  "isActive": "abc"
}

### 2. Duplicate slug -> 500
POST {{baseUrl}}/categories
Content-Type: application/json

{
  "name": "Laptop 2",
  "slug": "laptop"
}

### 3. Category 1 still has products -> 500
DELETE {{baseUrl}}/categories/1
```

(Đổi số `6` thành `id` danh mục bạn vừa tạo.)

1. **Mass assignment**: trả 200, và trong SQL Server `createdAt` của danh mục đã thành năm 2000. `"isActive": "abc"` cũng lọt qua. Client gửi gì, `Object.assign` chép nấy. Tệ hơn nữa, thử gửi `{"id": 999}`: trong log sẽ thấy TypeORM định `INSERT` **một bản sao** với id 999 (`SET IDENTITY_INSERT "Categories" ON`). Nó chỉ thất bại vì slug bị trùng.
2. **Trùng slug**: SQL Server từ chối nhờ ràng buộc `UQ_Categories_slug` (dữ liệu được bảo vệ), nhưng client chỉ nhận `500 Internal server error`, không biết mình sai gì.
3. **Xoá danh mục đang có sản phẩm**: khoá ngoại `FK_Products_Categories` chặn lại. Log của API có `The DELETE statement conflicted with the REFERENCE constraint`. Lại là 500.

Những lỗi này sẽ được sửa dần: Phần 3 chặn (1) và trả 409 cho (2), Phần 6 đổi (3) thành thông báo dễ hiểu. Phần 4 giải thích kỹ các ràng buộc trong database.

Thử xong muốn quay về dữ liệu mẫu: `npm run db:reset` ở thư mục gốc.

## Kiểm tra

- [ ] Log khi khởi động có 5 dòng `Mapped {/api/v1/categories...}`; nhóm **Categories** hiện trong http://localhost:3000/api/docs với body mẫu ở `POST`, `PATCH`
- [ ] Đủ 5 API chạy đúng như bảng ở đầu, kể cả 404 và 400
- [ ] Tạo, sửa, xoá qua API và thấy thay đổi trong SQL Server; tắt/bật API dữ liệu vẫn còn
- [ ] `DB_SYNCHRONIZE` trong `.env` vẫn là `false`
- [ ] `npm run lint`, `npm test` (trong `server`) đều qua
- [ ] `.env.example` có `DB_LOGGING=false`; với `DB_LOGGING=true` thấy được câu SQL của từng request
- [ ] Làm được 3 thử nghiệm ở Bước 9 và giải thích được vì sao
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm `GET /api/v1/categories/count` trả số danh mục (`this.categoriesRepo.count()`). Đặt method này **phía trên** `@Get(':id')`, nếu không NestJS hiểu `count` là một `id` (giáo trình Bài 3, tự luyện 1).
2. Cho `findAll` chỉ trả danh mục đang hoạt động: `find({ where: { isActive: true }, order: ... })`. Chạy `UPDATE Categories SET isActive = 0 WHERE id = 4` trong SQL Server để kiểm tra, rồi trả lại như cũ.
3. Xoá `CategoriesService` khỏi `providers` trong `categories.module.ts`, chạy lại để thấy lỗi "can't resolve dependencies", rồi sửa lại.
