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
import type { Brand } from './brand.interface.js';
import type { CreateBrandDto } from './dto/create-brand.dto.js';
import type { UpdateBrandDto } from './dto/update-brand.dto.js';

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

  create(dto: CreateBrandDto): Brand {
    this.ensureSlugIsFree(dto.slug);
    const brand: Brand = {
      id: this.nextId++,
      name: dto.name,
      slug: dto.slug,
      logoUrl: dto.logoUrl ?? null,
      isActive: dto.isActive ?? true,
      createdAt: new Date(),
    };
    this.brands.push(brand);
    return brand;
  }

  update(id: number, dto: UpdateBrandDto): Brand {
    const brand = this.findOne(id); // throws 404 when missing
    if (dto.slug !== undefined) this.ensureSlugIsFree(dto.slug, id);
    // Safe now: the DTO only contains whitelisted fields, so "id" can't be overwritten
    Object.assign(brand, dto);
    return brand;
  }

  remove(id: number): void {
    this.findOne(id); // throws 404 when missing
    this.brands = this.brands.filter((b) => b.id !== id);
  }

  // Slugs appear in URLs, so two brands can't share one (409 Conflict)
  private ensureSlugIsFree(slug: string, exceptId?: number): void {
    const taken = this.brands.some((b) => b.slug === slug && b.id !== exceptId);
    if (taken) throw new ConflictException(`Slug "${slug}" đã được dùng`);
  }
}
```

Thay đổi so với Phần 2:
- Xoá `CreateBrandInput`, `UpdateBrandInput`, thay bằng 2 DTO. Trong service dùng `import type` vì ở đây chỉ cần **kiểu**.
- `ensureSlugIsFree`: không cho hai hãng trùng slug, trùng thì `ConflictException` → **409**. Khi sửa thì bỏ qua **chính hãng đang sửa** (`exceptId`), nếu không PATCH giữ nguyên slug cũng bị báo trùng với chính nó.

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

### Mass assignment is now blocked -> 400 "property id should not exist"
PATCH {{baseUrl}}/brands/1
Content-Type: application/json

{
  "id": 999
}

### Duplicate slug -> 409
POST {{baseUrl}}/brands
Content-Type: application/json

{
  "name": "Apple Inc",
  "slug": "apple"
}

### Valid -> 201
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
