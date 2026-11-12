## Mục tiêu

Trang Swagger (http://localhost:3000/api/docs) đã chạy từ trước, nhưng mới chỉ liệt kê route. Task này làm cho nó thành **tài liệu API thật sự**, người mới đọc là dùng được:

- Mỗi route có **mô tả tiếng Việt** và các route được **nhóm** theo chức năng (Danh mục, Hãng, Sản phẩm, Tài khoản, Hệ thống).
- Mỗi route ghi rõ các **mã lỗi** có thể trả về (400, 401, 403, 404, 409).
- Route `@Public()` **không có ổ khoá**; route cần đăng nhập có ổ khoá, route admin ghi rõ 401/403.
- Body mẫu có sẵn dữ liệu (bấm **Try it out** là gửi được ngay).
- Kết quả của danh sách sản phẩm và của đăng nhập hiện đủ field thay vì `object` trống.
- `passwordHash` biến mất khỏi tài liệu.

Cuối task: đăng nhập trên Swagger, bấm **Authorize** dán token admin, rồi tạo danh mục ngay trên Swagger.

**Làm sau:** Phần 7 đã merge. Làm **song song** được với hai task unit test của Phần 8.

**Đọc trước:** giáo trình Bài 10 (Swagger).

## Swagger lấy thông tin từ đâu?

Có ba nguồn, bạn đã dùng hai nguồn đầu từ trước:

| Nguồn | Swagger biết được | Ví dụ |
|---|---|---|
| Decorator của NestJS | Route, method, tham số URL | `@Get(':id')`, `@Query()` |
| **Plugin** `@nestjs/swagger` (khai báo trong `nest-cli.json`) | Field của **class** DTO/entity, kiểu dữ liệu, quy tắc `class-validator` (`@MaxLength` → `maxLength`) | `CreateCategoryDto` |
| Decorator `@Api...` (task này) | Những gì code không tự nói lên được: mô tả, ví dụ, mã lỗi, ẩn field | `@ApiOperation`, `@ApiProperty` |

Plugin chạy lúc **build**, nên nó chỉ đọc được những gì còn tồn tại khi chạy: **class**. `interface` bị xoá khi biên dịch, nên route trả về interface hiện trong Swagger là `object` trống. Vì vậy task này đổi vài interface thành class.

## Bước 1: `@Public()` và `@Roles()` tự ghi tài liệu

Hai decorator này đã đánh dấu route nào cần đăng nhập, cần quyền gì. Thay vì ghi lại cùng thông tin đó bằng decorator Swagger ở từng route, ta cho chúng tự làm luôn.

Thay toàn bộ `src/auth/decorators/public.decorator.ts`:

```ts
import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

export const IS_PUBLIC_KEY = 'isPublic';

// Every route requires a login by default (AuthGuard is global).
// @Public() marks the exceptions: product pages, login, register...
// applyDecorators bundles several decorators into one:
// - SetMetadata: the flag AuthGuard reads
// - ApiSecurity({}): tells Swagger "no token needed" (no lock icon on this route)
export const Public = () =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), ApiSecurity({}));
```

Thay toàn bộ `src/auth/decorators/roles.decorator.ts`:

```ts
import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { UserRole } from '../../users/user.entity.js';

export const ROLES_KEY = 'roles';

// @Roles('admin') - only users with one of these roles may call the route (else 403).
// Routes without @Roles() are open to any logged-in user.
// The two Api...Response decorators document those errors in Swagger.
export const Roles = (...roles: UserRole[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' }),
    ApiForbiddenResponse({ description: `Chỉ dành cho: ${roles.join(', ')}` }),
  );
```

Giải thích:
- `applyDecorators(a, b, c)` gộp nhiều decorator thành một. Viết `@Roles('admin')` thì NestJS chạy cả ba.
- `ApiSecurity({})`: trong `src/swagger.ts`, `addSecurityRequirements('bearer')` bắt **mọi** route cần token. `ApiSecurity({})` ghi đè cho route này một yêu cầu **rỗng**, nghĩa là không cần gì: Swagger bỏ ổ khoá.
- `AuthGuard`, `RolesGuard` vẫn đọc `IS_PUBLIC_KEY`, `ROLES_KEY` như cũ, không phải sửa gì.

## Bước 2: Mô tả và mã lỗi cho từng route

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
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-caregory.dto.js';

// Group name shown in Swagger (default would be the class name "Categories")
@ApiTags('Danh mục')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @ApiOperation({ summary: 'Danh sách danh mục, theo thứ tự hiển thị' })
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Public()
  @ApiOperation({ summary: 'Chi tiết một danh mục' })
  @ApiNotFoundResponse({ description: 'Không có danh mục với id này' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.findOne(id);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Tạo danh mục' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ' })
  @ApiConflictResponse({ description: 'Slug đã được dùng' })
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Sửa một phần danh mục' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ' })
  @ApiNotFoundResponse({ description: 'Không có danh mục với id này' })
  @ApiConflictResponse({ description: 'Slug đã được dùng' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Xoá danh mục' })
  @ApiNotFoundResponse({ description: 'Không có danh mục với id này' })
  @ApiConflictResponse({ description: 'Danh mục còn sản phẩm, không xoá được' })
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
```

Giải thích:
- `@ApiTags('Danh mục')` đặt trên class: tên nhóm trên Swagger (mặc định là tên class).
- `@ApiOperation({ summary })`: dòng mô tả cạnh đường dẫn.
- `@ApiNotFoundResponse`, `@ApiConflictResponse`, `@ApiBadRequestResponse`: ghi các lỗi **service có thể ném**. Đọc service để biết: `findOne` ném `NotFoundException` → 404; `ensureSlugIsFree` ném `ConflictException` → 409; xoá danh mục còn sản phẩm thì filter lỗi SQL (Phần 6) trả 409.
- Thứ tự decorator không quan trọng với Swagger. Dự án giữ một thứ tự cho dễ đọc: quyền (`@Public`/`@Roles`) → mô tả → lỗi → route.
- File này cũng có `@HttpCode(204)` và tên method `remove`: nếu task "Unit test CategoriesService và BrandsService" chưa merge thì code của bạn có thể còn tên `delete`, bản ở đây là bản đúng.

Thay toàn bộ `src/brands/brands.controller.ts`, cùng mẫu với categories:

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
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { BrandsService } from './brands.service.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';

@ApiTags('Hãng')
@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Public()
  @ApiOperation({ summary: 'Danh sách hãng, theo tên A-Z' })
  @Get()
  findAll() {
    return this.brandsService.findAll();
  }

  @Public()
  @ApiOperation({ summary: 'Chi tiết một hãng' })
  @ApiNotFoundResponse({ description: 'Không có hãng với id này' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.brandsService.findOne(id);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Tạo hãng' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ' })
  @ApiConflictResponse({ description: 'Slug đã được dùng' })
  @Post()
  create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Sửa một phần hãng' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ' })
  @ApiNotFoundResponse({ description: 'Không có hãng với id này' })
  @ApiConflictResponse({ description: 'Slug đã được dùng' })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Xoá hãng' })
  @ApiNotFoundResponse({ description: 'Không có hãng với id này' })
  @ApiConflictResponse({ description: 'Hãng còn sản phẩm, không xoá được' })
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.brandsService.remove(id);
  }
}
```

## Bước 3: Kết quả danh sách sản phẩm phải là class

`ProductsService` đang khai báo kết quả bằng `interface ProductListItem`, `interface ProductListResult`, nên Swagger hiện `GET /products` trả về `object`. Chuyển chúng thành class trong một file `*.dto.ts` (plugin chỉ đọc file có đuôi `.dto.ts` hoặc `.entity.ts`).

Tạo `src/products/dto/product-list.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

// Response shapes of GET /api/v1/products.
// They are classes (not interfaces) in a *.dto.ts file only so the Swagger plugin
// can read them: interfaces disappear at runtime, Swagger would show "object".

export class NameSlugDto {
  @ApiProperty({ example: 'Điện thoại' })
  name: string;

  @ApiProperty({ example: 'dien-thoai' })
  slug: string;
}

export class ProductListItem {
  id: number;

  @ApiProperty({ example: 'iPhone 17 Pro Max' })
  name: string;

  @ApiProperty({ example: 'iphone-17-pro-max' })
  slug: string;

  shortDescription: string | null;
  thumbnailUrl: string | null;
  isFeatured: boolean;
  category: NameSlugDto;
  brand: NameSlugDto;

  @ApiProperty({
    description: 'Giá thấp nhất sau khuyến mãi',
    example: 34990000,
  })
  fromPrice: number;

  @ApiProperty({ description: 'Giá niêm yết thấp nhất', example: 37990000 })
  listPrice: number;

  @ApiProperty({ description: 'Còn ít nhất một phiên bản có hàng' })
  inStock: boolean;
}

export class ProductListResult {
  items: ProductListItem[];

  @ApiProperty({ description: 'Tổng số sản phẩm khớp bộ lọc', example: 25 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 12 })
  limit: number;
}
```

Trong `src/products/products.service.ts`:

1. **Xoá** hai khối `export interface ProductListItem {...}` và `export interface ProductListResult {...}` (giữ nguyên `interface ProductListRow`: nó là dữ liệu nội bộ, không ra khỏi service).
2. Thêm import:

   ```ts
   import type { ProductListResult } from './dto/product-list.dto.js';
   ```

Service không phải sửa gì thêm: object `{ items, total, page, limit }` nó tạo ra có đúng các field của class, TypeScript chấp nhận.

- Field không có `@ApiProperty` (ví dụ `shortDescription`) vẫn hiện trong Swagger nhờ plugin. `@ApiProperty` chỉ để thêm `description`, `example`.
- `NameSlugDto` là class riêng cho `category` và `brand`: plugin không mô tả được kiểu viết liền `{ name: string; slug: string }`.

Thay toàn bộ `src/products/products.controller.ts`:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductsService } from './products.service.js';

@ApiTags('Sản phẩm')
@Controller('products')
export class ProductsController {
  constructor(private readonly productService: ProductsService) {}

  @Public()
  @ApiOperation({
    summary: 'Danh sách sản phẩm: lọc, tìm kiếm, sắp xếp, phân trang',
    description:
      'Mọi tham số đều không bắt buộc. Giá lọc theo giá sau khuyến mãi (VND).',
  })
  @ApiBadRequestResponse({
    description: 'Tham số không hợp lệ, ví dụ limit > 50',
  })
  @Get()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productService.findAll(query);
  }

  @Public()
  @ApiOperation({
    summary: 'Chi tiết sản phẩm: danh mục, hãng, các phiên bản đang bán, ảnh',
  })
  @ApiNotFoundResponse({
    description: 'Không có sản phẩm, hoặc sản phẩm đã ẩn',
  })
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productService.findBySlug(slug);
  }
}
```

Trong `src/products/dto/list-products-query.dto.ts`, thêm mô tả cho các tham số lọc. Thêm import:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
```

