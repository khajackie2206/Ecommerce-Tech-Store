## Mục tiêu

Tạo module `brands` (hãng: Apple, Samsung, Dell...) theo đúng cấu trúc NestJS: **controller + service + module**, có đủ 5 API CRUD. Dữ liệu đọc/ghi **thẳng vào bảng `Brands` trong SQL Server** bằng TypeORM.

| Method | URL | Kết quả |
|---|---|---|
| GET | `/api/v1/brands` | Danh sách, sắp theo tên A→Z |
| GET | `/api/v1/brands/:id` | Một hãng, 404 nếu không có |
| POST | `/api/v1/brands` | Tạo mới, trả 201 |
| PATCH | `/api/v1/brands/:id` | Sửa một phần |
| DELETE | `/api/v1/brands/:id` | Xoá, trả 204 |

**Làm sau:** cả hai task Phần 1 (chạy được source, có dữ liệu mẫu bằng `npm run db:reset`).

**Đọc trước:** giáo trình Bài 3, Bài 4 (controller, service, module, dependency injection) và Bài 7 (TypeORM, entity, repository).

Task này song song với task module `categories` (teammate làm). Hai task cùng kiểu: làm xong thì review chéo Pull Request của nhau. Task `categories` giải thích kỹ hơn từng khái niệm; nếu chỗ nào ở đây chỉ nói ngắn, đọc thêm bên đó.

## Vì sao chia thành 3 file?

| File | Việc của nó | Ví dụ đời thường |
|---|---|---|
| `brands.controller.ts` | Nhận request, lấy tham số, gọi service, trả response | Nhân viên lễ tân |
| `brands.service.ts` | Xử lý nghiệp vụ, đọc/ghi database | Đầu bếp |
| `brands.module.ts` | Gom controller, service và bảng của tính năng này lại | Một gian bếp riêng |

## Hai khái niệm mới: Entity và Repository

| Khái niệm | Là gì |
|---|---|
| **Entity** | Class mô tả một bảng: mỗi property là một cột |
| **Repository** | Object có sẵn các hàm `find`, `findOneBy`, `save`, `remove`... cho bảng đó, tự sinh câu SQL |

Kết nối SQL Server đã có sẵn trong `src/app.module.ts`. Bảng `Brands` đã có sẵn (tạo bằng `database/schema.sql`), `DB_SYNCHRONIZE=false`, nên entity phải **mô tả đúng** bảng có sẵn, TypeORM không được sửa bảng.

## Bước 1: Sinh khung bằng Nest CLI

Trong thư mục `server`:

```powershell
cd server
npx nest g module brands
npx nest g controller brands
npx nest g service brands
```

CLI tạo thư mục `src/brands/` với 5 file, **tự** thêm `BrandsModule` vào `imports` của `src/app.module.ts`, và tự khai báo controller, service trong `brands.module.ts`.

## Bước 2: Entity

Mở bảng `Brands` trong VS Code (extension SQL Server, database `TechStoreDb`) hoặc xem trong `database/schema.sql`, rồi tạo `src/brands/brand.entity.ts`:

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

So từng dòng với định nghĩa bảng:

| schema.sql | Entity |
|---|---|
| `CREATE TABLE Brands` | `@Entity('Brands')` |
| `id INT IDENTITY(1,1)` | `@PrimaryGeneratedColumn()` |
| `name NVARCHAR(100) NOT NULL` | `@Column({ type: 'nvarchar', length: 100 })` |
| `slug VARCHAR(120)` + `UNIQUE` | `@Column({ type: 'varchar', length: 120, unique: true })` |
| `logoUrl NVARCHAR(500) NULL` | `@Column({ type: 'nvarchar', length: 500, nullable: true })` |
| `isActive BIT ... DEFAULT 1` | `@Column({ type: 'bit', default: true })` |
| `createdAt DATETIME2 ... DEFAULT SYSUTCDATETIME()` | `@CreateDateColumn({ type: 'datetime2' })` |

`logoUrl` được `NULL` trong bảng, nên property có kiểu `string | null` và cột có `nullable: true`. Với kiểu union như vậy, TypeORM **không tự đoán** được kiểu cột, nên `type: 'nvarchar'` là bắt buộc. Thiếu nó, app khởi động lỗi `DataTypeNotSupportedError`.

## Bước 3: Đăng ký entity trong module

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

`TypeOrmModule.forFeature([Brand])` cho TypeORM biết entity `Brand` và tạo sẵn `Repository<Brand>` để service trong module này inject được.

