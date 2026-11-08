## Mục tiêu

Tạo module `categories` (danh mục: Điện thoại, Laptop...) theo đúng cấu trúc NestJS: **controller + service + module**, có đủ 5 API CRUD. Dữ liệu tạm lưu trong một mảng trong bộ nhớ; Phần 5 sẽ chuyển sang SQL Server.

| Method | URL | Kết quả |
|---|---|---|
| GET | `/api/v1/categories` | Danh sách, sắp theo `sortOrder` |
| GET | `/api/v1/categories/:id` | Một danh mục, 404 nếu không có |
| POST | `/api/v1/categories` | Tạo mới, trả 201 |
| PATCH | `/api/v1/categories/:id` | Sửa một phần |
| DELETE | `/api/v1/categories/:id` | Xoá, trả 204 |

**Đọc trước:** giáo trình Bài 3 và Bài 4 (controller, service, module, dependency injection).

## Vì sao chia thành 3 file?

| File | Việc của nó | Ví dụ đời thường |
|---|---|---|
| `categories.controller.ts` | Nhận request, lấy tham số, gọi service, trả response | Nhân viên lễ tân |
| `categories.service.ts` | Xử lý nghiệp vụ, làm việc với dữ liệu | Đầu bếp |
| `categories.module.ts` | Gom controller và service của tính năng này lại | Một gian bếp riêng |

Controller **không** tự xử lý dữ liệu. Nhờ vậy khi đổi nơi lưu (mảng → SQL Server ở Phần 5), chỉ phải sửa service.

## Bước 1: Sinh khung bằng Nest CLI

Trong thư mục `server`:

```powershell
cd server
npx nest g module categories
npx nest g controller categories
npx nest g service categories
```

CLI tạo thư mục `src/categories/` với 5 file, **tự** thêm `CategoriesModule` vào `imports` của `src/app.module.ts`, và tự khai báo controller, service trong `categories.module.ts`. Mở `app.module.ts` xem dòng CLI vừa thêm.

## Bước 2: Kiểu dữ liệu `Category`

Tạo file `src/categories/category.interface.ts`:

```ts
// Shape of a category. Mirrors the Categories table in database/schema.sql;
// becomes a TypeORM entity class in Part 5.
export interface Category {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
}
```

Các field giống hệt cột của bảng `Categories` trong `database/schema.sql`, để Phần 5 chuyển sang database dễ dàng.

## Bước 3: Service

Thay toàn bộ `src/categories/categories.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Category } from './category.interface.js';

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
  // Temporary in-memory storage, replaced by SQL Server in Part 5.
  // It lives as long as the process: restarting the API resets the data.
  private categories: Category[] = [
    {
      id: 1,
      name: 'Điện thoại',
      slug: 'dien-thoai',
      sortOrder: 1,
      isActive: true,
      createdAt: new Date(),
    },
    {
      id: 2,
      name: 'Laptop',
      slug: 'laptop',
      sortOrder: 2,
      isActive: true,
      createdAt: new Date(),
    },
    {
      id: 3,
      name: 'Máy tính bảng',
      slug: 'tablet',
      sortOrder: 3,
      isActive: true,
      createdAt: new Date(),
    },
    {
      id: 4,
      name: 'Phụ kiện',
      slug: 'phu-kien',
      sortOrder: 4,
      isActive: true,
      createdAt: new Date(),
    },
  ];
  private nextId = 5;

  findAll(): Category[] {
    // Copy before sorting so the stored array is not reordered
    return [...this.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  findOne(id: number): Category {
    const category = this.categories.find((c) => c.id === id);
    if (!category)
      throw new NotFoundException(`Không tìm thấy danh mục id=${id}`);
    return category;
  }

  create(input: CreateCategoryInput): Category {
    const category: Category = {
      id: this.nextId++,
      name: input.name,
      slug: input.slug,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      createdAt: new Date(),
    };
    this.categories.push(category);
    return category;
  }

  update(id: number, input: UpdateCategoryInput): Category {
    const category = this.findOne(id); // throws 404 when missing
    Object.assign(category, input); // copy the sent fields onto the stored object
    return category;
  }

  remove(id: number): void {
    this.findOne(id); // throws 404 when missing
    this.categories = this.categories.filter((c) => c.id !== id);
  }
}
```

Giải thích:
- `@Injectable()`: cho phép NestJS **tự tạo** service này và **tiêm** (inject) vào controller.
- `private categories`: mảng nằm trong service. Mặc định service là **singleton**: cả ứng dụng dùng chung **một** bản, nên mọi request thấy cùng một mảng. Tắt API là mất dữ liệu vừa thêm.
- `import type { Category }`: `Category` chỉ là kiểu, nên dùng `import type` để nó bị xoá hẳn khi biên dịch.
- `Partial<CreateCategoryInput>`: kiểu có sẵn của TypeScript, biến mọi field thành không bắt buộc. Dùng cho PATCH vì client chỉ gửi những field muốn đổi.
- `input.sortOrder ?? 0`: không gửi `sortOrder` thì dùng 0. `??` chỉ thay khi giá trị là `null` hoặc `undefined`.
- `throw new NotFoundException(...)`: exception có sẵn của NestJS. Ném ra ở đâu cũng được, NestJS tự trả HTTP **404** kèm thông báo.
- `[...this.categories].sort(...)`: `sort` sửa thẳng mảng gốc, nên copy ra mảng mới rồi mới sắp xếp.
- `update` và `remove` gọi `findOne` trước: dùng lại phần kiểm tra 404, không phải viết lại.