và một dòng `@ApiPropertyOptional(...)` phía trên mỗi field. File hoàn chỉnh:

```ts
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const PRODUCT_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'name_asc',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ListProductsQueryDto {
  @ApiPropertyOptional({ description: 'Slug danh mục, ví dụ laptop' })
  @IsOptional()
  @Matches(SLUG, { message: 'The category must be a valid slug.' })
  category?: string;

  @ApiPropertyOptional({ description: 'Slug hãng, ví dụ apple' })
  @IsOptional()
  @Matches(SLUG, { message: 'The brand must be a valid slug.' })
  brand?: string;

  @ApiPropertyOptional({ description: 'Tìm trong tên sản phẩm' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Max length 100 char' })
  q?: string;

  @ApiPropertyOptional({ description: 'Giá thấp nhất (VND), ví dụ 20000000' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'minPrice must be an integer' })
  @Min(0, { message: 'minPrice cannot be negative' })
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Giá cao nhất (VND)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxPrice must be an integer' })
  @Min(0, { message: 'maxPrice cannot be negative' })
  maxPrice?: number;

  // "true" / "false" in the URL -> boolean; anything else fails @IsBoolean
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'featured must be the true or false' })
  featured?: boolean;

  @IsOptional()
  @IsIn(PRODUCT_SORTS, {
    message: `sort: ${PRODUCT_SORTS.join(', ')}`,
  })
  sort: ProductSort = 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page start to 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit minimun 1' })
  @Max(50, { message: 'limit maximun 50' })
  limit: number = 12;
}
```

