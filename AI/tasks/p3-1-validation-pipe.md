## Mục tiêu

Bật **ValidationPipe** cho toàn ứng dụng: từ giờ mọi dữ liệu client gửi lên đều được kiểm tra theo DTO (task tiếp theo) **trước khi** vào controller. Đồng thời gom cấu hình chung vào một hàm để test e2e chạy giống hệt `main.ts`.

**Làm task này trước** hai task "DTO và validation cho categories/brands", vì hai task đó cần thư viện và ValidationPipe ở đây. Sau khi merge, báo teammate `git pull` + `npm run setup`.

**Đọc trước:** giáo trình Bài 5 (DTO và kiểm tra dữ liệu đầu vào).

## Vì sao cần?

**Nguyên tắc vàng: không bao giờ tin dữ liệu người dùng gửi lên.** Họ có thể gửi thiếu trường, sai kiểu, chuỗi dài 1 triệu ký tự, hoặc gửi thêm trường lạ như `"role": "admin"`. Ở Phần 2 bạn đã thấy: `PATCH {"createdAt": "2000-01-01T00:00:00Z"}` sửa được ngày tạo ngay trong SQL Server, `"isActive": "abc"` lọt qua, còn `"logoUrl": 12345` thì làm API trả 500.

`ValidationPipe` đứng chặn ở cửa: request sai bị trả **400** ngay, service không phải viết thêm dòng kiểm tra nào.

## Bước 1: Cài thư viện

```powershell
cd server
npm install class-validator class-transformer @nestjs/mapped-types
```

| Thư viện | Dùng để |
|---|---|
| `class-validator` | Các decorator kiểm tra: `@IsString()`, `@MaxLength()`, `@IsEmail()`... |
| `class-transformer` | Đổi JSON thường thành object của class DTO (để validator đọc được decorator) |
| `@nestjs/mapped-types` | `PartialType()`: tạo DTO "sửa" từ DTO "tạo" (dùng ở task tiếp theo) |

## Bước 2: Hàm cấu hình dùng chung

Tạo file `src/app.setup.ts`:

```ts
import { ValidationPipe, type INestApplication } from '@nestjs/common';

// App-wide settings shared by main.ts and the e2e tests,
// so tests run the API exactly the way production does.
export function configureApp(app: INestApplication): void {
  // Every route is served under /api/v1, e.g. GET /api/v1/products
  app.setGlobalPrefix('api/v1');

  // Validate every request body / query against its DTO class
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that have no decorator in the DTO
      forbidNonWhitelisted: true, // ...and reject the request (400) when such properties are sent
      transform: true, // turn the plain JSON into an instance of the DTO class
    }),
  );
}
```

Giải thích 3 tuỳ chọn:
- `whitelist: true`: field nào **không có decorator** trong DTO thì bị bỏ đi. Đây là thứ chặn mass assignment.
- `forbidNonWhitelisted: true`: thay vì lặng lẽ bỏ, trả luôn **400** với thông báo `property role should not exist`. Client biết mình gửi sai.
- `transform: true`: biến JSON thành **object của class DTO**. Nhờ vậy trong controller, `dto` thật sự là `CreateCategoryDto`.

Vì sao tách ra hàm riêng? Test e2e tạo app bằng `Test.createTestingModule(...)` và **không** chạy `main.ts`. Nếu cấu hình nằm trong `main.ts`, test sẽ chạy một app khác với app thật: không có tiền tố `/api/v1`, không có validation. Gọi chung một hàm `configureApp` ở cả hai nơi thì không thể lệch nhau.

## Bước 3: Sửa `main.ts`

Thay toàn bộ `src/main.ts`:

```ts
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix and validation (shared with the e2e tests)
  configureApp(app);

  // Run shutdown hooks (e.g. close the SQL Server connection) on Ctrl+C or SIGTERM
  app.enableShutdownHooks();

  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`API is running at http://localhost:${port}/api/v1`, 'Bootstrap');
}
await bootstrap();
```

Dòng `app.setGlobalPrefix('api/v1')` cũ đã chuyển vào `configureApp`, nên xoá khỏi `main.ts`.

## Bước 4: Test e2e dùng cùng cấu hình

Thay toàn bộ `test/app.e2e-spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

// End-to-end test: boots the real app, so SQL Server must be running (npm run db:up)
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app); // same prefix and validation as main.ts
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1 returns the API info', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect((res) => {
        expect(res.body.name).toBe('TechStore API');
      });
  });

  it('GET /api/v1/health reports the database as up', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok', database: 'up' });
  });
});
```

Các URL trong test giờ có `/api/v1`, đúng như client thật gọi.

## Kiểm tra

- [ ] `npm run lint`, `npm test` và `npm run test:e2e` (cần `npm run db:up`) đều qua
- [ ] `npm run dev`: mọi API cũ vẫn chạy như trước
- [ ] Giải thích được ý nghĩa của `whitelist`, `forbidNonWhitelisted`, `transform`
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

Lúc này gửi `PATCH /api/v1/categories/<id>` với `{"createdAt": "1999-01-01T00:00:00Z"}` **vẫn** trả 200 và sửa được database. Đó là vì controller đang dùng `interface` (`CreateCategoryInput`): interface bị xoá khi biên dịch nên ValidationPipe không có gì để kiểm tra và cho qua hết. Hai task DTO tiếp theo thay interface bằng **class** có decorator thì ValidationPipe mới bắt đầu chặn.
