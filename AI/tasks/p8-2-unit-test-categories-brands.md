## Mục tiêu

Viết **unit test đầy đủ** cho `CategoriesService`, `BrandsService` và hai controller, thêm test cho quy tắc của DTO, rồi đo **độ phủ test** (coverage). Cuối task:

- `npm test` trong `server/` qua hết, không còn file spec "should be defined" nào hỏng.
- `npm run test:cov` cho thấy `src/categories` và `src/brands` phủ 100% số dòng.
- Những lỗi mà test phát hiện được đã được sửa.

**Làm sau:** Phần 7 đã merge (controller có `@Public()`, `@Roles()`). Làm **song song** được với task "Swagger cho toàn bộ API" và task "Unit test ProductsService và AuthService": ba task đụng các file khác nhau.

**Đọc trước:** giáo trình Bài 10 (unit test với Vitest).

## Unit test để làm gì?

Unit test chạy **một class** (một "đơn vị") tách khỏi mọi thứ còn lại: không SQL Server, không HTTP. Những gì class đó cần (repository, service khác) được thay bằng **đồ giả** (`vi.fn()`). Nhờ vậy test:

- chạy cực nhanh (cả trăm test trong vài giây), chạy được ở bất kỳ máy nào, kể cả máy CI ở Phần 14;
- chỉ hỏng khi **logic của class đó** sai, nên đọc lỗi là biết sai ở đâu.

Test e2e (Phần 1, 3, 7) thì ngược lại: chạy cả app thật với database thật, chậm hơn nhưng kiểm tra được các mảnh ghép nối với nhau. Dự án cần cả hai.

Một quy tắc khi viết test: **viết theo hành vi đúng** (yêu cầu của task, hướng dẫn), không viết theo code đang có. Nếu chỉ chép lại code vào test thì code sai, test cũng "đúng" theo.