Ở đây chỉ dùng `description`, **không** dùng `example`: Swagger điền sẵn `example` vào ô nhập khi **Try it out**, thế là mọi lần thử đều bị lọc theo giá trị mẫu mà người dùng không để ý.

## Bước 4: Đăng ký, đăng nhập

Kết quả đăng ký/đăng nhập cũng đang là `interface AuthResponse`. Tạo `src/auth/dto/auth-response.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/user.entity.js';

// What register and login send back. A class (not an interface) so Swagger can show it.
export class AuthResponse {
  @ApiProperty({
    description:
      'JWT. Gửi kèm mọi request cần đăng nhập: Authorization: Bearer <token>',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  // passwordHash is removed by ClassSerializerInterceptor
  user: User;
}
```

Trong `src/auth/auth.service.ts`, **xoá** khối `export interface AuthResponse {...}` (cùng dòng comment phía trên) và thêm import:

```ts
import type { AuthResponse } from './dto/auth-response.dto.js';
```

Thay toàn bộ `src/auth/auth.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
// Regular (not "import type") imports: ValidationPipe needs the DTO classes at runtime
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { JwtPayload } from './jwt-payload.js';

// Routes under /api/v1/auth
@ApiTags('Tài khoản')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/v1/auth/register - 201 Created: a new user row exists
  @Public()
  @ApiOperation({ summary: 'Đăng ký tài khoản khách hàng, trả về token' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ' })
  @ApiConflictResponse({ description: 'Email đã được đăng ký' })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // POST /api/v1/auth/login - 200 OK: nothing is created, we only check credentials
  @Public()
  @ApiOperation({
    summary: 'Đăng nhập, trả về token',
    description:
      'Copy accessToken, bấm nút Authorize ở đầu trang và dán vào để gọi các API cần đăng nhập.',
  })
  @ApiUnauthorizedResponse({ description: 'Sai email hoặc mật khẩu' })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // GET /api/v1/auth/me - not @Public(): AuthGuard requires "Authorization: Bearer <token>"
  @ApiOperation({ summary: 'Thông tin tài khoản đang đăng nhập' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập hoặc token hết hạn' })
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }
}
```

