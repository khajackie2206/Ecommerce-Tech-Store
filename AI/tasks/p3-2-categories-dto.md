## Mục tiêu

Thay `CreateCategoryInput` (interface) bằng **DTO class** có quy tắc kiểm tra, thông báo lỗi tiếng Việt. Thêm kiểm tra **trùng slug** trả 409.

**Làm sau:** task "Bật ValidationPipe toàn cục" (cần thư viện và ValidationPipe đã có trên `main`). Bắt đầu bằng `git switch main`, `git pull`, `npm run setup`.

**Đọc trước:** giáo trình Bài 5.

## Vì sao DTO phải là class?

DTO (Data Transfer Object) mô tả dữ liệu **được phép** gửi lên, kèm quy tắc cho từng field. Nó **phải là class**, không được là interface: interface bị xoá sạch khi biên dịch TypeScript sang JavaScript, nên lúc chạy ValidationPipe không còn gì để đọc. Class thì còn nguyên, kèm các decorator gắn trên nó.

## Bước 1: DTO tạo mới

Tạo `src/categories/dto/create-category.dto.ts`:

```ts
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

// Body accepted by POST /api/v1/categories.
// Only the properties declared here get through (ValidationPipe whitelist).
export class CreateCategoryDto {
  @IsString({ message: 'Tên danh mục phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  @MaxLength(100, { message: 'Tên danh mục tối đa 100 ký tự' })
  name: string;

  // URL-friendly name: lowercase letters, digits and single dashes, e.g. "dien-thoai"
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang',
  })
  @MaxLength(120, { message: 'Slug tối đa 120 ký tự' })
  slug: string;

  @IsOptional()
  @IsInt({ message: 'sortOrder phải là số nguyên' })
  @Min(0, { message: 'sortOrder không được âm' })
  sortOrder?: number;

  @IsOptional()
  @IsBoolean({ message: 'isActive phải là true hoặc false' })
  isActive?: boolean;
}
```

Giải thích:
- Mỗi decorator là một quy tắc; một field có thể có nhiều quy tắc, chạy hết rồi gom lỗi lại.
- `MaxLength(100)`, `MaxLength(120)`: **khớp với độ dài cột** trong `database/schema.sql` (`NVARCHAR(100)`, `VARCHAR(120)`). Chặn ở API trước, đỡ để database báo lỗi khó hiểu.
- `@Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)`: biểu thức chính quy cho slug. Đọc là: một hoặc nhiều chữ thường/số, sau đó có thể lặp lại "một dấu gạch ngang + chữ thường/số". Hợp lệ: `dien-thoai`, `tablet`. Không hợp lệ: `Dien Thoai`, `dien--thoai`, `-abc`.
- `@IsOptional()`: field không gửi thì bỏ qua các quy tắc khác. Gửi thì vẫn kiểm tra.
- `{ message: '...' }`: thông báo lỗi tiếng Việt thay cho câu mặc định tiếng Anh.

## Bước 2: DTO sửa

Tạo `src/categories/dto/update-category.dto.ts`:

```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto.js';

// Body accepted by PATCH /api/v1/categories/:id:
// the same fields and rules as CreateCategoryDto, but every field is optional.
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
```

`PartialType` copy mọi field **kèm quy tắc** của `CreateCategoryDto`, rồi biến tất cả thành không bắt buộc. Sửa quy tắc ở một chỗ thì cả tạo lẫn sửa đều theo.

## Bước 3: Service dùng DTO và chặn trùng slug

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

Thay đổi so với Phần 2:
- Xoá `Create...Input`, `Update...Input` (interface), thay bằng 2 DTO. Trong service dùng `import type` vì ở đây chỉ cần **kiểu**.
- `create` giờ có `async`, vì phải `await this.ensureSlugIsFree(...)` trước khi ghi.
- `ensureSlugIsFree`: chạy `SELECT ... WHERE slug = @0` trước khi ghi. Có danh mục khác dùng slug đó thì ném `ConflictException` → **409** kèm thông báo rõ ràng, thay cho lỗi 500 từ database ở Phần 2.
  - Khi sửa (`update`), phải bỏ qua **chính danh mục đang sửa** (`exceptId`). Nếu không, PATCH giữ nguyên slug cũ cũng bị báo trùng với chính nó.
  - Vẫn giữ ràng buộc `UNIQUE` trong database làm **lưới an toàn cuối cùng**: nếu hai request tạo cùng slug đến cùng lúc, cả hai có thể qua bước kiểm tra, nhưng database chỉ cho một dòng được ghi.