## Bước 4: Service

Thay toàn bộ `src/brands/brands.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from './brand.entity.js';

// Data accepted when creating a brand (replaced by a validated DTO class in Part 3)
export interface CreateBrandInput {
  name: string;
  slug: string;
  logoUrl?: string;
  isActive?: boolean;
}

// Same fields, all optional: PATCH only sends what changes
export type UpdateBrandInput = Partial<CreateBrandInput>;

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

  create(input: CreateBrandInput): Promise<Brand> {
    const brand = this.brandsRepo.create(input); // builds the object, nothing saved yet
    return this.brandsRepo.save(brand); // INSERT INTO Brands ...
  }

  async update(id: number, input: UpdateBrandInput): Promise<Brand> {
    const brand = await this.findOne(id); // throws 404 when missing
    Object.assign(brand, input); // copy the sent fields onto the loaded row
    return this.brandsRepo.save(brand); // has an id, so this is an UPDATE
  }

  async remove(id: number): Promise<void> {
    const brand = await this.findOne(id); // throws 404 when missing
    await this.brandsRepo.remove(brand); // DELETE FROM Brands WHERE id = @0
  }
}
```

Giải thích:
- `@InjectRepository(Brand)`: xin NestJS đưa `Repository<Brand>` vào constructor (**dependency injection**).
- Các hàm trả về `Promise` vì phải chờ SQL Server trả lời. Hàm nào cần `await` bên trong thì có `async`.
- `find({ order: { name: 'ASC' } })` → `SELECT ... ORDER BY name ASC`. SQL Server sắp xếp, không phải JavaScript.
- `findOneBy({ id })` → `SELECT ... WHERE id = @0`, giá trị luôn đi bằng **tham số** nên không bị SQL Injection.
- `create(input)` chỉ tạo object; `save(...)` mới ghi. Chưa có `id` → `INSERT`, có `id` → `UPDATE`.
- `CreateBrandInput` là **interface**: chỉ kiểm tra lúc gõ code, lúc chạy không kiểm tra gì. Bước 8 sẽ cho thấy hậu quả, Phần 3 sẽ sửa.

## Bước 5: Controller

Thay toàn bộ `src/brands/brands.controller.ts`:

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
import {
  BrandsService,
  type CreateBrandInput,
  type UpdateBrandInput,
} from './brands.service.js';

// Every route here starts with /api/v1/brands (global prefix + 'brands')
@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  // GET /api/v1/brands
  @Get()
  findAll() {
    return this.brandsService.findAll();
  }

  // GET /api/v1/brands/1 - ParseIntPipe turns "1" into 1, or returns 400 for "abc"
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.brandsService.findOne(id);
  }

  // POST /api/v1/brands - responds 201 Created by default
  @Post()
  create(@Body() body: CreateBrandInput) {
    return this.brandsService.create(body);
  }

  // PATCH /api/v1/brands/1 - partial update
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateBrandInput,
  ) {
    return this.brandsService.update(id, body);
  }

  // DELETE /api/v1/brands/1 - 204 No Content: success, empty body
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    // Return the Promise so Nest waits for it and turns a thrown 404 into the response
    return this.brandsService.remove(id);
  }
}
```

Giải thích:
- `@Controller('brands')` + tiền tố `api/v1` = mọi route bắt đầu bằng `/api/v1/brands`.
- `@Param('id', ParseIntPipe)`: đổi `"1"` trên URL thành số `1`, gặp `"abc"` thì tự trả **400**.
- `type CreateBrandInput`: bắt buộc import bằng `type` vì kiểu này dùng trong tham số có decorator (`@Body()`), nếu không TypeScript báo lỗi TS1272.
- `@HttpCode(204)`: xoá xong trả 204, không có nội dung.
- `remove` phải có `return`, để NestJS chờ service xong mới trả lời. Thiếu `return` thì xoá `id` không tồn tại vẫn ra 204.

## Bước 6: Test

CLI sinh test lúc service, controller chưa cần gì. Giờ `npm test` báo `Nest can't resolve dependencies...` (giáo trình Bài 4.5). Unit test **không** dùng SQL Server thật, ta đưa vào đồ **giả**.

