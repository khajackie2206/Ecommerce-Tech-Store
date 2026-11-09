## Mục tiêu

Hai API:
- `POST /api/v1/auth/register`: tạo tài khoản khách hàng, trả `{ accessToken, user }` (đăng ký xong là đăng nhập luôn).
- `POST /api/v1/auth/login`: kiểm tra email + mật khẩu, trả `{ accessToken, user }`.

| Tình huống | Kết quả |
|---|---|
| Đăng ký thành công | **201** + token |
| Email đã có tài khoản | **409** "Email đã được đăng ký" |
| Dữ liệu sai (email sai định dạng, mật khẩu yếu...) | **400** + danh sách lỗi tiếng Việt |
| Đăng nhập sai email **hoặc** sai mật khẩu | **401** "Email hoặc mật khẩu không đúng" (cùng một câu) |
| Tài khoản bị khoá (`isActive = 0`) | **401** "Tài khoản đã bị khoá" |

**Làm sau:** task "Entity User và UsersService".

**Đọc trước:** giáo trình Bài 9 (băm mật khẩu, JWT).

## Hai khái niệm cần nắm trước khi gõ

**1. Băm (hash) mật khẩu, không mã hoá.** Mã hoá thì giải ngược được nếu có khoá; băm thì **không** giải ngược được. Database chỉ lưu chuỗi băm. Lúc đăng nhập ta băm mật khẩu người dùng gõ rồi so với chuỗi đã lưu. Lỡ database bị lộ, kẻ tấn công cũng không có mật khẩu gốc.

Ta dùng **argon2** (cụ thể là argon2id): thuật toán được OWASP khuyên dùng đầu tiên, cố tình chậm và tốn RAM để dò mật khẩu hàng loạt rất tốn kém. Mỗi lần băm nó tự thêm **salt** ngẫu nhiên, nên hai người cùng mật khẩu `matkhau123` vẫn có hai chuỗi băm khác nhau. (Nếu bạn từng thấy `password_hash()` trong PHP: cùng ý tưởng.)

**2. JWT (JSON Web Token).** Sau khi đăng nhập, server đưa client một chuỗi dạng `xxxxx.yyyyy.zzzzz`:
- `xxxxx` (header) và `yyyyy` (payload) chỉ là JSON được **mã base64**, ai cũng đọc được. Dán token vào https://jwt.io để xem.
- `zzzzz` là **chữ ký**, tạo bằng `JWT_SECRET`. Sửa một ký tự trong payload (ví dụ đổi `customer` thành `admin`) là chữ ký không còn khớp, server từ chối.

Khác với session của PHP (server nhớ ai đang đăng nhập), JWT là **stateless**: server không lưu gì, mọi thông tin cần thiết nằm sẵn trong token. Client gửi token kèm mỗi request (task sau sẽ làm phần kiểm tra token).

## Bước 1: Cài thư viện

```powershell
cd server
npm install @nestjs/jwt argon2
```

`argon2` có phần lõi viết bằng C, nhưng gói đã kèm sẵn bản biên dịch cho Windows, macOS, Linux và cả Alpine (image Docker của ta), nên không cần cài thêm trình biên dịch.

## Bước 2: Biến môi trường

Thêm vào **cuối** `.env.example` (file được commit) và `.env` (file của bạn):

```dotenv
# --- Auth ---
# Secret used to sign login tokens (JWT). Anyone who knows it can forge tokens:
# use a long random value and never commit the real one.
JWT_SECRET=change-me-to-a-long-random-string
# How long a token stays valid, in seconds (86400 = 1 day)
JWT_EXPIRES_IN=86400
```

Trong `.env` của bạn, thay `JWT_SECRET` bằng chuỗi ngẫu nhiên:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

**Báo cho teammate trong Pull Request:** sau khi pull về, mỗi người phải tự thêm 2 dòng này vào `.env` của mình. Thiếu `JWT_SECRET` thì app **không khởi động** (vì ta dùng `getOrThrow`). Thà lỗi ngay lúc chạy còn hơn chạy với secret rỗng.

## Bước 3: Sinh khung

```powershell
npx nest g module auth
npx nest g controller auth
npx nest g service auth
```

