## Mục tiêu

Thay `CreateBrandInput` (interface) bằng **DTO class** có quy tắc kiểm tra, thông báo lỗi tiếng Việt. Thêm kiểm tra **trùng slug** trả 409, và kiểm tra `logoUrl` phải là URL hợp lệ.

**Làm sau:** task "Bật ValidationPipe toàn cục" (cần thư viện và ValidationPipe đã có trên `main`). Bắt đầu bằng `git switch main`, `git pull`, `npm run setup`.

**Đọc trước:** giáo trình Bài 5.

## Vì sao DTO phải là class?

DTO (Data Transfer Object) mô tả dữ liệu **được phép** gửi lên, kèm quy tắc cho từng field. Nó **phải là class**, không được là interface: interface bị xoá sạch khi biên dịch TypeScript sang JavaScript, nên lúc chạy ValidationPipe không còn gì để đọc. Class thì còn nguyên, kèm các decorator gắn trên nó.

## Bước 1: DTO tạo mới

Tạo `src/brands/dto/create-brand.dto.ts`:

```ts
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

// Body accepted by POST /api/v1/brands.
// Only the properties declared here get through (ValidationPipe whitelist).
export class CreateBrandDto {
  @IsString({ message: 'Tên hãng phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên hãng không được để trống' })
  @MaxLength(100, { message: 'Tên hãng tối đa 100 ký tự' })
  name: string;

  // URL-friendly name: lowercase letters, digits and single dashes, e.g. "apple"
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang',
  })
  @MaxLength(120, { message: 'Slug tối đa 120 ký tự' })
  slug: string;

  @IsOptional()
  @IsUrl({}, { message: 'logoUrl phải là một địa chỉ URL hợp lệ' })
  @MaxLength(500, { message: 'logoUrl tối đa 500 ký tự' })
  logoUrl?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive phải là true hoặc false' })
  isActive?: boolean;
}
```

Giải thích:
- Mỗi decorator là một quy tắc; một field có thể có nhiều quy tắc, chạy hết rồi gom lỗi lại.
- `MaxLength(100)`, `(120)`, `(500)`: **khớp với độ dài cột** trong bảng `Brands` (`database/schema.sql`). Chặn ở API trước, đỡ để database báo lỗi khó hiểu.
- `@Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)`: biểu thức chính quy cho slug: chữ thường/số, các đoạn nối bằng **một** dấu gạch ngang. Hợp lệ: `apple`, `hp`. Không hợp lệ: `Apple`, `a--b`.
- `@IsUrl({}, { message })`: tham số đầu là tuỳ chọn của bộ kiểm tra URL (để `{}` = mặc định), tham số thứ hai mới là thông báo lỗi. Hợp lệ: `https://placehold.co/200x80`. Không hợp lệ: `not-a-url`.
- `@IsOptional()`: không gửi thì bỏ qua các quy tắc khác; gửi thì vẫn kiểm tra.

## Bước 2: DTO sửa

Tạo `src/brands/dto/update-brand.dto.ts`:

```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateBrandDto } from './create-brand.dto.js';

// Body accepted by PATCH /api/v1/brands/:id:
// the same fields and rules as CreateBrandDto, but every field is optional.
export class UpdateBrandDto extends PartialType(CreateBrandDto) {}
```

`PartialType` copy mọi field **kèm quy tắc** của `CreateBrandDto`, rồi biến tất cả thành không bắt buộc.

## Bước 3: Service dùng DTO và chặn trùng slug

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

Thay đổi so với Phần 2:
- Xoá `Create...Input`, `Update...Input` (interface), thay bằng 2 DTO. Trong service dùng `import type` vì ở đây chỉ cần **kiểu**.
- `create` giờ có `async`, vì phải `await this.ensureSlugIsFree(...)` trước khi ghi.
- `ensureSlugIsFree`: chạy `SELECT ... WHERE slug = @0` trước khi ghi. Có hãng khác dùng slug đó thì ném `ConflictException` → **409** kèm thông báo rõ ràng, thay cho lỗi 500 từ database ở Phần 2.
  - Khi sửa (`update`), phải bỏ qua **chính hãng đang sửa** (`exceptId`). Nếu không, PATCH giữ nguyên slug cũ cũng bị báo trùng với chính nó.
  - Vẫn giữ ràng buộc `UNIQUE` trong database làm **lưới an toàn cuối cùng**: nếu hai request tạo cùng slug đến cùng lúc, cả hai có thể qua bước kiểm tra, nhưng database chỉ cho một dòng được ghi.
- `private`: hàm phụ chỉ dùng trong class, bên ngoài không gọi được.
- `Object.assign(brand, dto)` giờ an toàn: ValidationPipe đã loại mọi field không có trong DTO (`id`, `createdAt`...) trước khi tới đây.

Thay toàn bộ `src/brands/brands.service.spec.ts` (thêm test cho trường hợp trùng slug):

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

`fakeRepo.findOneBy.mockResolvedValue({ id: ..., slug: ... })`: giả như database **đã có** một dòng dùng slug này, để kiểm tra service ném 409.

## Bước 4: Controller dùng DTO

Trong `src/brands/brands.controller.ts`, thay đoạn import service:

```ts
import { BrandsService } from './brands.service.js';
// Regular (not "import type") imports: ValidationPipe needs the DTO classes at runtime
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
```

và 2 method `create`, `update`:

```ts
  // POST /api/v1/brands - responds 201 Created by default
  @Post()
  create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  // PATCH /api/v1/brands/1 - partial update
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBrandDto,
  ) {
    return this.brandsService.update(id, dto);
  }
```

**Quan trọng:** trong controller, DTO phải import **bình thường**, không dùng `import type`. Lúc chạy, NestJS đọc kiểu của tham số `@Body()` để biết dùng class nào mà kiểm tra. `import type` làm class bị xoá khi biên dịch, nên ValidationPipe không còn biết DTO là gì. TypeScript và lint **không báo lỗi**, nhưng lúc chạy validation sai hoàn toàn: các quy tắc của DTO biến mất, còn field hợp lệ như `slug` lại bị báo "should not exist".

## Bước 5: Gọi thử

Thêm vào `server/requests/brands.http`:

```http
### Invalid URL -> 400
POST {{baseUrl}}/brands
Content-Type: application/json

{
  "name": "Google",
  "slug": "google",
  "logoUrl": "not-a-url"
}

### Mass assignment is now blocked -> 400, nothing reaches SQL Server
PATCH {{baseUrl}}/brands/1
Content-Type: application/json

{
  "id": 999,
  "createdAt": "2000-01-01T00:00:00Z"
}

### Duplicate slug -> 409
POST {{baseUrl}}/brands
Content-Type: application/json

{
  "name": "Apple Inc",
  "slug": "apple"
}

### Valid -> 201 (409 if "google" is still there from Part 2: run npm run db:reset first)
POST {{baseUrl}}/brands
Content-Type: application/json

{
  "name": "Google",
  "slug": "google",
  "logoUrl": "https://placehold.co/200x80?text=Google"
}
```

## Kiểm tra

- [ ] 4 request ở Bước 5 trả đúng 400 / 400 / 409 / 201
- [ ] `PATCH` giữ nguyên slug cũ (`{"slug":"apple"}` cho hãng Apple) vẫn trả 200, không bị báo trùng
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

Viết thêm một test e2e trong `test/app.e2e-spec.ts`: `POST /api/v1/brands` với `logoUrl: "not-a-url"` phải trả 400.