Thêm ví dụ cho DTO, để **Try it out** có sẵn dữ liệu. File `src/auth/dto/login.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// Body accepted by POST /api/v1/auth/login.
// No password rules here: they belong to register. Login only checks "is it the right one".
export class LoginDto {
  @ApiProperty({ example: 'binh@mail.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'matkhau123' })
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password: string;
}
```

Trong `src/auth/dto/register.dto.ts`, thêm `import { ApiProperty } from '@nestjs/swagger';` và một `@ApiProperty({ example: ... })` phía trên mỗi field:

```ts
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Body accepted by POST /api/v1/auth/register
export class RegisterDto {
  @ApiProperty({ example: 'binh@mail.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255, { message: 'Email tối đa 255 ký tự' })
  email: string;

  @ApiProperty({ example: 'matkhau123' })
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @MaxLength(100, { message: 'Mật khẩu tối đa 100 ký tự' })
  // (?=.*[A-Za-z]) = "somewhere there is a letter", (?=.*\d) = "somewhere there is a digit"
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Mật khẩu phải có cả chữ và số',
  })
  password: string;

  @ApiProperty({ example: 'Trần Thị Bình' })
  @IsString({ message: 'Họ tên phải là chuỗi' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
  fullName: string;

  // Vietnamese mobile number: 10 digits starting with 0, e.g. 0901234567
  @ApiProperty({ required: false, example: '0901234567' })
  @IsOptional()
  @Matches(/^0\d{9}$/, {
    message: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0',
  })
  phone?: string;
}
```

`@ApiProperty` chỉ **thêm** thông tin: `maxLength`, `pattern`... mà plugin đọc từ `class-validator` vẫn còn nguyên. `phone` không bắt buộc nên ghi thêm `required: false`.

## Bước 5: Ẩn `passwordHash` khỏi tài liệu

Mở http://localhost:3000/api/docs, kéo xuống **Schemas → User**: có `passwordHash`. API thật **không** trả field này (`@Exclude()` + `ClassSerializerInterceptor`, Phần 7), nhưng plugin không biết `@Exclude()` nên vẫn ghi vào tài liệu. Tài liệu sai còn tệ hơn không có tài liệu.