## Bước 1: Test đầy đủ cho `CategoriesService`

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

  // A row as the database would return it
  const phones = (): Category =>
    Object.assign(new Category(), {
      id: 1,
      name: 'Điện thoại',
      slug: 'dien-thoai',
      sortOrder: 1,
      isActive: true,
    });

  beforeEach(async () => {
    // Forget the calls and fake results of the previous test
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        // Whoever asks for Repository<Category> gets the fake one
        { provide: getRepositoryToken(Category), useValue: fakeRepo },
      ],
    }).compile();

    service = module.get(CategoriesService);
  });

  describe('findAll', () => {
    it('sorts by sortOrder, smallest first (menu order)', async () => {
      fakeRepo.find.mockResolvedValue([phones()]);

      await expect(service.findAll()).resolves.toHaveLength(1);
      expect(fakeRepo.find).toHaveBeenCalledWith({
        order: { sortOrder: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the category when it exists', async () => {
      fakeRepo.findOneBy.mockResolvedValue(phones());
      await expect(service.findOne(1)).resolves.toMatchObject({ id: 1 });
      expect(fakeRepo.findOneBy).toHaveBeenCalledWith({ id: 1 });
    });

    it('throws 404 when it does not exist', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('saves the category when the slug is free', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null); // no category uses this slug
      const result = await service.create({ name: 'Đồng hồ', slug: 'dong-ho' });

      expect(result).toEqual({ id: 1, name: 'Đồng hồ', slug: 'dong-ho' });
      expect(fakeRepo.save).toHaveBeenCalledOnce();
    });

    it('rejects a duplicate slug with 409 and saves nothing', async () => {
      fakeRepo.findOneBy.mockResolvedValue({ id: 2, slug: 'laptop' });

      await expect(
        service.create({ name: 'Laptop', slug: 'laptop' }),
      ).rejects.toThrow(ConflictException);
      expect(fakeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('copies the sent fields onto the row and saves it', async () => {
      fakeRepo.findOneBy.mockResolvedValue(phones());

      const result = await service.update(1, { name: 'Smartphone' });

      expect(result).toMatchObject({
        id: 1,
        name: 'Smartphone',
        slug: 'dien-thoai',
      });
      // No slug in the body: no need to check for duplicates
      expect(fakeRepo.findOneBy).toHaveBeenCalledOnce();
    });

    it('allows keeping its own slug', async () => {
      // 1st call: findOne(1). 2nd call: the slug check finds... the same category
      fakeRepo.findOneBy
        .mockResolvedValueOnce(phones())
        .mockResolvedValueOnce(phones());

      await expect(
        service.update(1, { slug: 'dien-thoai' }),
      ).resolves.toMatchObject({ slug: 'dien-thoai' });
    });

    it("rejects another category's slug with 409", async () => {
      fakeRepo.findOneBy
        .mockResolvedValueOnce(phones())
        .mockResolvedValueOnce({ id: 2, slug: 'laptop' });

      await expect(service.update(1, { slug: 'laptop' })).rejects.toThrow(
        ConflictException,
      );
      expect(fakeRepo.save).not.toHaveBeenCalled();
    });

    it('throws 404 for a missing category', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);
      await expect(service.update(999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes the loaded row', async () => {
      const row = phones();
      fakeRepo.findOneBy.mockResolvedValue(row);

      await service.remove(1);

      expect(fakeRepo.remove).toHaveBeenCalledWith(row);
    });

    it('throws 404 and deletes nothing for a missing category', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(fakeRepo.remove).not.toHaveBeenCalled();
    });
  });
});
```

Giải thích:
- `describe` lồng nhau: mỗi method một nhóm, báo cáo đọc như mục lục (`CategoriesService > update > allows keeping its own slug`).
- `phones()` là **hàm** tạo dữ liệu mẫu, không phải một biến dùng chung. `update` sửa thẳng lên object (`Object.assign`), nếu dùng chung một object thì test trước làm bẩn dữ liệu của test sau.
- `vi.clearAllMocks()` trong `beforeEach`: xoá lịch sử gọi và giá trị giả của test trước. Thiếu dòng này, `toHaveBeenCalledOnce()` sẽ đếm cả lần gọi của test khác.
- `mockResolvedValueOnce(a).mockResolvedValueOnce(b)`: lần gọi thứ nhất trả `a`, lần thứ hai trả `b`. `update` gọi `findOneBy` hai lần (tìm danh mục theo `id`, rồi kiểm tra trùng `slug`), nên ta giả lập được từng lần.
- Ngoài kiểm tra kết quả, test còn kiểm tra **điều không được xảy ra**: trùng slug thì `save` **không** được gọi, xoá danh mục không tồn tại thì `remove` **không** được gọi.
- `toMatchObject` chỉ so các field ghi trong kỳ vọng, `toEqual` thì so toàn bộ.

## Bước 2: Test controller

Thay toàn bộ `src/categories/categories.controller.spec.ts` (bản do CLI sinh ra đang hỏng vì thiếu `CategoriesService`):

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

describe('CategoriesController', () => {
  let controller: CategoriesController;

  // The controller only forwards to the service, so a fake service is enough.
  // Each method returns a recognisable value to check the controller passes it back.
  const fakeService = {
    findAll: vi.fn().mockResolvedValue([{ id: 1 }]),
    findOne: vi.fn().mockResolvedValue({ id: 1 }),
    create: vi.fn().mockResolvedValue({ id: 5 }),
    update: vi.fn().mockResolvedValue({ id: 1, name: 'Smartphone' }),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: fakeService }],
    }).compile();

    controller = module.get(CategoriesController);
  });

  it('findAll returns what the service returns', async () => {
    await expect(controller.findAll()).resolves.toEqual([{ id: 1 }]);
  });

  it('findOne passes the id through', async () => {
    await controller.findOne(1);
    expect(fakeService.findOne).toHaveBeenCalledWith(1);
  });

  it('create passes the body through', async () => {
    const dto = { name: 'Đồng hồ', slug: 'dong-ho' };
    await expect(controller.create(dto)).resolves.toEqual({ id: 5 });
    expect(fakeService.create).toHaveBeenCalledWith(dto);
  });

  it('update passes the id and the body through', async () => {
    await controller.update(1, { name: 'Smartphone' });
    expect(fakeService.update).toHaveBeenCalledWith(1, { name: 'Smartphone' });
  });

  it('remove returns the Promise so Nest waits for it', async () => {
    // If remove() forgot "return", the result would be undefined, not a Promise
    const result = controller.remove(1);
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(fakeService.remove).toHaveBeenCalledWith(1);
  });
});
```

Controller chỉ chuyển tiếp xuống service, nên test kiểm tra đúng hai việc: truyền **đúng tham số** xuống, và trả lại **đúng kết quả** của service. Test `remove` kiểm tra controller **trả Promise về** (có `return`), lỗi đã nói ở Phần 2: thiếu `return` thì NestJS trả lời ngay mà không chờ service.

## Bước 3: Test quy tắc của DTO

Quy tắc trong DTO (`@MaxLength`, `@Matches`...) cũng là logic, và test được mà không cần chạy API. Tạo `src/categories/dto/create-category.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto.js';

// Runs the DTO rules exactly like ValidationPipe does, without starting the API:
// plain JSON -> DTO instance -> validate(). Returns the names of the invalid fields.
async function invalidFields(body: object): Promise<string[]> {
  const dto = plainToInstance(CreateCategoryDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('CreateCategoryDto', () => {
  const valid = { name: 'Đồng hồ', slug: 'dong-ho', sortOrder: 5 };

  it('accepts a valid body', async () => {
    await expect(invalidFields(valid)).resolves.toEqual([]);
  });

  // it.each runs the same test once per row: [field, body, why]
  it.each<[field: string, body: object, why: string]>([
    ['name', { ...valid, name: '' }, 'empty name'],
    [
      'name',
      { ...valid, name: 'a'.repeat(101) },
      'name longer than NVARCHAR(100)',
    ],
    ['slug', { ...valid, slug: 'Dong Ho' }, 'uppercase and space in slug'],
    ['slug', { ...valid, slug: 'dong--ho' }, 'double dash in slug'],
    ['sortOrder', { ...valid, sortOrder: -1 }, 'negative sortOrder'],
    ['sortOrder', { ...valid, sortOrder: '5' }, 'sortOrder sent as a string'],
    ['isActive', { ...valid, isActive: 'yes' }, 'isActive not a boolean'],
    [
      'createdAt',
      { ...valid, createdAt: '2000-01-01' },
      'field not in the DTO',
    ],
  ])('rejects %s: %s (%s)', async (field, body) => {
    await expect(invalidFields(body)).resolves.toContain(field);
  });

  // The DTO limit must match the column: slug is VARCHAR(120) in schema.sql
  it('accepts a slug of exactly 120 characters', async () => {
    const slug = 'a'.repeat(120);
    await expect(invalidFields({ ...valid, slug })).resolves.toEqual([]);
  });

  it('rejects a slug of 121 characters', async () => {
    const slug = 'a'.repeat(121);
    await expect(invalidFields({ ...valid, slug })).resolves.toContain('slug');
  });
});
```

Giải thích:
- `plainToInstance` + `validate`: đúng hai bước `ValidationPipe` làm với body của request. Hàm `invalidFields` trả về tên các field sai, để test ngắn gọn.
- `it.each([...])`: một test chạy lại với **từng dòng** dữ liệu. `%s` trong tên test được thay bằng giá trị của dòng đó, nên báo cáo hiện rõ dòng nào hỏng. `<[field: string, body: object, why: string]>` khai báo kiểu cho mỗi dòng.
- Hai test cuối kiểm tra **ranh giới**: 120 ký tự phải qua, 121 phải bị chặn, vì cột `slug` là `VARCHAR(120)`. Lỗi hay nằm ở ranh giới nhất.

## Bước 4: Chạy, rồi sửa những gì test phát hiện

```powershell
cd server
npm test
```

Nếu code của bạn giống hệt các hướng dẫn trước thì mọi test đều qua. Còn nếu có test đỏ, **đừng sửa test cho xanh**: đọc lại yêu cầu, nếu test đúng thì sửa code. Khi viết hướng dẫn này, chạy trên code đang có trên `main` thì gặp đúng 3 test đỏ:

| Test đỏ | Nguyên nhân | Sửa trong code |
|---|---|---|
| `findAll > sorts by sortOrder, smallest first` | Service sắp `sortOrder: 'DESC'`: menu sẽ hiện "Phụ kiện" trước "Điện thoại" | `categories.service.ts`: `order: { sortOrder: 'ASC' }` |
| `accepts a slug of exactly 120 characters` | DTO ghi `@MaxLength(100, ...)` cho slug, trong khi cột là `VARCHAR(120)` (thông báo lỗi lại ghi 120) | `create-category.dto.ts`: `@MaxLength(120, ...)` cho `slug` |
| `remove returns the Promise...` | Method trong controller tên `delete` và thiếu `@HttpCode(204)`: `DELETE` trả 200 thay vì 204 | Đổi tên thành `remove`, thêm `@HttpCode(204)` (import `HttpCode` từ `@nestjs/common`) |

Method `remove` trong controller sau khi sửa:

```ts
  // DELETE /api/v1/categories/1 - 204 No Content: success, empty body
  @Roles('admin')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
```

Đó chính là giá trị của unit test: ba lỗi này đều "chạy được", không ai để ý, cho tới khi trang web hiện menu ngược hoặc frontend chờ mã 204.

## Bước 5: Làm tương tự cho brands

Thay toàn bộ `src/brands/brands.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BrandsService } from './brands.service.js';
import { Brand } from './brands.entity.js';

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

  // A row as the database would return it
  const apple = (): Brand =>
    Object.assign(new Brand(), {
      id: 1,
      name: 'Apple',
      slug: 'apple',
      logoUrl: null,
      isActive: true,
    });

  beforeEach(async () => {
    // Forget the calls and fake results of the previous test
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandsService,
        // Whoever asks for Repository<Brand> gets the fake one
        { provide: getRepositoryToken(Brand), useValue: fakeRepo },
      ],
    }).compile();

    service = module.get(BrandsService);
  });

  describe('findAll', () => {
    it('sorts by name A to Z', async () => {
      fakeRepo.find.mockResolvedValue([apple()]);

      await expect(service.findAll()).resolves.toHaveLength(1);
      expect(fakeRepo.find).toHaveBeenCalledWith({
        order: { name: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the brand when it exists', async () => {
      fakeRepo.findOneBy.mockResolvedValue(apple());
      await expect(service.findOne(1)).resolves.toMatchObject({ id: 1 });
      expect(fakeRepo.findOneBy).toHaveBeenCalledWith({ id: 1 });
    });

    it('throws 404 when it does not exist', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('saves the brand when the slug is free', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null); // no brand uses this slug
      const result = await service.create({ name: 'Google', slug: 'google' });

      expect(result).toEqual({ id: 1, name: 'Google', slug: 'google' });
      expect(fakeRepo.save).toHaveBeenCalledOnce();
    });

    it('rejects a duplicate slug with 409 and saves nothing', async () => {
      fakeRepo.findOneBy.mockResolvedValue({ id: 2, slug: 'samsung' });

      await expect(
        service.create({ name: 'Samsung', slug: 'samsung' }),
      ).rejects.toThrow(ConflictException);
      expect(fakeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('copies the sent fields onto the row and saves it', async () => {
      fakeRepo.findOneBy.mockResolvedValue(apple());

      const result = await service.update(1, { name: 'Apple Inc' });

      expect(result).toMatchObject({
        id: 1,
        name: 'Apple Inc',
        slug: 'apple',
      });
      // No slug in the body: no need to check for duplicates
      expect(fakeRepo.findOneBy).toHaveBeenCalledOnce();
    });

    it('allows keeping its own slug', async () => {
      // 1st call: findOne(1). 2nd call: the slug check finds... the same brand
      fakeRepo.findOneBy
        .mockResolvedValueOnce(apple())
        .mockResolvedValueOnce(apple());

      await expect(service.update(1, { slug: 'apple' })).resolves.toMatchObject(
        { slug: 'apple' },
      );
    });

    it("rejects another brand's slug with 409", async () => {
      fakeRepo.findOneBy
        .mockResolvedValueOnce(apple())
        .mockResolvedValueOnce({ id: 2, slug: 'samsung' });

      await expect(service.update(1, { slug: 'samsung' })).rejects.toThrow(
        ConflictException,
      );
      expect(fakeRepo.save).not.toHaveBeenCalled();
    });

    it('throws 404 for a missing brand', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);
      await expect(service.update(999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes the loaded row', async () => {
      const row = apple();
      fakeRepo.findOneBy.mockResolvedValue(row);

      await service.remove(1);

      expect(fakeRepo.remove).toHaveBeenCalledWith(row);
    });

    it('throws 404 and deletes nothing for a missing brand', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(fakeRepo.remove).not.toHaveBeenCalled();
    });
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

  // The controller only forwards to the service, so a fake service is enough.
  // Each method returns a recognisable value to check the controller passes it back.
  const fakeService = {
    findAll: vi.fn().mockResolvedValue([{ id: 1 }]),
    findOne: vi.fn().mockResolvedValue({ id: 1 }),
    create: vi.fn().mockResolvedValue({ id: 5 }),
    update: vi.fn().mockResolvedValue({ id: 1, name: 'Apple Inc' }),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandsController],
      providers: [{ provide: BrandsService, useValue: fakeService }],
    }).compile();

    controller = module.get(BrandsController);
  });

  it('findAll returns what the service returns', async () => {
    await expect(controller.findAll()).resolves.toEqual([{ id: 1 }]);
  });

  it('findOne passes the id through', async () => {
    await controller.findOne(1);
    expect(fakeService.findOne).toHaveBeenCalledWith(1);
  });

  it('create passes the body through', async () => {
    const dto = { name: 'Google', slug: 'google' };
    await expect(controller.create(dto)).resolves.toEqual({ id: 5 });
    expect(fakeService.create).toHaveBeenCalledWith(dto);
  });

  it('update passes the id and the body through', async () => {
    await controller.update(1, { name: 'Apple Inc' });
    expect(fakeService.update).toHaveBeenCalledWith(1, { name: 'Apple Inc' });
  });

  it('remove returns the Promise so Nest waits for it', async () => {
    // If remove() forgot "return", the result would be undefined, not a Promise
    const result = controller.remove(1);
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(fakeService.remove).toHaveBeenCalledWith(1);
  });
});
```

Khác với categories ở chỗ: hãng sắp theo `name` A→Z, dữ liệu mẫu có `logoUrl: null`.

## Bước 6: Đo độ phủ test

Thay toàn bộ `server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // npm run test:cov: which lines of src/ did the unit tests run?
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Not business logic: bootstrapping, module wiring, plain data shapes
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/swagger.ts',
        'src/**/*.module.ts',
        'src/**/*.entity.ts',
        'src/**/*.dto.ts',
      ],
      reporter: ['text', 'html'], // table in the terminal + coverage/index.html
    },
  },
});
```

Chạy:

```powershell
npm run test:cov
```

Cuối kết quả có bảng:

```
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
 src/brands        |     100 |       90 |     100 |     100 |
 src/categories    |     100 |       90 |     100 |     100 |
```

- **% Lines**: bao nhiêu phần trăm số dòng đã được test chạy qua. **% Branch**: bao nhiêu phần trăm các nhánh `if`/`&&`/`?:` đã đi qua **cả hai** hướng.
- Mở `server/coverage/index.html` bằng trình duyệt: dòng **đỏ** là chưa test nào chạy tới, dòng **vàng** là nhánh chưa đi đủ hai hướng. Thư mục `coverage/` đã nằm trong `.gitignore`, không commit.
- `exclude`: bỏ qua những file không có logic để test (module, entity, DTO, `main.ts`). Tính cả vào thì con số thấp đi mà không nói lên điều gì.

Coverage 100% **không** có nghĩa là không có lỗi: nó chỉ nói dòng đó đã **chạy**, không nói kết quả đã được **kiểm tra**. Dùng nó để tìm chỗ chưa test, đừng chạy theo con số.

## Kiểm tra

- [ ] `npm test` qua hết (riêng hai file spec của products thuộc task "Unit test ProductsService và AuthService", có thể còn đỏ nếu task đó chưa merge)
- [ ] `npm run test:cov`: `src/categories`, `src/brands` đạt 100% số dòng
- [ ] Các lỗi test phát hiện đã được sửa trong code, không sửa test cho xanh
- [ ] `npm run lint` qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Mở `coverage/index.html`, tìm nhánh màu vàng còn thiếu trong `categories.service.ts` (gợi ý: `existing && existing.id !== exceptId`). Viết thêm một test để branch lên 100%.
2. Viết `src/brands/dto/create-brand.dto.spec.ts` theo mẫu Bước 3: `logoUrl` phải là URL hợp lệ (`not-a-url` bị chặn, `https://placehold.co/200x80` thì qua), `name` không được rỗng.
3. Tạm xoá dòng `vi.clearAllMocks()` trong `categories.service.spec.ts`, chạy lại: test nào đỏ, vì sao? Nhớ trả lại.
