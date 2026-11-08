## Mục tiêu

Từ task này, **mọi API đều cần đăng nhập**, trừ những route được đánh dấu `@Public()`:

| Route | Ai gọi được |
|---|---|
| `GET /api/v1`, `GET /api/v1/health` | Ai cũng được (`@Public()`) |
| `POST /auth/register`, `POST /auth/login` | Ai cũng được (`@Public()`) |
| `GET` danh mục, hãng, sản phẩm | Ai cũng được (`@Public()`) |
| `POST/PATCH/DELETE` danh mục, hãng | Phải có token (task sau: phải là admin) |
| `GET /auth/me` (mới) | Phải có token |

Không có token hoặc token sai/hết hạn → **401**.

**Làm sau:** task "Đăng ký và đăng nhập bằng JWT".

**Đọc trước:** giáo trình Bài 9 (Guard).

## Guard là gì, chạy lúc nào?

Một request đi qua các lớp theo thứ tự:

```
Middleware → Guard → Interceptor (trước) → Pipe (validation) → Controller → Interceptor (sau) → Exception filter (nếu có lỗi)
```

**Guard** trả lời một câu hỏi: "request này có được vào không?". Trả `true` thì đi tiếp, ném exception thì dừng. Guard chạy **trước** validation, nên request chưa đăng nhập bị chặn ngay, chưa tốn công kiểm tra body.

Vì sao "mặc định khoá, mở từng route" (`@Public()`) thay vì "mặc định mở, khoá từng route"? Vì quên thêm decorator thì hậu quả nhẹ hơn hẳn: quên `@Public()` → khách thấy lỗi 401, phát hiện ngay. Quên khoá → lộ API quản trị mà không ai biết.

## Bước 1: Decorator `@Public()`

Tạo `src/auth/decorators/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Every route requires a login by default (AuthGuard is global).
// @Public() marks the exceptions: product pages, login, register...
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`SetMetadata(key, value)` gắn một "nhãn" vào method hoặc class. Bản thân nhãn không làm gì; guard sẽ đọc nó bằng `Reflector`.

## Bước 2: Kiểu cho request đã đăng nhập

Thay `src/auth/jwt-payload.ts` (thêm `RequestWithUser`):

```ts
import type { Request } from 'express';
import type { UserRole } from '../users/user.entity.js';

// What we put inside every access token (JWT).
// The token is signed, not encrypted: anyone can read it, so never put secrets here.
export interface JwtPayload {
  sub: string; // "subject" = the user id (standard JWT claim name)
  email: string;
  role: UserRole;
}

// An Express request after AuthGuard has verified the token
export interface RequestWithUser extends Request {
  user: JwtPayload;
}
```

Request của Express không có sẵn field `user`. `RequestWithUser` báo cho TypeScript biết: sau khi qua guard, `request.user` chứa payload của token.

## Bước 3: Guard

Tạo `src/auth/guards/auth.guard.ts`:

```ts
import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { JwtPayload, RequestWithUser } from '../jwt-payload.js';

// Runs before every route (registered with APP_GUARD in AppModule).
// true = let the request through, throwing 401 = stop it.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Look for @Public() on the method first, then on the controller class
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Bạn cần đăng nhập');

    try {
      // Checks the signature (made with JWT_SECRET) and the expiry date.
      // No database query: everything we need is inside the token.
      request.user = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException(
        'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
      );
    }
    return true;
  }

  // Header format: "Authorization: Bearer <token>"
  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

Giải thích:
- `getAllAndOverride(IS_PUBLIC_KEY, [handler, class])`: tìm nhãn trên **method** trước, không có thì tìm trên **class** controller.
- Header chuẩn là `Authorization: Bearer <token>`. `split(' ')` tách thành `['Bearer', '<token>']`.
- `verifyAsync` kiểm tra **chữ ký** (đúng `JWT_SECRET` không) và **hạn dùng** (`exp`). Sai một trong hai là ném lỗi, ta đổi thành 401 với thông báo tiếng Việt.
- Guard **không** truy vấn database: mọi thứ cần đã nằm trong token. Nhanh, nhưng có cái giá: tài khoản bị khoá **sau khi** đã đăng nhập vẫn dùng token cũ được tới khi hết hạn. Đó là lý do `JWT_EXPIRES_IN` không nên quá dài, và `GET /auth/me` bên dưới đọc lại database.

## Bước 4: Decorator `@CurrentUser()`

Tạo `src/auth/decorators/current-user.decorator.ts`:

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload, RequestWithUser } from '../jwt-payload.js';