Trong `src/users/user.entity.ts`, thêm import và một dòng phía trên `@Exclude()`:

```ts
import { ApiHideProperty } from '@nestjs/swagger';
```

```ts
  // Never sent to the client: ClassSerializerInterceptor drops @Exclude() fields.
  // @ApiHideProperty: also keep it out of the Swagger docs
  @ApiHideProperty()
  @Exclude()
  @Column({ type: 'nvarchar', length: 255 })
  passwordHash: string;
```

## Bước 6: Ví dụ cho DTO tạo danh mục, hãng; nhóm "Hệ thống"

Trong `src/categories/dto/create-category.dto.ts` và `src/brands/dto/create-brand.dto.ts`, thêm `import { ApiProperty } from '@nestjs/swagger';` và `@ApiProperty({ example })` cho `name`, `slug` (và `logoUrl` của hãng, kèm `required: false`). Ví dụ với categories:

```ts
  @ApiProperty({ example: 'Đồng hồ thông minh' })
  @IsString({ message: 'The category name must be in string format' })
  ...
  name: string;

  @ApiProperty({ example: 'dong-ho' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  ...
  slug: string;
```

Trong `src/app.controller.ts`: thêm `import { ApiOperation, ApiTags } from '@nestjs/swagger';`, `@ApiTags('Hệ thống')` trên class, và `@ApiOperation({ summary: ... })` cho `getInfo`, `getHealth`.

## Bước 7: Thử trọn luồng trên Swagger

`npm run dev`, mở http://localhost:3000/api/docs. Kiểm tra:

1. Các nhóm **Danh mục, Hãng, Hệ thống, Sản phẩm, Tài khoản**. Route `GET` và đăng ký/đăng nhập **không** có ổ khoá; `POST`/`PATCH`/`DELETE` danh mục, hãng và `GET /auth/me` có ổ khoá.
2. Mở `POST /api/v1/categories` → mục **Responses** có 201, 400, 401, 403, 409 kèm mô tả.
3. Có tài khoản admin chưa? Nếu chưa: `POST /auth/register` ngay trên Swagger (body mẫu có sẵn, sửa email), rồi `npm run db:promote-admin` (Phần 7).
4. `POST /auth/login` → **Try it out** → **Execute** → copy giá trị `accessToken` (không lấy dấu `"`).
5. Bấm **Authorize** ở đầu trang → dán token → **Authorize** → **Close**. Ổ khoá chuyển sang khoá đóng.
6. `POST /api/v1/categories` → **Try it out** → **Execute**: 201, danh mục "Đồng hồ thông minh" được tạo.

`id` của danh mục mới có thể là 1002 chứ không phải 5. Không phải lỗi: SQL Server cấp sẵn một lô giá trị `IDENTITY` để chạy nhanh, khởi động lại container thì lô cũ bị bỏ, `id` nhảy cóc. `id` chỉ cần **khác nhau**, không cần liên tiếp.

Token được nhớ cả khi tải lại trang (`persistAuthorization` trong `src/swagger.ts`). Muốn thử với tư cách khách: **Authorize → Logout** rồi dán token của tài khoản `customer`: tạo danh mục phải ra 403.

## Kiểm tra

- [ ] Mọi route có mô tả và nằm đúng nhóm; ổ khoá đúng như Bước 7
- [ ] `GET /products` và `POST /auth/login` hiện đủ field kết quả (`ProductListResult`, `AuthResponse`)
- [ ] Schema `User` không còn `passwordHash`
- [ ] Đăng nhập, Authorize và tạo danh mục bằng tài khoản admin ngay trên Swagger
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. `GET /api/v1` và `GET /api/v1/health` vẫn trả `object` trống trong Swagger vì `ApiInfo`, `HealthStatus` là interface. Chuyển chúng thành class trong `src/app.dto.ts` để Swagger hiện đủ field.
2. Mở http://localhost:3000/api/docs-json: đây là file OpenAPI mà cả trang Swagger được dựng từ đó. Trong Postman: **Import** → dán URL này → có ngay một collection đủ mọi API.