- `private`: hàm phụ chỉ dùng trong class, bên ngoài không gọi được.
- `Object.assign(category, dto)` giờ an toàn: ValidationPipe đã loại mọi field không có trong DTO (`id`, `createdAt`...) trước khi tới đây.

Thay toàn bộ `src/categories/categories.service.spec.ts` (thêm test cho trường hợp trùng slug):

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

`fakeRepo.findOneBy.mockResolvedValue({ id: ..., slug: ... })`: giả như database **đã có** một dòng dùng slug này, để kiểm tra service ném 409.

## Bước 4: Controller dùng DTO

Trong `src/categories/categories.controller.ts`, thay đoạn import service:

```ts
import { CategoriesService } from './categories.service.js';
// Regular (not "import type") imports: ValidationPipe needs the DTO classes at runtime
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
```

và 2 method `create`, `update`:

```ts
  // POST /api/v1/categories - responds 201 Created by default
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  // PATCH /api/v1/categories/1 - partial update
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }
```

**Quan trọng:** trong controller, DTO phải import **bình thường**, không dùng `import type`. Lúc chạy, NestJS đọc kiểu của tham số `@Body()` để biết dùng class nào mà kiểm tra. `import type` làm class bị xoá khi biên dịch, nên ValidationPipe không còn biết DTO là gì. TypeScript và lint **không báo lỗi**, nhưng lúc chạy validation sai hoàn toàn: các quy tắc của DTO biến mất (tên rỗng không bị báo), còn field hợp lệ như `slug` lại bị báo "should not exist".

## Bước 5: Thêm test e2e cho validation

Trong `test/app.e2e-spec.ts`, thêm vào trong `describe`:

```ts
  it('POST /api/v1/categories rejects unknown fields with 400', () => {
    return request(app.getHttpServer())
      .post('/api/v1/categories')
      .send({ name: 'Test', slug: 'test', role: 'admin' })
      .expect(400);
  });
```

## Bước 6: Gọi thử

Thêm vào `server/requests/categories.http`:

```http
### Invalid: empty name, bad slug, unknown field -> 400 with 3 messages
POST {{baseUrl}}/categories
Content-Type: application/json

{
  "name": "",
  "slug": "Dien Thoai",
  "role": "admin"
}

### Mass assignment is now blocked -> 400, nothing reaches SQL Server
PATCH {{baseUrl}}/categories/1
Content-Type: application/json

{
  "id": 999,
  "createdAt": "2000-01-01T00:00:00Z"
}

### Duplicate slug -> 409
POST {{baseUrl}}/categories
Content-Type: application/json

{
  "name": "Laptop 2",
  "slug": "laptop"
}

### Wrong type: "5" is a string, not a number -> 400
POST {{baseUrl}}/categories
Content-Type: application/json

{
  "name": "Đồng hồ",
  "slug": "dong-ho",
  "sortOrder": "5"
}
```

Kết quả mong đợi của request đầu tiên:

```json
{
  "message": [
    "property role should not exist",
    "Tên danh mục không được để trống",
    "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

## Kiểm tra

- [ ] 4 request ở Bước 6 trả đúng 400 / 400 / 409 / 400
- [ ] Request hợp lệ vẫn tạo được (201) và sửa được (200); với `DB_LOGGING=true`, request bị 400 **không** có dòng `query:` nào: dữ liệu sai bị chặn trước khi tới database
- [ ] `createdAt` của danh mục 1 trong SQL Server không đổi sau request "Mass assignment"
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Thử đổi import `CreateCategoryDto` trong controller thành `import type`, gửi lại request sai đầu tiên ở Bước 6: thông báo lỗi khác hẳn (không còn "Tên danh mục không được để trống", lại có "property slug should not exist"). Giải thích vì sao, rồi sửa lại
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Gửi `{"name": "<101 ký tự>", "slug": "test"}`: DTO chặn với "Tên danh mục tối đa 100 ký tự". Giờ tạm xoá `@MaxLength(100)` khỏi DTO và gửi lại: lần này request tới SQL Server và bị từ chối vì dài hơn cột `NVARCHAR(100)` (log có `Data type 0xE7 has an invalid data length`, API trả 500, client không biết sai ở đâu). Đó là lý do độ dài trong DTO phải **khớp** với độ dài cột. Nhớ trả `@MaxLength` lại.
2. Viết thêm test e2e: `POST /api/v1/categories` với slug `laptop` (đã có trong dữ liệu mẫu) phải trả 409.