## Bước 4: DTO

Tạo `src/auth/dto/register.dto.ts`:

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

// Body accepted by POST /api/v1/auth/register
export class RegisterDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255, { message: 'Email tối đa 255 ký tự' })
  email: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @MaxLength(100, { message: 'Mật khẩu tối đa 100 ký tự' })
  // (?=.*[A-Za-z]) = "somewhere there is a letter", (?=.*\d) = "somewhere there is a digit"
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Mật khẩu phải có cả chữ và số',
  })
  password: string;

  @IsString({ message: 'Họ tên phải là chuỗi' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
  fullName: string;

  // Vietnamese mobile number: 10 digits starting with 0, e.g. 0901234567
  @IsOptional()
  @Matches(/^0\d{9}$/, {
    message: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0',
  })
  phone?: string;
}
```

Tạo `src/auth/dto/login.dto.ts`:

```ts
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// Body accepted by POST /api/v1/auth/login.
// No password rules here: they belong to register. Login only checks "is it the right one".
export class LoginDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password: string;
}
```

- DTO đăng ký **không có** field `role`. Kết hợp với `forbidNonWhitelisted` (Phần 3), ai gửi `"role": "admin"` lên sẽ nhận 400 "property role should not exist". Không ai tự phong mình làm admin được.
- `(?=...)` trong regex là "lookahead": kiểm tra "ở đâu đó có..." mà không ăn ký tự. Hai lookahead = phải có ít nhất một chữ **và** một số.
- `LoginDto` không kiểm tra độ dài mật khẩu: nếu sau này đổi luật mật khẩu, người dùng cũ vẫn phải đăng nhập được.

## Bước 5: Payload của token

Tạo `src/auth/jwt-payload.ts`:

```ts
import type { UserRole } from '../users/user.entity.js';

// What we put inside every access token (JWT).
// The token is signed, not encrypted: anyone can read it, so never put secrets here.
export interface JwtPayload {
  sub: string; // "subject" = the user id (standard JWT claim name)
  email: string;
  role: UserRole;
}
```

Payload chỉ chứa thứ **cần dùng ở mọi request** (ai, quyền gì). Không bao giờ để mật khẩu, số điện thoại... vào đây: ai cầm token cũng đọc được.

## Bước 6: Service

Thay `src/auth/auth.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { JwtPayload } from './jwt-payload.js';

// What register and login send back to the client
export interface AuthResponse {
  accessToken: string;
  user: User; // passwordHash is removed by ClassSerializerInterceptor
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (await this.usersService.findByEmail(dto.email)) {
      throw new ConflictException('Email đã được đăng ký');
    }

    // argon2 adds a random salt and is slow on purpose, so leaked hashes are hard to crack.
    // The result looks like "$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>".
    const passwordHash = await argon2.hash(dto.password);

    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      phone: dto.phone,
    });
    // Log the new customer in right away
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    // Same message for "no such email" and "wrong password":
    // a different message would tell attackers which emails have an account.
    const passwordOk =
      user !== null && (await argon2.verify(user.passwordHash, dto.password));
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khoá');
    }

    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    // Signed with JWT_SECRET; expires after JWT_EXPIRES_IN (configured in AuthModule)
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken, user };
  }
}
```

Giải thích:
- `import * as argon2 from 'argon2'`: lấy toàn bộ hàm của thư viện vào một object `argon2` (`argon2.hash`, `argon2.verify`).
- `argon2.verify(hash, password)`: băm `password` với **cùng salt** đọc ra từ `hash` rồi so sánh. Không có hàm "giải băm".
- Cùng một thông báo cho "không có email này" và "sai mật khẩu". Nếu thông báo khác nhau, kẻ xấu thử hàng loạt email là biết email nào đã đăng ký ở cửa hàng.
- Kiểm tra `isActive` **sau** khi mật khẩu đúng: chỉ chủ tài khoản mới biết tài khoản bị khoá.
- `buildAuthResponse` để `private` và dùng chung cho đăng ký lẫn đăng nhập.

## Bước 7: Controller và module

Thay `src/auth/auth.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
// Regular (not "import type") imports: ValidationPipe needs the DTO classes at runtime
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