## Bước 4: Controller

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
  @Post()
  create(@Body() body: CreateCategoryInput) {
    return this.categoriesService.create(body);
  }

  // PATCH /api/v1/categories/1 - partial update
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
    return this.categoriesService.remove(id);
  }
}
```

Giải thích:
- `@Controller('categories')` + tiền tố toàn cục `api/v1` (trong `main.ts`) = mọi route bắt đầu bằng `/api/v1/categories`.
- `constructor(private readonly categoriesService: CategoriesService)`: **dependency injection**. Bạn không viết `new CategoriesService()`. NestJS thấy controller cần service này, tự tạo (một lần) rồi đưa vào.
- `@Param('id', ParseIntPipe)`: giá trị trên URL luôn là **chuỗi** (`"1"`). `ParseIntPipe` đổi sang số `1`, gặp `"abc"` thì tự trả **400**, controller không cần kiểm tra.
- `@Body()`: lấy JSON client gửi lên.
- `type CreateCategoryInput`: chữ `type` trong import là bắt buộc. Với cấu hình của dự án (`isolatedModules` + `emitDecoratorMetadata`), một kiểu dùng trong tham số có decorator (`@Body() body: ...`) phải được import bằng `type`, nếu không TypeScript báo lỗi TS1272.
- `@HttpCode(204)`: xoá thành công thì trả 204, không có nội dung. `POST` mặc định đã là 201, `GET`/`PATCH` là 200.
- Method trả về object/mảng, NestJS tự đổi sang JSON.

## Bước 5: Sửa test do CLI sinh ra

CLI sinh `categories.controller.spec.ts` lúc controller chưa cần service. Giờ controller cần `CategoriesService`, nên chạy `npm test` sẽ lỗi `Nest can't resolve dependencies of the CategoriesController (?)`. Đây chính là lỗi giáo trình Bài 4.5 nói tới: module test thiếu provider.

Thay toàn bộ `src/categories/categories.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

describe('CategoriesController', () => {
  let controller: CategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      // The controller needs CategoriesService, so the test module must provide it too
      providers: [CategoriesService],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns categories sorted by sortOrder', () => {
    const slugs = controller.findAll().map((c) => c.slug);
    expect(slugs).toEqual(['dien-thoai', 'laptop', 'tablet', 'phu-kien']);
  });
});
```

`categories.service.spec.ts` do CLI sinh ra giữ nguyên.

## Bước 6: Gọi thử API

Cách dễ nhất: extension **REST Client** trong VS Code. Tạo file `server/requests/categories.http`:

```http
@baseUrl = http://localhost:3000/api/v1

### List categories
GET {{baseUrl}}/categories

### Get one
GET {{baseUrl}}/categories/2

### Not found -> 404
GET {{baseUrl}}/categories/99

### Not a number -> 400 (ParseIntPipe)
GET {{baseUrl}}/categories/abc

### Create -> 201
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

Chạy `npm run dev` ở thư mục gốc, mở file `.http`, bấm **Send Request** phía trên từng request.

**Thử nghiệm quan trọng**: gửi request dưới đây rồi `GET {{baseUrl}}/categories`:

```http
### Mass assignment: the client overwrites the id!
PATCH {{baseUrl}}/categories/1
Content-Type: application/json

{
  "id": 999
}
```

Danh mục "Điện thoại" bị đổi `id` thành 999. Client gửi gì, `Object.assign` chép nấy: đây là lỗ hổng **mass assignment** (người dùng tự gửi `role: "admin"`...). Task "DTO và validation" ở Phần 3 sẽ chặn nó. Khởi động lại API để dữ liệu về như cũ.

## Kiểm tra

- [ ] Log khi khởi động có 5 dòng `Mapped {/api/v1/categories...}`
- [ ] Đủ 5 API chạy đúng như bảng ở đầu, kể cả 404 và 400
- [ ] `npm run lint` và `npm test` (trong `server`) đều qua
- [ ] Thấy được lỗi mass assignment ở thử nghiệm trên và giải thích được vì sao
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm `GET /api/v1/categories/count` trả số danh mục. Đặt method này **phía trên** `@Get(':id')`, nếu không NestJS hiểu `count` là một `id` (giáo trình Bài 3, tự luyện 1).
2. Xoá `CategoriesService` khỏi `providers` trong `categories.module.ts`, chạy lại để thấy lỗi "can't resolve dependencies", rồi sửa lại.