Thay toàn bộ `src/brands/brands.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
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

  it('creates a brand', async () => {
    const result = await service.create({ name: 'Google', slug: 'google' });
    expect(result).toEqual({ id: 1, name: 'Google', slug: 'google' });
    expect(fakeRepo.save).toHaveBeenCalledOnce();
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

- `{ provide: getRepositoryToken(Brand), useValue: fakeRepo }`: ai xin `Repository<Brand>` thì đưa object giả.
- `vi.fn()` là hàm giả; `mockResolvedValue(x)` cho nó trả `Promise` chứa `x`, như thể database vừa trả kết quả.
- Test controller dùng **service giả**, nên chỉ kiểm tra controller.

## Bước 7: Gọi thử, rồi xem dữ liệu trong SQL Server

Tạo file `server/requests/brands.http` (extension **REST Client**):

```http
@baseUrl = http://localhost:3000/api/v1

### List brands (A -> Z, 10 rows from seed.sql)
GET {{baseUrl}}/brands

### Get one
GET {{baseUrl}}/brands/1

### Not found -> 404
GET {{baseUrl}}/brands/99

### Not a number -> 400 (ParseIntPipe)
GET {{baseUrl}}/brands/abc

### Create -> 201, id 11
POST {{baseUrl}}/brands
Content-Type: application/json

{
  "name": "Google",
  "slug": "google",
  "logoUrl": "https://placehold.co/200x80?text=Google"
}

### Update part of it
PATCH {{baseUrl}}/brands/11
Content-Type: application/json

{
  "isActive": false
}

### Delete -> 204
DELETE {{baseUrl}}/brands/11
```

Chạy `npm run dev` ở thư mục gốc, bấm **Send Request** trên từng request. Sau mỗi `POST`/`PATCH`/`DELETE`, chạy trong VS Code (database `TechStoreDb`):

```sql
SELECT * FROM Brands ORDER BY id;
```

**Tắt API rồi bật lại**: dữ liệu vẫn còn, vì nó nằm trong SQL Server.

Nếu task `categories` đã merge, trong `.env` đã có `DB_LOGGING`: đặt `true` để xem từng câu SQL TypeORM gửi đi cho mỗi request.

## Bước 8: Ba thử nghiệm quan trọng

Tạo lại hãng `google` trước (id mới, ví dụ 12), rồi thêm vào `brands.http`:

```http
### 1. Mass assignment: the client rewrites history
PATCH {{baseUrl}}/brands/12
Content-Type: application/json

{
  "createdAt": "2000-01-01T00:00:00Z"
}

### 2. Wrong type -> 500
PATCH {{baseUrl}}/brands/12
Content-Type: application/json

{
  "logoUrl": 12345
}

### 3. Apple still has products -> 500
DELETE {{baseUrl}}/brands/1
```

1. **Mass assignment**: trả 200, và trong SQL Server `createdAt` của hãng đã thành năm 2000. Client gửi gì, `Object.assign` chép nấy, kể cả những cột client không bao giờ được phép sửa.
2. **Sai kiểu**: không ai kiểm tra `logoUrl` phải là chuỗi. Driver SQL Server từ chối (`Validation failed for parameter '0'. Invalid string.` trong log), client chỉ nhận `500 Internal server error`.
3. **Xoá hãng đang có sản phẩm**: khoá ngoại `FK_Products_Brands` chặn lại, lại là 500.

Phần 3 sẽ chặn (1), (2) ngay từ cửa bằng DTO (trả 400 có thông báo rõ ràng). Phần 6 đổi (3) thành thông báo dễ hiểu. Phần 4 giải thích kỹ các ràng buộc trong database.

Thử xong muốn quay về dữ liệu mẫu: `npm run db:reset` ở thư mục gốc.

## Kiểm tra

- [ ] Log khi khởi động có 5 dòng `Mapped {/api/v1/brands...}`
- [ ] Đủ 5 API chạy đúng như bảng ở đầu, kể cả 404 và 400
- [ ] Tạo, sửa, xoá qua API và thấy thay đổi trong SQL Server; tắt/bật API dữ liệu vẫn còn
- [ ] `npm run lint`, `npm test` (trong `server`) đều qua
- [ ] Làm được 3 thử nghiệm ở Bước 8 và giải thích được vì sao
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm `GET /api/v1/brands?active=true` chỉ trả hãng đang hoạt động. Gợi ý: `@Query('active') active?: string` trong controller; trong service dùng `find({ where: active === 'true' ? { isActive: true } : {}, order: ... })`. Kiểm tra bằng cách `UPDATE Brands SET isActive = 0 WHERE slug = 'acer'` trong SQL Server.
2. Xoá `BrandsService` khỏi `providers` trong `brands.module.ts`, chạy lại để thấy lỗi "can't resolve dependencies", rồi sửa lại.