// Routes under /api/v1/auth
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/v1/auth/register - 201 Created: a new user row exists
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // POST /api/v1/auth/login - 200 OK: nothing is created, we only check credentials
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

`@HttpCode(200)` cho login: NestJS mặc định trả **201 Created** cho mọi `@Post()`, nhưng đăng nhập không tạo ra gì mới.

Thay `src/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    UsersModule, // gives us UsersService (exported by UsersModule)

    // JwtService, configured from .env. global: true lets the auth guard
    // (next task) inject JwtService from any module without importing JwtModule again.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // Token lifetime in seconds (86400 = 1 day). After that the client must log in again.
          expiresIn: Number(config.get('JWT_EXPIRES_IN', 86400)),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
```

- `JwtModule.registerAsync` + `useFactory`: giống `TypeOrmModule.forRootAsync` trong `app.module.ts` (Phần 1), cấu hình được đọc từ `ConfigService` sau khi `.env` đã nạp.
- `global: true`: `JwtService` dùng được ở mọi module mà không phải import `JwtModule` lại. Task sau, `AuthGuard` sẽ cần nó.
- `Number(...)`: biến môi trường luôn là chuỗi; `expiresIn` dạng số được hiểu là **giây**.

## Bước 8: Test

Thay `src/auth/auth.service.spec.ts`:

```ts
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  const jwtService = new JwtService({ secret: 'test-secret' }); // a real one, test key
  // Fake UsersService: no database in unit tests
  const usersService = { findByEmail: vi.fn(), create: vi.fn() };

  // Builds a User like the one TypeORM would return
  const makeUser = (data: Partial<User>) =>
    Object.assign(new User(), {
      id: 'A1B2C3D4-0000-0000-0000-000000000001',
      email: 'an@mail.com',
      fullName: 'Nguyễn An',
      role: 'customer',
      isActive: true,
      ...data,
    });

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('stores an argon2 hash, never the plain password', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockImplementation((data: Partial<User>) =>
        Promise.resolve(makeUser(data)),
      );

      await service.register({
        email: 'an@mail.com',
        password: 'matkhau123',
        fullName: 'Nguyễn An',
      });

      const saved = usersService.create.mock.calls[0]?.[0];
      expect(saved.passwordHash).not.toBe('matkhau123');
      expect(saved.passwordHash.startsWith('$argon2')).toBe(true);
      expect(await argon2.verify(saved.passwordHash, 'matkhau123')).toBe(true);
    });

    it('throws 409 when the email is taken', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser({}));
      await expect(
        service.register({
          email: 'an@mail.com',
          password: 'matkhau123',
          fullName: 'Nguyễn An',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns a token whose payload holds id, email and role', async () => {
      const passwordHash = await argon2.hash('matkhau123');
      usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash }));

      const result = await service.login({
        email: 'an@mail.com',
        password: 'matkhau123',
      });

      const payload = await jwtService.verifyAsync(result.accessToken);
      expect(payload).toMatchObject({
        sub: 'A1B2C3D4-0000-0000-0000-000000000001',
        email: 'an@mail.com',
        role: 'customer',
      });
    });

    it('gives the same 401 message for a wrong password and an unknown email', async () => {
      const passwordHash = await argon2.hash('matkhau123');
      usersService.findByEmail.mockResolvedValueOnce(
        makeUser({ passwordHash }),
      );
      const wrongPassword = service.login({
        email: 'an@mail.com',
        password: 'sai-mat-khau1',
      });
      await expect(wrongPassword).rejects.toThrow(UnauthorizedException);
      await expect(wrongPassword).rejects.toThrow(
        'Email hoặc mật khẩu không đúng',
      );

      usersService.findByEmail.mockResolvedValueOnce(null);
      await expect(
        service.login({ email: 'ai@mail.com', password: 'matkhau123' }),
      ).rejects.toThrow('Email hoặc mật khẩu không đúng');
    });

    it('rejects a locked account even with the right password', async () => {
      const passwordHash = await argon2.hash('matkhau123');
      usersService.findByEmail.mockResolvedValue(
        makeUser({ passwordHash, isActive: false }),
      );
      await expect(
        service.login({ email: 'an@mail.com', password: 'matkhau123' }),
      ).rejects.toThrow('Tài khoản đã bị khoá');
    });
  });
});
```

