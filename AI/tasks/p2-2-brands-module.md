## Mục tiêu

Tạo module `brands` (hãng: Apple, Samsung, Dell...) theo đúng cấu trúc NestJS: **controller + service + module**, có đủ 5 API CRUD. Dữ liệu tạm lưu trong một mảng trong bộ nhớ; Phần 5 sẽ chuyển sang SQL Server.

| Method | URL | Kết quả |
|---|---|---|
| GET | `/api/v1/brands` | Danh sách, sắp theo tên A→Z |
| GET | `/api/v1/brands/:id` | Một hãng, 404 nếu không có |
| POST | `/api/v1/brands` | Tạo mới, trả 201 |
| PATCH | `/api/v1/brands/:id` | Sửa một phần |
| DELETE | `/api/v1/brands/:id` | Xoá, trả 204 |

**Đọc trước:** giáo trình Bài 3 và Bài 4 (controller, service, module, dependency injection).

Task này song song với task module `categories` (teammate làm). Hai task cùng kiểu: làm xong thì review chéo Pull Request của nhau.

## Vì sao chia thành 3 file?

| File | Việc của nó | Ví dụ đời thường |
|---|---|---|
| `brands.controller.ts` | Nhận request, lấy tham số, gọi service, trả response | Nhân viên lễ tân |
| `brands.service.ts` | Xử lý nghiệp vụ, làm việc với dữ liệu | Đầu bếp |
| `brands.module.ts` | Gom controller và service của tính năng này lại | Một gian bếp riêng |

Controller **không** tự xử lý dữ liệu. Nhờ vậy khi đổi nơi lưu (mảng → SQL Server ở Phần 5), chỉ phải sửa service.

## Bước 1: Sinh khung bằng Nest CLI

Trong thư mục `server`:

```powershell
cd server
npx nest g module brands
npx nest g controller brands
npx nest g service brands
```

CLI tạo thư mục `src/brands/` với 5 file, **tự** thêm `BrandsModule` vào `imports` của `src/app.module.ts`, và tự khai báo controller, service trong `brands.module.ts`.

## Bước 2: Kiểu dữ liệu `Brand`

Tạo file `src/brands/brand.interface.ts`:

```ts
// Shape of a brand. Mirrors the Brands table in database/schema.sql;
// becomes a TypeORM entity class in Part 5.
export interface Brand {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: Date;
}
```

`logoUrl: string | null`: hãng có thể chưa có logo, giống cột `logoUrl NVARCHAR(500) NULL` trong `database/schema.sql`.

## Bước 3: Service

Thay toàn bộ `src/brands/brands.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Brand } from './brand.interface.js';

// Data accepted when creating a brand (replaced by a validated DTO class in Part 3)
export interface CreateBrandInput {
  name: string;
  slug: string;
  logoUrl?: string;
  isActive?: boolean;
}

// Same fields, all optional: PATCH only sends what changes
export type UpdateBrandInput = Partial<CreateBrandInput>;

// Builds the starting data from a short list of names
const SEED_BRANDS = [
  'Apple',
  'Samsung',
  'Xiaomi',
  'OPPO',
  'vivo',
  'ASUS',
  'Dell',
  'HP',
  'Lenovo',
  'Acer',
];

@Injectable()
export class BrandsService {
  // Temporary in-memory storage, replaced by SQL Server in Part 5.
  // It lives as long as the process: restarting the API resets the data.
  private brands: Brand[] = SEED_BRANDS.map((name, index) => ({
    id: index + 1,
    name,
    slug: name.toLowerCase(),
    logoUrl: null,
    isActive: true,
    createdAt: new Date(),
  }));
  private nextId = SEED_BRANDS.length + 1;

  findAll(): Brand[] {
    // Copy before sorting so the stored array is not reordered
    return [...this.brands].sort((a, b) => a.name.localeCompare(b.name));
  }

  findOne(id: number): Brand {
    const brand = this.brands.find((b) => b.id === id);
    if (!brand) throw new NotFoundException(`Không tìm thấy hãng id=${id}`);
    return brand;
  }

  create(input: CreateBrandInput): Brand {
    const brand: Brand = {
      id: this.nextId++,
      name: input.name,
      slug: input.slug,
      logoUrl: input.logoUrl ?? null,
      isActive: input.isActive ?? true,
      createdAt: new Date(),
    };
    this.brands.push(brand);
    return brand;
  }

  update(id: number, input: UpdateBrandInput): Brand {
    const brand = this.findOne(id); // throws 404 when missing
    Object.assign(brand, input); // copy the sent fields onto the stored object
    return brand;
  }

  remove(id: number): void {
    this.findOne(id); // throws 404 when missing
    this.brands = this.brands.filter((b) => b.id !== id);
  }
}
```

