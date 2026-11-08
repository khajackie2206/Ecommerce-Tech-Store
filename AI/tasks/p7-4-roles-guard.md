## Mục tiêu

Sau task trước, **khách hàng nào đăng nhập cũng** thêm/sửa/xoá được danh mục và hãng. Task này giới hạn các thao tác đó cho **admin**:

| Ai gọi `POST/PATCH/DELETE /categories`, `/brands` | Kết quả |
|---|---|
| Chưa đăng nhập | **401** "Bạn cần đăng nhập" (AuthGuard) |
| Khách hàng (`role = customer`) | **403** "Bạn không có quyền thực hiện thao tác này" (RolesGuard) |
| Admin (`role = admin`) | Được phép |

Kèm theo: script SQL tạo tài khoản admin đầu tiên.

**Làm sau:** task "AuthGuard toàn cục, @Public và @CurrentUser".

**Đọc trước:** giáo trình Bài 9 (phân quyền theo vai trò).

## 401 khác 403 thế nào?

- **401 Unauthorized**: "Tôi không biết bạn là ai" → đăng nhập đi.
- **403 Forbidden**: "Tôi biết bạn là ai, nhưng bạn không được làm việc này" → đăng nhập lại cũng vô ích.

Frontend dựa vào mã này: 401 thì chuyển tới trang đăng nhập, 403 thì báo "không có quyền".

## Role lấy từ đâu?

Từ **token**: task "Đăng ký và đăng nhập" đã đưa `role` vào payload, và `AuthGuard` đặt payload vào `request.user`. `RolesGuard` chỉ cần so `request.user.role`, không truy vấn database. Khách không sửa role trong token được, vì sửa là sai chữ ký.

Hệ quả cần nhớ: đổi role trong database thì token **cũ** vẫn mang role cũ. Người được nâng quyền phải **đăng nhập lại** để nhận token mới.

## Bước 1: Decorator `@Roles()`

Tạo `src/auth/decorators/roles.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../users/user.entity.js';

export const ROLES_KEY = 'roles';

// @Roles('admin') - only users with one of these roles may call the route (else 403).
// Routes without @Roles() are open to any logged-in user.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

`...roles` (rest parameter) cho phép viết `@Roles('admin')` hoặc sau này `@Roles('admin', 'staff')`. Kiểu `UserRole[]` chặn lỗi gõ nhầm như `@Roles('admim')` ngay khi biên dịch.

## Bước 2: Guard

Tạo `src/auth/guards/roles.guard.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../users/user.entity.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { RequestWithUser } from '../jwt-payload.js';

// Runs right after AuthGuard (registered after it in AppModule),
// so request.user is already set for every non-public route.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    // No @Roles() on this route: nothing more to check
    if (!requiredRoles?.length) return true;

    // 401 = "who are you?" (AuthGuard), 403 = "I know who you are, but you may not"
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
    return true;
  }
}
```

- Route không có `@Roles()` → cho qua: `AuthGuard` đã lo việc "phải đăng nhập".
- `!user || ...`: phòng hờ trường hợp route vừa `@Public()` vừa `@Roles()` (không có `request.user`). Khi đó trả 403 chứ không để code bên dưới lỗi `Cannot read properties of undefined`.

## Bước 3: Đăng ký sau `AuthGuard`

Trong `src/app.module.ts`, thêm import:

```ts
import { RolesGuard } from './auth/guards/roles.guard.js';
```

và thêm **ngay sau** dòng `AuthGuard` trong `providers`:

```ts
    // Runs after AuthGuard (guards run in the order they are listed): checks @Roles()
    { provide: APP_GUARD, useClass: RolesGuard },
```

**Thứ tự quan trọng:** guard toàn cục chạy theo thứ tự khai báo. `RolesGuard` cần `request.user` do `AuthGuard` đặt vào, nên phải đứng sau. Đảo ngược thì khách chưa đăng nhập nhận 403 thay vì 401.

## Bước 4: Gắn `@Roles('admin')` cho các route ghi dữ liệu

Trong `src/categories/categories.controller.ts`: thêm import, và thêm `@Roles('admin')` **ngay trên** `@Post()`, `@Patch(':id')`, `@Delete(':id')`. File hoàn chỉnh:

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
import { CategoriesService } from './categories.service.js';
// Regular (not "import type") imports: ValidationPipe needs the DTO classes at runtime
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

// Every route here starts with /api/v1/categories (global prefix + 'categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // GET /api/v1/categories
  @Public()
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  // GET /api/v1/categories/1 - ParseIntPipe turns "1" into 1, or returns 400 for "abc"
  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.findOne(id);
  }

  // POST /api/v1/categories - responds 201 Created by default
  @Roles('admin')
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  // PATCH /api/v1/categories/1 - partial update
  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  // DELETE /api/v1/categories/1 - 204 No Content: success, empty body
  @Roles('admin')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    // Return the Promise so Nest waits for it and turns a thrown 404 into the response
    return this.categoriesService.remove(id);
  }
}
```

Làm y hệt cho `src/brands/brands.controller.ts`.

Vì sao không đặt `@Roles('admin')` một lần trên cả class? Vì khi đó các route `GET` (đang `@Public()`, không có `request.user`) cũng bị `RolesGuard` đòi quyền admin → khách xem danh mục nhận 403. Đặt trên từng method thì rõ ràng: nhìn method nào cũng biết ai gọi được.

`ProductsController` hiện chỉ có route `GET` nên chưa cần. Khi làm API quản trị sản phẩm (Phần 12), nhớ gắn `@Roles('admin')`.