- Dùng `JwtService` **thật** với secret test, vì muốn kiểm tra token sinh ra giải mã được và chứa đúng payload. `UsersService` thì giả (không có database trong unit test).
- `usersService.create.mock.calls[0]?.[0]`: lấy tham số của lần gọi `create` đầu tiên, để kiểm tra cái **sắp được lưu** là chuỗi băm chứ không phải mật khẩu gốc.
- `mockResolvedValueOnce`: giá trị giả chỉ dùng cho **một** lần gọi, lần sau dùng giá trị khác. Nhờ vậy một test kiểm tra được cả hai trường hợp.

Thay `src/auth/auth.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  // Fake AuthService: the controller only passes the body through
  const authService = { register: vi.fn(), login: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get(AuthController);
  });

  it('login passes the body to AuthService.login', async () => {
    authService.login.mockResolvedValue({ accessToken: 'token' });
    const dto = { email: 'an@mail.com', password: 'matkhau123' };

    await expect(controller.login(dto)).resolves.toEqual({
      accessToken: 'token',
    });
    expect(authService.login).toHaveBeenCalledWith(dto);
  });
});
```

Tạo `test/auth.e2e-spec.ts`:

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

  it('POST /auth/login returns 200 with a token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('POST /auth/login with a wrong password returns 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'sai-mat-khau1' })
      .expect(401);
  });
});
```

Test "never returns passwordHash" chạy qua **toàn bộ** app thật, nên nó cũng kiểm tra luôn `ClassSerializerInterceptor` của task trước đã được đăng ký.

## Bước 9: Gọi thử

Tạo `server/requests/auth.http`:

```http
@baseUrl = http://localhost:3000/api/v1

### Register -> 201 with accessToken and user (no passwordHash)
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "email": "binh@mail.com",
  "password": "matkhau123",
  "fullName": "Trần Thị Bình"
}

### Same email again -> 409
POST {{baseUrl}}/auth/register
Content-Type: application/json

{ "email": "BINH@mail.com", "password": "matkhau123", "fullName": "Bình 2" }

### Invalid data + trying to become admin -> 400 with every error
POST {{baseUrl}}/auth/register
Content-Type: application/json

{ "email": "bad", "password": "abcdefgh", "fullName": "", "phone": "123", "role": "admin" }

### Login -> 200 with accessToken
POST {{baseUrl}}/auth/login
Content-Type: application/json

{ "email": "binh@mail.com", "password": "matkhau123" }

### Wrong password -> 401, same message as an unknown email
POST {{baseUrl}}/auth/login
Content-Type: application/json

{ "email": "binh@mail.com", "password": "sai-mat-khau1" }
```

Kết quả request thứ ba:

```json
{
  "message": [
    "property role should not exist",
    "Email không hợp lệ",
    "Mật khẩu phải có cả chữ và số",
    "Họ tên không được để trống",
    "Số điện thoại phải gồm 10 số, bắt đầu bằng 0"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

Mở bảng `Users` trong VS Code: cột `passwordHash` dạng `$argon2id$v=19$m=65536,t=3,p=4$...`, `email` là chữ thường dù request thứ hai gửi chữ hoa.

## Kiểm tra

- [ ] Đăng ký, đăng nhập nhận được token; dán token vào jwt.io thấy `sub`, `email`, `role`, `iat`, `exp`
- [ ] Response không có `passwordHash`; database chỉ lưu chuỗi băm
- [ ] `.env.example` có `JWT_SECRET`, `JWT_EXPIRES_IN`; PR có ghi chú nhắc teammate cập nhật `.env`
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Đăng ký hai tài khoản cùng mật khẩu `matkhau123`, so sánh hai `passwordHash` trong database: khác nhau hoàn toàn. Vì sao? (salt)
2. Đổi `JWT_EXPIRES_IN=10`, khởi động lại, đăng nhập rồi dán token vào jwt.io: `exp - iat = 10`. Task sau bạn sẽ thấy token hết hạn bị từ chối. Nhớ trả về `86400`.