Giải thích:
- `@Injectable()`: cho phép NestJS **tự tạo** service này và **tiêm** (inject) vào controller.
- `SEED_BRANDS.map((name, index) => ({...}))`: thay vì gõ tay 10 object, ta biến danh sách tên thành danh sách hãng. `index + 1` làm `id` (1..10), `name.toLowerCase()` làm `slug` (`"Apple"` → `"apple"`). Arrow function trả object phải bọc trong ngoặc tròn `({ ... })`, nếu không JavaScript hiểu `{` là mở thân hàm.
- `private brands`: mảng nằm trong service. Service mặc định là **singleton**: cả ứng dụng dùng chung **một** bản, nên mọi request thấy cùng một mảng. Tắt API là mất dữ liệu vừa thêm.
- `a.name.localeCompare(b.name)`: so sánh chuỗi theo bảng chữ cái để sắp xếp A→Z.
- `Partial<CreateBrandInput>`: biến mọi field thành không bắt buộc, dùng cho PATCH.
- `input.logoUrl ?? null`: không gửi `logoUrl` thì lưu `null`.
- `throw new NotFoundException(...)`: NestJS tự trả HTTP **404** kèm thông báo.

## Bước 4: Controller

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
    return this.brandsService.remove(id);
  }
}
```

Giải thích:
- `@Controller('brands')` + tiền tố toàn cục `api/v1` = mọi route bắt đầu bằng `/api/v1/brands`.
- `constructor(private readonly brandsService: BrandsService)`: **dependency injection**. Không viết `new BrandsService()`; NestJS tự tạo (một lần) rồi đưa vào.
- `@Param('id', ParseIntPipe)`: tham số URL luôn là **chuỗi**. `ParseIntPipe` đổi `"1"` thành `1`, gặp `"abc"` thì tự trả **400**.
- `type CreateBrandInput`: chữ `type` trong import là bắt buộc. Với cấu hình của dự án (`isolatedModules` + `emitDecoratorMetadata`), kiểu dùng trong tham số có decorator phải import bằng `type`, nếu không TypeScript báo lỗi TS1272.
- `@HttpCode(204)`: xoá thành công trả 204, không có nội dung.

## Bước 5: Sửa test do CLI sinh ra

CLI sinh `brands.controller.spec.ts` lúc controller chưa cần service. Giờ chạy `npm test` sẽ lỗi `Nest can't resolve dependencies of the BrandsController (?)` (giáo trình Bài 4.5): module test thiếu provider.

Thay toàn bộ `src/brands/brands.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { BrandsController } from './brands.controller.js';
import { BrandsService } from './brands.service.js';

describe('BrandsController', () => {
  let controller: BrandsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandsController],
      // The controller needs BrandsService, so the test module must provide it too
      providers: [BrandsService],
    }).compile();

    controller = module.get<BrandsController>(BrandsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns 10 brands sorted by name', () => {
    const names = controller.findAll().map((b) => b.name);
    expect(names).toHaveLength(10);
    expect(names[0]).toBe('Acer');
  });
});
```

`brands.service.spec.ts` do CLI sinh ra giữ nguyên.

## Bước 6: Gọi thử API

Cài extension **REST Client** trong VS Code. Tạo file `server/requests/brands.http`:

```http
@baseUrl = http://localhost:3000/api/v1

### List brands (A -> Z)
GET {{baseUrl}}/brands

### Get one
GET {{baseUrl}}/brands/1

### Not found -> 404
GET {{baseUrl}}/brands/99

### Not a number -> 400 (ParseIntPipe)
GET {{baseUrl}}/brands/abc

### Create -> 201
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

Chạy `npm run dev` ở thư mục gốc, mở file `.http`, bấm **Send Request** phía trên từng request.

**Thử nghiệm quan trọng**:

```http
### Mass assignment: the client overwrites the id!
PATCH {{baseUrl}}/brands/1
Content-Type: application/json

{
  "id": 999,
  "logoUrl": 12345
}
```

Hãng Apple bị đổi `id` thành 999 và `logoUrl` thành một con số. Client gửi gì, `Object.assign` chép nấy: đó là lỗ hổng **mass assignment** và dữ liệu sai kiểu. Task "DTO và validation cho brands" ở Phần 3 sẽ chặn cả hai. Khởi động lại API để dữ liệu về như cũ.

## Kiểm tra

- [ ] Log khi khởi động có 5 dòng `Mapped {/api/v1/brands...}`
- [ ] Đủ 5 API chạy đúng như bảng ở đầu, kể cả 404 và 400
- [ ] `npm run lint` và `npm test` (trong `server`) đều qua
- [ ] Thấy được lỗi mass assignment ở thử nghiệm trên và giải thích được vì sao
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm `GET /api/v1/brands?active=true` chỉ trả hãng đang hoạt động. Gợi ý: `@Query('active') active?: string` trong controller, lọc trong service.
2. Xoá `BrandsService` khỏi `providers` trong `brands.module.ts`, chạy lại để thấy lỗi "can't resolve dependencies", rồi sửa lại.