// @CurrentUser() user: JwtPayload - the logged-in user that AuthGuard put on the request.
// Works like @Body() or @Param(), but reads request.user.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload =>
    ctx.switchToHttp().getRequest<RequestWithUser>().user,
);
```

Viết `me(@CurrentUser() user: JwtPayload)` gọn và dễ test hơn `me(@Req() req)` rồi tự đọc `req.user`.

## Bước 5: Đăng ký guard cho toàn app

Trong `src/app.module.ts`:

1. Thêm `APP_GUARD` vào import từ `@nestjs/core`:

   ```ts
   import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
   ```

2. Thêm import:

   ```ts
   import { AuthGuard } from './auth/guards/auth.guard.js';
   ```

3. Thêm vào cuối mảng `providers`:

   ```ts
       // App-wide guard: every route needs a valid token unless marked @Public()
       { provide: APP_GUARD, useClass: AuthGuard },
   ```

Chạy `npm run dev` và mở http://localhost:5173: trang web báo lỗi kết nối API! Vì `GET /health` cũng đã bị khoá. Bước tiếp theo sửa việc này.

## Bước 6: Mở các route công khai

Thêm `@Public()` **ngay trên** `@Get(...)` của:
- `src/app.controller.ts`: `getInfo`, `getHealth`
- `src/categories/categories.controller.ts`: `findAll`, `findOne`
- `src/brands/brands.controller.ts`: `findAll`, `findOne`
- `src/products/products.controller.ts`: `findAll`, `findBySlug`

và import ở đầu mỗi file (`app.controller.ts` dùng `./auth/...` thay cho `../auth/...`):

```ts
import { Public } from '../auth/decorators/public.decorator.js';
```

Ví dụ trong `categories.controller.ts`:

```ts
  // GET /api/v1/categories
  @Public()
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }
```

Đặt `@Public()` trên **từng method**, không đặt trên cả class `ProductsController`: sau này thêm route quản trị sản phẩm vào controller này thì nó không bị mở nhầm.

## Bước 7: `GET /auth/me`

Trong `src/auth/auth.service.ts`, thêm method này **sau** `login`:

```ts
  // Fresh data for GET /auth/me. The token may be hours old: the account could have
  // been locked or deleted since, so read the database instead of trusting the token.
  async getProfile(userId: string): Promise<User> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không còn hoạt động');
    }
    return user;
  }
```

Thay `src/auth/auth.controller.ts` (thêm `@Public()` cho register/login và route `me`):

```ts
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
// Regular (not "import type") imports: ValidationPipe needs the DTO classes at runtime
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { JwtPayload } from './jwt-payload.js';

// Routes under /api/v1/auth
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/v1/auth/register - 201 Created: a new user row exists
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // POST /api/v1/auth/login - 200 OK: nothing is created, we only check credentials
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // GET /api/v1/auth/me - not @Public(): AuthGuard requires "Authorization: Bearer <token>"
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }
}
```

Frontend sẽ gọi `/auth/me` mỗi khi mở trang để biết token còn dùng được không và hiện tên người dùng.

## Bước 8: Unit test cho guard

Tạo `src/auth/guards/auth.guard.spec.ts`:

```ts
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../jwt-payload.js';
import { AuthGuard } from './auth.guard.js';