## Bước 5: Tạo tài khoản admin đầu tiên

API không bao giờ cho đăng ký làm admin (DTO không có field `role`), nên admin đầu tiên được tạo bằng SQL.

Tạo `database/promote-admin.sql`:

```sql
-- =============================================================================
-- Promote a registered account to admin.
-- The API never lets anyone register as admin, so the first admin is made here.
--
-- 1. Register the account normally (POST /api/v1/auth/register)
-- 2. Change the email below to that account's email
-- 3. Run:  npm run db:promote-admin
--    (or open this file in VS Code and run it against TechStoreDb)
-- 4. Log in again: the old token still says "customer"
-- =============================================================================
SET NOCOUNT ON;

DECLARE @email NVARCHAR(255) = N'binh@mail.com';

UPDATE Users
SET role = 'admin', updatedAt = SYSUTCDATETIME()
WHERE email = LOWER(@email);

IF @@ROWCOUNT = 0
  PRINT N'No user with email ' + @email + N' - register it first.';
ELSE
  PRINT N'Done: ' + @email + N' is now an admin.';

-- Every admin account
SELECT email, fullName, role, updatedAt FROM Users WHERE role = 'admin';
```

Thêm script vào `package.json` **ở thư mục gốc** (cạnh `db:seed`):

```json
    "db:promote-admin": "docker compose exec sqlserver bash /database/run-sql.sh promote-admin.sql",
```

Thư mục `database/` được mount vào container (`./database:/database:ro` trong `docker-compose.yml`), nên file mới tạo dùng được ngay, không cần khởi động lại container.

Cách dùng: đăng ký tài khoản qua API như bình thường, sửa `@email` trong file thành email đó, rồi chạy `npm run db:promote-admin`.

Vì sao không đưa sẵn một admin vào `seed.sql`? Seed phải chứa sẵn mật khẩu (dù đã băm) của admin, ai đọc repo cũng biết. Mỗi người tự đăng ký rồi tự nâng quyền trên máy mình thì không có mật khẩu chung nào cả.

## Bước 6: Test

Tạo `src/auth/guards/roles.guard.spec.ts`:

```ts
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../users/user.entity.js';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  // Fake context: a request whose user (set by AuthGuard) has the given role
  function contextFor(role?: UserRole) {
    return {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    } as unknown as ExecutionContext;
  }

  // Pretend the route is decorated with @Roles(...roles)
  const routeRequires = (roles: UserRole[] | undefined) =>
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

  it('allows any logged-in user when the route has no @Roles()', () => {
    routeRequires(undefined);
    expect(guard.canActivate(contextFor('customer'))).toBe(true);
  });

  it('allows an admin on an @Roles("admin") route', () => {
    routeRequires(['admin']);
    expect(guard.canActivate(contextFor('admin'))).toBe(true);
  });

  it('returns 403 for a customer on an @Roles("admin") route', () => {
    routeRequires(['admin']);
    expect(() => guard.canActivate(contextFor('customer'))).toThrow(
      ForbiddenException,
    );
  });
});
```

`mockReturnValue` (không có `Once`): mọi lần gọi trong test đó đều trả giá trị giả. `routeRequires(...)` là hàm nhỏ giúp mỗi test đọc như một câu: "route yêu cầu admin".

Trong `test/app.e2e-spec.ts`, thêm test này **trước** test `rejects unknown fields with 400`:

```ts
  it('POST /api/v1/categories with a customer token returns 403', async () => {
    return request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', await bearer(app, 'customer'))
      .send({ name: 'Test', slug: 'test' })
      .expect(403);
  });
```

Các test e2e khác đã dùng `bearer(app, 'admin')` từ task trước nên không phải sửa.

## Bước 7: Gọi thử

Thêm vào `server/requests/auth.http` (cần request `login` của task trước đã chạy):

```http
### Customer token -> 403 Forbidden
DELETE {{baseUrl}}/categories/999
Authorization: Bearer {{login.response.body.$.accessToken}}
```

Rồi làm theo thứ tự:

1. Gửi request trên với tài khoản khách `binh@mail.com` → **403**.
2. Sửa email trong `promote-admin.sql` thành `binh@mail.com`, chạy `npm run db:promote-admin` → "Done: binh@mail.com is now an admin."
3. Gửi lại request trên (token cũ) → **vẫn 403**. Token cũ vẫn ghi `"role": "customer"`.
4. Gửi lại request `login` để lấy token mới, rồi gửi lại `DELETE` → **404** "Không tìm thấy danh mục id=999". Đã qua cả hai guard, chỉ là không có danh mục 999.

## Kiểm tra

- [ ] Không token → 401; token khách → 403; token admin → thao tác được
- [ ] `npm run db:promote-admin` nâng quyền được tài khoản vừa đăng ký
- [ ] `npm run lint`, `npm test` (thêm 3 test), `npm run test:e2e` đều qua
- [ ] Giải thích được: 401 khác 403; vì sao `RolesGuard` phải đăng ký sau `AuthGuard`; vì sao phải đăng nhập lại sau khi đổi role
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Đăng nhập bằng tài khoản khách, dán token vào https://jwt.io, sửa `"role": "customer"` thành `"admin"` trong ô Payload, copy token mới và gọi `DELETE /categories/999`: **401** chứ không phải 403. Vì sao? (chữ ký không còn khớp, `AuthGuard` chặn trước)
2. Tạm đảo thứ tự hai dòng `APP_GUARD` trong `app.module.ts`, gọi `POST /categories` **không** token: nhận gì, vì sao? Nhớ đảo lại.