describe('AuthGuard', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  const reflector = new Reflector();
  const guard = new AuthGuard(jwtService, reflector);

  // Fake ExecutionContext around a request with the given headers.
  // A real one also carries the route method and class; here they are dummies.
  function contextFor(headers: Record<string, string>) {
    const request: { headers: Record<string, string>; user?: JwtPayload } = {
      headers,
    };
    const context = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('rejects a request without a token', async () => {
    const { context } = contextFor({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'hacker' }).signAsync({
      sub: '1',
      email: 'x@mail.com',
      role: 'admin',
    });
    const { context } = contextFor({ authorization: `Bearer ${forged}` });
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
    );
  });

  it('accepts a valid token and puts the payload on request.user', async () => {
    const token = await jwtService.signAsync({
      sub: '1',
      email: 'an@mail.com',
      role: 'customer',
    });
    const { context, request } = contextFor({
      authorization: `Bearer ${token}`,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user?.email).toBe('an@mail.com');
  });

  it('lets @Public() routes through without a token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true);
    const { context } = contextFor({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
```

- Guard là class bình thường, nên tạo thẳng bằng `new AuthGuard(...)`, không cần `Test.createTestingModule`.
- Test thứ hai giả làm kẻ tấn công: tự ký token `role: 'admin'` bằng secret khác. Guard phải từ chối.
- `vi.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true)`: giả như route có `@Public()`.

## Bước 9: Sửa test e2e

Các test e2e đang gọi `POST`/`DELETE` không có token sẽ nhận 401 thay vì kết quả cũ. Ta cần một cách lấy token trong test.

Tạo `test/auth-helper.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from './../src/users/user.entity.js';

// Builds an "Authorization" header value for e2e tests, without registering a real user.
// AuthGuard only checks the token's signature, so a token signed by the app's own
// JwtService (same JWT_SECRET) is accepted.
export async function bearer(
  app: INestApplication,
  role: UserRole = 'customer',
): Promise<string> {
  const token = await app.get(JwtService).signAsync({
    sub: '00000000-0000-0000-0000-000000000000',
    email: `${role}@test.local`,
    role,
  });
  return `Bearer ${token}`;
}
```

(File không có đuôi `.e2e-spec.ts` nên Vitest không chạy nó như một bộ test.)

**`test/app.e2e-spec.ts`:** thêm import

```ts
import { bearer } from './auth-helper.js';
```

và thay test `rejects unknown fields with 400` bằng 2 test:

```ts
  it('POST /api/v1/categories without a token returns 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/categories')
      .send({ name: 'Test', slug: 'test' })
      .expect(401);
  });

  it('POST /api/v1/categories rejects unknown fields with 400', async () => {
    return request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', await bearer(app, 'admin'))
      .send({ name: 'Test', slug: 'test', role: 'admin' })
      .expect(400);
  });
```

**`test/products.e2e-spec.ts`:** thêm cùng dòng import, và trong test `DELETE a category that still has products...` đổi `() =>` thành `async () =>`, thêm `.set(...)` sau `.delete(...)`:

```ts
  it('DELETE a category that still has products returns 409, not 500', async () => {
    return request(app.getHttpServer())
      .delete('/api/v1/categories/1')
      .set('Authorization', await bearer(app, 'admin'))
      .expect(409)
```

(Truyền `'admin'` từ bây giờ để task phân quyền sau không phải sửa lại.)

**`test/auth.e2e-spec.ts`:** thay toàn bộ (test login giờ dùng token gọi `/auth/me`, thêm 2 test 401):

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { User } from './../src/users/user.entity.js';

// Register -> login flow against the real database (SQL Server must be running)
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const email = `auth-e2e-${Date.now()}@test.local`;
  const password = 'matkhau123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.get(DataSource).getRepository(User).delete({ email });
    await app.close();
  });

  it('POST /auth/register creates the account and never returns passwordHash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, fullName: 'Người Test' })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role).toBe('customer');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('POST /auth/register with the same email returns 409', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, fullName: 'Người Test' })
      .expect(409);
  });

  it('POST /auth/register validates the password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'x@test.local', password: 'abc', fullName: 'X' })
      .expect(400);

    expect(res.body.message).toContain('Mật khẩu tối thiểu 8 ký tự');
  });

  it('POST /auth/login returns a token that opens GET /auth/me', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(me.body.email).toBe(email);
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('GET /auth/me without a token returns 401', () => {
    return request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('GET /auth/me with a broken token returns 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer abc.def.ghi')
      .expect(401);
  });

  it('POST /auth/login with a wrong password returns 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'sai-mat-khau1' })
      .expect(401);
  });
});
```

## Bước 10: Gọi thử

Thêm vào `server/requests/auth.http`. Dòng `# @name login` đặt tên cho request, request sau đọc token từ kết quả của nó (tính năng của REST Client):

```http
### Login and remember the response as "login"
# @name login
POST {{baseUrl}}/auth/login
Content-Type: application/json

{ "email": "binh@mail.com", "password": "matkhau123" }

### Who am I? Uses the token from the "login" response
GET {{baseUrl}}/auth/me
Authorization: Bearer {{login.response.body.$.accessToken}}

### No token -> 401 "Bạn cần đăng nhập"
GET {{baseUrl}}/auth/me

### Products stay public -> 200
GET {{baseUrl}}/products?limit=2
```

Bấm "Send Request" ở request login trước, rồi mới tới `/auth/me`.

## Kiểm tra

- [ ] Trang web ở :5173 vẫn hiện "SQL Server: đã kết nối" (health là public)
- [ ] Xem sản phẩm không cần token; `POST /categories` không token → 401; `/auth/me` có token → 200
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Giải thích được: guard chạy trước validation; vì sao mặc định khoá; guard không đọc database thì được gì, mất gì
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Đặt `JWT_EXPIRES_IN=10`, khởi động lại, đăng nhập, đợi 15 giây rồi gọi `/auth/me`: 401 "Phiên đăng nhập không hợp lệ hoặc đã hết hạn". Trả về `86400`.
2. Đăng nhập lấy token, rồi khoá tài khoản bằng SQL: `UPDATE Users SET isActive = 0 WHERE email = 'binh@mail.com'`. `POST /categories` với token đó và body rỗng `{}` vẫn qua guard (nhận 400 lỗi validation chứ không phải 401), còn `/auth/me` trả 401. Giải thích vì sao. Nhớ mở khoá lại (`isActive = 1`).
