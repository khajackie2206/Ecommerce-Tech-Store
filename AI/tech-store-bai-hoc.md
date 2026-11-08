# TechStore: bài học dựng website bán điện thoại, laptop

Website thương mại điện tử bán điện thoại, laptop, tablet, phụ kiện (kiểu cửa hàng công nghệ như Thế Giới Di Động), làm bằng **NestJS + SQL Server + React**.
Lộ trình bám theo giáo trình **"NestJS cơ bản cho người mới bắt đầu (dùng SQL Server)"** (Bài 1–10, file [docs/nestjs-co-ban-sql-server.pdf](../docs/nestjs-co-ban-sql-server.pdf)), sau đó làm tiếp các tính năng của một cửa hàng thật. Nên đọc bài tương ứng trong giáo trình trước, rồi mới làm phần tương ứng ở đây.

- **Phần 1:** source đã được dựng sẵn. Bạn chạy thử và đọc hiểu từng file.
- **Từ Phần 2:** gõ lại code mẫu từng phần để học.

File này được cập nhật sau mỗi phần học. Làm xong phần nào thì đánh dấu `[x]` ở bảng tiến độ. Cách cài đặt và chạy cho cả team nằm ở [README.md](../README.md).

**Quy ước:** comment trong code và commit message viết bằng **tiếng Anh**. Phần giải thích trong file này viết bằng tiếng Việt. Chữ hiển thị trên giao diện viết bằng tiếng Việt.

## Tiến độ

| | Phần | Nội dung | Giáo trình NestJS |
|---|---|---|---|
| [ ] | **1** | Chạy source dựng sẵn, đọc hiểu: NestJS, SQL Server (Docker), React, proxy | Bài 1, 3, một phần Bài 7 |
| [ ] | 2 | Controller, service, module, dependency injection: module `categories`, `brands` (lưu tạm trong bộ nhớ) | Bài 3, 4 |
| [ ] | 3 | DTO và kiểm tra dữ liệu đầu vào (`ValidationPipe`, class-validator) | Bài 5 |
| [ ] | 4 | SQL Server cơ bản: đọc hiểu `database/schema.sql` và `seed.sql`, tự viết SELECT, JOIN, GROUP BY, JSON trên dữ liệu điện thoại/laptop | Bài 6 |
| [ ] | 5 | TypeORM: viết entity khớp với bảng có sẵn, repository, chuyển `categories`/`brands` sang đọc/ghi SQL Server | Bài 7 |
| [ ] | 6 | Sản phẩm và phiên bản (màu, dung lượng, giá, tồn kho): quan hệ bảng, lọc, tìm kiếm, sắp xếp, phân trang | Bài 8 |
| [ ] | 7 | Đăng ký, đăng nhập JWT, guard toàn cục, phân quyền admin/khách hàng | Bài 9 |
| [ ] | 8 | Swagger và unit test (Vitest) | Bài 10 |
| [ ] | 9 | React: layout cửa hàng, trang chủ, danh sách sản phẩm có bộ lọc, trang chi tiết | React |
| [ ] | 10 | React: đăng ký/đăng nhập, giỏ hàng | React |
| [ ] | 11 | Đặt hàng: transaction trừ tồn kho, lưu giá lúc mua, lịch sử đơn hàng | Nâng cao |
| [ ] | 12 | Trang quản trị: quản lý sản phẩm, upload ảnh, xử lý đơn hàng | Nâng cao |
| [ ] | 13 | Báo cáo doanh thu, sản phẩm bán chạy, dashboard biểu đồ | Nâng cao |
| [ ] | 14 | Migration thay cho `synchronize`, CI, triển khai | Nâng cao |

Mục lục: [Tổng quan](#tổng-quan) · [Phần 1](#phần-1-chạy-source-dựng-sẵn-và-đọc-hiểu) · [Phần 2 trở đi](#phần-2-trở-đi-học-theo-task-trên-github)

---

## Tổng quan

### Công nghệ

| Phần | Công nghệ | Ghi chú |
|---|---|---|
| Backend | **NestJS 12** (TypeScript) | Khung có quy định rõ: module, controller, service. Chạy trên Express |
| Database | **Microsoft SQL Server 2022** chạy bằng Docker | Truy cập qua **TypeORM** |
| Frontend | **React 19 + Vite + TypeScript** | |
| Giao diện | **Tailwind CSS** | Viết class ngay trong JSX |
| Gọi API | **TanStack Query** (từ Phần 9) | Tự lo cache, loading, tải lại dữ liệu |
| Test | **Vitest** (đi kèm NestJS 12) | |
| Đóng gói | **Docker Compose** | SQL Server luôn chạy bằng Docker; API + web chạy bằng Docker khi cần |

### Website sẽ có gì

**Khách hàng:**
- Trang chủ, danh mục (Điện thoại, Laptop, Tablet, Phụ kiện).
- Lọc sản phẩm theo hãng và khoảng giá, tìm kiếm, sắp xếp theo giá hoặc mới nhất.
- Trang chi tiết sản phẩm: chọn phiên bản (màu, dung lượng), xem giá và tình trạng còn hàng.
- Giỏ hàng, đặt hàng (thanh toán khi nhận hàng), xem lịch sử đơn.

**Quản trị (admin):**
- Quản lý danh mục, hãng, sản phẩm, phiên bản, ảnh.
- Xử lý đơn hàng: xác nhận → đang giao → hoàn thành / huỷ.
- Báo cáo doanh thu, sản phẩm bán chạy.

### Kiến trúc

Khi code hằng ngày (`npm run dev`):

```
Trình duyệt ──► http://localhost:5173  (Vite dev server, chạy React)
                   │
                   │  request bắt đầu bằng /api  → Vite chuyển tiếp (proxy)
                   ▼
                http://localhost:3000/api/v1  (NestJS) ──► SQL Server (Docker, cổng 1433)
```

Khi chạy toàn bộ bằng Docker (`npm run app:up`):

```
Trình duyệt ──► http://localhost:8080  (container web: nginx phục vụ React đã build)
                   │  /api → nginx chuyển tiếp
                   ▼
                container server (NestJS) ──► container sqlserver
```

### Database dự kiến (mỗi phần thêm dần)

```
Users           Id, Email, PasswordHash, FullName, Phone, Role (customer | admin)
Categories      Id, Name, Slug                       -- Điện thoại, Laptop, Tablet...
Brands          Id, Name, Slug, LogoUrl              -- Apple, Samsung, Xiaomi, Dell...
Products        Id, Name, Slug, CategoryId, BrandId, Description, Specs, ThumbnailUrl, IsActive
ProductVariants Id, ProductId, Sku, Color, Storage, Price, SalePrice, Stock
Orders          Id, UserId, Status, Total, ShippingName, ShippingPhone, ShippingAddress, CreatedAt
OrderItems      Id, OrderId, VariantId, ProductName, VariantName, Price, Quantity
```

Vài nguyên tắc sẽ gặp lại nhiều lần:
- **Tiền dùng `DECIMAL`, không dùng `FLOAT`.** Số thực bị sai số: trong JavaScript, `0.1 + 0.2` ra `0.30000000000000004`.
- **Một sản phẩm có nhiều phiên bản.** "iPhone 16 Pro" là sản phẩm, "iPhone 16 Pro 256GB Titan Đen" là một phiên bản. Giá và tồn kho nằm ở phiên bản.
- **Đơn hàng lưu lại tên và giá lúc mua** (`OrderItems.Price`). Sau này giá sản phẩm đổi thì đơn cũ vẫn đúng.

### Cấu trúc thư mục

```
tech-store/
  AI/tech-store-bai-hoc.md   # file bài học này
  README.md                  # cài đặt, chạy, quy ước làm việc nhóm
  docker-compose.yml         # SQL Server; profile "app" thêm API + web
  .env.example               # mẫu cấu hình, copy thành .env
  package.json               # lệnh chung: setup, dev, db:up, app:up...
  .gitignore, .gitattributes, .nvmrc
  server/                    # NestJS API
  web/                       # React app
```

### Chạy hằng ngày

Mở Docker Desktop trước, rồi:

```powershell
cd C:\NodeJS\tech-store
npm run db:up       # bật SQL Server
npm run dev         # chạy API + web, Ctrl+C để tắt
```

Mở http://localhost:5173.

---

## Phần 1: Chạy source dựng sẵn và đọc hiểu

**Mục tiêu:**
- Chạy được toàn bộ hệ thống ở máy mình.
- Hiểu từng file trong source làm gì, và một request đi qua những đâu.
- Biết cách làm việc chung với teammate qua GitHub.

Phần này ứng với **Bài 1** (cài đặt môi trường), **Bài 3** (dự án đầu tiên) và phần kết nối của **Bài 7** (TypeORM) trong giáo trình NestJS. Bạn chỉ cần đọc và thử, chưa phải gõ code. Phần 2 mới bắt đầu gõ.

### Bước 1: Chạy thử

Làm theo mục **2. Chạy ở máy local** trong [README.md](../README.md):

```powershell
cd C:\NodeJS\tech-store
copy .env.example .env      # bỏ qua nếu đã có .env
npm run setup
npm run db:up
npm run db:reset            # tạo bảng + nạp dữ liệu mẫu
npm run dev
```

Mở http://localhost:5173. Trang phải hiện:
- **API:** TechStore API v0.1.0, kèm giờ server.
- **SQL Server:** đã kết nối.

Trong terminal, log có tiền tố `[api]` (NestJS, màu xanh dương) và `[web]` (Vite, màu xanh lá). Lệnh `npm run dev` dùng thư viện `concurrently` để chạy hai chương trình trong cùng một terminal.

### Bước 2: Đọc hiểu backend NestJS (`server/`)

NestJS chia code thành 3 loại thành phần chính:

| Thành phần | Việc của nó | Ví dụ đời thường |
|---|---|---|
| **Controller** | Nhận request, gọi service, trả response | Nhân viên lễ tân nhận yêu cầu |
| **Service** | Xử lý nghiệp vụ, làm việc với dữ liệu | Đầu bếp nấu món |
| **Module** | Gom controller và service của một tính năng | Một gian bếp riêng |

#### `server/src/main.ts`: điểm khởi động

```ts
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Every route is served under /api/v1, e.g. GET /api/v1/products
  app.setGlobalPrefix('api/v1');

  // Run shutdown hooks (e.g. close the SQL Server connection) on Ctrl+C or SIGTERM
  app.enableShutdownHooks();

  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`API is running at http://localhost:${port}/api/v1`, 'Bootstrap');
}
await bootstrap();
```

- `NestFactory.create(AppModule)`: tạo ứng dụng từ module gốc. NestJS đọc `AppModule`, tìm mọi controller và service bên trong rồi tự nối chúng lại.
- `setGlobalPrefix('api/v1')`: thêm tiền tố cho **mọi** route. Chữ `v1` là phiên bản API. Sau này cần đổi API mà không làm hỏng app cũ thì làm thêm `v2` song song.
- `enableShutdownHooks()`: khi bấm `Ctrl+C`, hoặc khi Docker gửi tín hiệu `SIGTERM` để tắt container, NestJS đóng kết nối SQL Server cho gọn rồi mới thoát.
- `app.get(ConfigService)`: lấy service đọc cấu hình, rồi đọc biến `PORT` trong `.env`. Không có thì dùng 3000.
- `Logger.log(...)`: logger có sẵn của NestJS, in log cùng định dạng với log của framework. Nên dùng thay cho `console.log`.
- `await bootstrap()` nằm ở cấp ngoài cùng của file (**top-level await**). Cách viết này chỉ dùng được vì project là ES Module (`"type": "module"` trong `server/package.json`).
- `import ... from './app.module.js'`: dù file thật là `.ts`, vẫn phải ghi đuôi **`.js`**. Code được biên dịch ra `.js` rồi mới chạy, nên đường dẫn phải đúng với file sau khi biên dịch. Quên đuôi `.js` sẽ gặp lỗi `Cannot find module`.

#### `server/src/app.module.ts`: module gốc, đọc cấu hình và kết nối SQL Server

```ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mssql',
        host: config.getOrThrow<string>('DB_HOST'),
        port: Number(config.get('DB_PORT', 1433)),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_NAME'),
        options: {
          encrypt: true,
          trustServerCertificate: true,
        },
        autoLoadEntities: true,
        synchronize: config.get('DB_SYNCHRONIZE') === 'true',
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- `@Module({...})`: decorator mô tả module gồm những gì.
  - `imports`: các module khác mà module này cần dùng.
  - `controllers`: controller thuộc module.
  - `providers`: service thuộc module. NestJS sẽ tự tạo và tiêm chúng vào chỗ cần.
- `ConfigModule.forRoot(...)`: đọc file `.env` vào biến môi trường.
  - `isGlobal: true`: module nào cũng dùng được `ConfigService`, không phải import lại.
  - `envFilePath: ['.env', '../.env']`: tìm `.env` trong `server/` trước, không có thì tìm ở thư mục gốc. Cả team dùng chung **một** file `.env` ở gốc.
  - Khi API chạy trong Docker, không có file `.env` nào trong container. Biến môi trường do `docker-compose.yml` truyền vào, và `ConfigModule` đọc được cả hai nguồn.
- `TypeOrmModule.forRootAsync(...)`: tạo kết nối tới SQL Server. Dùng bản `Async` vì phải đợi `ConfigService` sẵn sàng mới đọc được cấu hình.
  - `inject: [ConfigService]`: yêu cầu NestJS đưa `ConfigService` vào hàm `useFactory`.
  - `getOrThrow`: thiếu biến trong `.env` thì báo lỗi **ngay khi khởi động**, thay vì chạy rồi lỗi khó hiểu về sau.
  - `type: 'mssql'`: dùng driver `mssql` để nói chuyện với SQL Server.
  - `trustServerCertificate: true`: SQL Server ở máy local dùng chứng chỉ tự ký. **Không** dùng tuỳ chọn này với server thật.
  - `autoLoadEntities: true`: tự nạp các entity (class mô tả bảng) mà module khai báo. Từ Phần 5 sẽ dùng.
  - `synchronize`: TypeORM tự tạo và sửa bảng cho khớp với entity mỗi lần khởi động. Rất tiện khi học, nhưng có thể **xoá cột và mất dữ liệu**. Vì vậy nó được điều khiển bằng biến `DB_SYNCHRONIZE` trong `.env`. Dự án này để **`false`**: bảng được tạo bằng file `database/schema.sql`, còn entity ở Phần 5 sẽ viết cho khớp với bảng có sẵn. Phần 14 sẽ thay file SQL bằng migration.

#### `server/src/app.service.ts`: service

```ts
@Injectable()
export class AppService {
  // DataSource is the TypeORM connection, provided by TypeOrmModule
  constructor(private readonly dataSource: DataSource) {}

  getInfo(): ApiInfo {
    return {
      name: 'TechStore API',
      version: '0.1.0',
      time: new Date().toISOString(), // always return UTC; the client converts to local time
    };
  }

  async checkHealth(): Promise<HealthStatus> {
    try {
      // The cheapest possible query: proves we can reach SQL Server and log in
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch {
      return { status: 'error', database: 'down' };
    }
  }
}
```

- `@Injectable()`: báo cho NestJS biết nó được phép **tự tạo** class này và **tiêm** (inject) vào chỗ khác cần dùng.
- `constructor(private readonly dataSource: DataSource) {}`: đây là **dependency injection**. Bạn không hề viết `new DataSource(...)`. NestJS thấy constructor cần một `DataSource`, liền đưa kết nối mà `TypeOrmModule` đã tạo vào. Phần 2 sẽ học kỹ cơ chế này.
- `private readonly`: vừa khai báo thuộc tính `this.dataSource`, vừa gán giá trị chỉ trong một dòng. `readonly` nghĩa là không gán lại được.
- `dataSource.query('SELECT 1')`: chạy một câu SQL tối thiểu để biết database còn sống. Từ Phần 5 sẽ dùng repository thay vì viết SQL tay.
- `toISOString()`: API luôn trả giờ UTC (`2026-11-06T14:58:08.721Z`), để frontend tự đổi sang giờ Việt Nam.
- `ApiInfo`, `HealthStatus` (khai báo ở đầu file) là `interface`, mô tả hình dạng dữ liệu trả về. TypeScript báo lỗi ngay khi gõ nếu trả thiếu field hoặc sai kiểu.

#### `server/src/app.controller.ts`: controller

```ts
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // GET /api/v1 - basic API information
  @Get()
  getInfo(): ApiInfo {
    return this.appService.getInfo();
  }

  // GET /api/v1/health - 200 when the database is reachable, 503 otherwise.
  @Get('health')
  async getHealth(): Promise<HealthStatus> {
    const health = await this.appService.checkHealth();
    if (health.status !== 'ok') throw new ServiceUnavailableException(health);
    return health;
  }
}
```

- `@Controller()` không có tham số nên dùng đường dẫn gốc. Cộng với tiền tố ở `main.ts`, ta có:
  - `@Get()` → **`GET /api/v1`**
  - `@Get('health')` → **`GET /api/v1/health`**
- Method trả về object thì NestJS tự đổi sang JSON, status mặc định là 200.
- `throw new ServiceUnavailableException(...)`: ném lỗi có sẵn của NestJS, tự trả mã **503**. Docker và load balancer dựa vào mã này để biết API chưa sẵn sàng. Các exception hay dùng khác: `NotFoundException` (404), `BadRequestException` (400), `UnauthorizedException` (401).
- Controller **không** tự chạy SQL mà gọi service. Đây là quy tắc chia việc của NestJS.

Mỗi lần khởi động, log của NestJS liệt kê các route nó tìm thấy:

```
Mapped {/api/v1, GET} route
Mapped {/api/v1/health, GET} route
```

Rất tiện để kiểm tra route của bạn đã được đăng ký chưa.

#### Test: `src/app.controller.spec.ts` và `test/app.e2e-spec.ts`

```powershell
npm test            # unit test: 3 passed, không cần SQL Server
npm run test:e2e    # e2e test: 2 passed, cần SQL Server đang chạy
```

- **Unit test** kiểm tra từng phần nhỏ. Test này thay `DataSource` thật bằng một **object giả**:

  ```ts
  const fakeDataSource = { query: vi.fn() };
  // ...
  providers: [AppService, { provide: DataSource, useValue: fakeDataSource }],
  ```

  Dòng `{ provide: DataSource, useValue: fakeDataSource }` nói với NestJS: "ai cần `DataSource` thì đưa object giả này". Nhờ dependency injection, test chạy được mà không cần SQL Server. Muốn giả lập database chết thì cho hàm giả ném lỗi: `fakeDataSource.query.mockRejectedValue(new Error(...))`.
- **E2E test** khởi động cả ứng dụng thật, rồi gọi HTTP vào bằng thư viện `supertest`. Test này **không** chạy `main.ts`, nên route ở đây là `/health` chứ không có tiền tố `/api/v1`.

### Bước 3: Đọc hiểu database và Docker

#### `.env`: một file cấu hình cho cả hệ thống

Xem bảng giải thích từng biến ở mục **4. Biến môi trường** trong README. Hai điểm cần nhớ:
- `DB_PASSWORD` vừa là mật khẩu API dùng để đăng nhập, vừa là mật khẩu `sa` khi tạo container SQL Server.
- `.env` nằm trong `.gitignore`, nên **không bao giờ** lên GitHub. Mỗi người tự tạo file này từ `.env.example`.

#### `docker-compose.yml`

```yaml
name: tech-store

services:
  sqlserver:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      ACCEPT_EULA: 'Y'
      MSSQL_PID: Developer
      MSSQL_SA_PASSWORD: ${DB_PASSWORD:?Missing .env - copy .env.example to .env first}
      DB_NAME: ${DB_NAME:-TechStoreDb}
    ports: ['1433:1433']
    volumes: ['sqlserver-data:/var/opt/mssql']
    healthcheck:
      test: /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$$MSSQL_SA_PASSWORD" -C -b -Q "IF DB_ID('$$DB_NAME') IS NULL CREATE DATABASE [$$DB_NAME]; SELECT 1"
      ...
```

- `name: tech-store`: đặt cố định tên project. Container sẽ tên `tech-store-sqlserver-1`, dù teammate clone repo về thư mục tên gì.
- `image`: SQL Server 2022 chính chủ của Microsoft.
  - `ACCEPT_EULA: 'Y'`: đồng ý điều khoản sử dụng.
  - `MSSQL_PID: Developer`: bản Developer miễn phí, đủ tính năng, chỉ dùng để học và phát triển.
- `${DB_PASSWORD:?...}`: Docker Compose tự đọc file `.env` nằm cạnh nó. Cú pháp `:?` nghĩa là thiếu biến thì **dừng và báo lỗi** kèm câu hướng dẫn. Cú pháp `:-TechStoreDb` nghĩa là thiếu biến thì dùng giá trị mặc định.
- `ports: ['1433:1433']`: cổng của máy bạn ← cổng trong container. Nhờ đó API chạy ở máy kết nối được tới `localhost:1433`.
- `volumes`: dữ liệu lưu trong volume `sqlserver-data`. Tắt hay xoá container cũng không mất dữ liệu. Chỉ `docker compose down -v` mới xoá.
- `healthcheck`: cứ 10 giây Docker chạy câu lệnh này trong container:
  - `IF DB_ID('TechStoreDb') IS NULL CREATE DATABASE [TechStoreDb]`: chưa có database thì tạo. Nhờ vậy teammate **không phải tạo database bằng tay**.
  - `SELECT 1`: chạy được thì container được đánh dấu `healthy`. Lệnh `npm run db:up` (tức `docker compose up -d --wait`) đợi tới lúc này mới kết thúc.
  - `$$` là ký tự `$` thật. Biến được đọc **bên trong** container, không phải do Docker Compose thay.
  - `-C`: tin chứng chỉ tự ký, chỉ dùng ở máy local. `-b`: câu SQL lỗi thì trả mã lỗi, để healthcheck biết mà báo `unhealthy`.

Phần `server` và `web` có `profiles: ['app']`, nghĩa là chúng **chỉ** chạy khi gọi với `--profile app` (lệnh `npm run app:up`). Bước 5 sẽ nói về phần này.

#### Kết nối SQL Server bằng VS Code

Cài extension **SQL Server (mssql)**. Mở tab **SQL Server** ở thanh bên trái → **Add Connection**:

| Thông tin | Giá trị |
|---|---|
| Server | `localhost` |
| Authentication | SQL Login |
| User | `sa` |
| Password | `TechStore@123` (giá trị `DB_PASSWORD` trong `.env`) |
| Trust server certificate | Bật (chỉ ở máy local) |

Mở một cửa sổ query mới, thử chạy:

```sql
SELECT name, create_date FROM sys.databases;   -- liệt kê database, phải có TechStoreDb
SELECT @@VERSION;                                -- phiên bản SQL Server
```

Sau khi chạy `npm run db:reset`, `TechStoreDb` có 8 bảng cùng dữ liệu mẫu: 25 sản phẩm, 46 phiên bản điện thoại/laptop/tablet/phụ kiện. Mở cây **Tables** để xem, hoặc chạy các câu trong [docs/sql/inspect-database.sql](../docs/sql/inspect-database.sql). Phần 4 sẽ đọc kỹ từng bảng trong `database/schema.sql` và tập viết truy vấn trên dữ liệu này.

### Bước 4: Đọc hiểu frontend React (`web/`)

#### `web/vite.config.ts`: proxy

```ts
server: {
  port: 5173,
  proxy: {
    '/api': 'http://localhost:3000',
  },
},
```

**Proxy là phần quan trọng nhất của frontend lúc này.**
- Không có proxy, web ở cổng `5173` gọi thẳng API ở cổng `3000`. Trình duyệt coi đó là hai "nguồn" (origin) khác nhau, nên bắt phải cấu hình **CORS**, và cookie đăng nhập (Phần 10) sẽ khó làm.
- Có proxy, React chỉ cần gọi `fetch('/api/v1')`. Request đi tới Vite trước, rồi Vite chuyển sang `localhost:3000`. Trình duyệt chỉ thấy một nguồn duy nhất.
- Khi chạy bằng Docker, nginx làm đúng việc này (xem `web/nginx.conf`).

#### `web/src/App.tsx`

```tsx
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  // fetch() does not throw on 4xx/5xx, so check the status ourselves
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

function App() {
  const [info, setInfo] = useState<ApiInfo | null>(null)
  const [dbUp, setDbUp] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getJson<ApiInfo>('/api/v1')
      .then(setInfo)
      .catch((err: Error) => setError(err.message))

    getJson<Health>('/api/v1/health')
      .then((health) => setDbUp(health.database === 'up'))
      .catch(() => setDbUp(false))
  }, [])
  // ...JSX
}
```

Giải thích (đây là những thứ cơ bản nhất của React):

1. **Component là một hàm trả về JSX.** JSX trông như HTML, nhưng `class` phải viết thành `className`.
2. **`useState` lưu dữ liệu có thể thay đổi** trong component. Mỗi lần gọi hàm `set...`, React vẽ lại component với giá trị mới. Bạn không cần tự sửa DOM như khi dùng jQuery.
   - `useState<boolean | null>(null)`: giá trị `null` nghĩa là "chưa biết", đang chờ API trả lời. `true`/`false` là đã có kết quả. Ba trạng thái này ứng với ba dòng hiển thị khác nhau.
3. **`useEffect(() => {...}, [])` dùng để chạy việc "bên ngoài"**, như gọi API, sau khi component đã hiển thị.
   - Mảng `[]` ở cuối nghĩa là chỉ chạy một lần.
   - Ở chế độ dev, React chạy effect **hai lần** (do `StrictMode` trong `main.tsx`) để giúp phát hiện lỗi sớm. Thấy request xuất hiện hai lần là bình thường.
4. **`getJson<T>` là hàm generic.** `T` là kiểu dữ liệu mong đợi. Gọi `getJson<ApiInfo>(...)` thì kết quả có kiểu `ApiInfo`.
   - `fetch` **không tự ném lỗi** khi status là 404 hay 500, nên phải tự kiểm tra `res.ok`.
5. **`.then(setInfo)`** là cách viết gọn của `.then((data) => setInfo(data))`.

### Bước 5: Chạy toàn bộ bằng Docker

```powershell
npm run db:down     # nếu đang chạy npm run dev, tắt nó trước (Ctrl+C)
npm run app:up      # lần đầu sẽ build image, mất vài phút
```

Mở http://localhost:8080. Trang giống hệt lúc chạy `npm run dev`, nhưng lần này cả 3 phần đều chạy trong container. Tắt bằng `npm run app:down`.

- **`server/Dockerfile`** build theo 3 giai đoạn (**multi-stage**):
  1. Cài toàn bộ thư viện.
  2. Biên dịch TypeScript ra `dist/`, rồi bỏ các thư viện chỉ dùng khi dev.
  3. Image cuối chỉ chứa `dist/` và thư viện production, chạy bằng user `node` thay vì `root` cho an toàn.
- **`web/Dockerfile`**: build React ra file tĩnh (HTML/CSS/JS), rồi dùng **nginx** để phục vụ các file đó.
- **`web/nginx.conf`**:
  - `location /api/`: chuyển request API sang container `server`. Trong Docker, các container gọi nhau bằng **tên service**, nên địa chỉ là `http://server:3000`.
  - `try_files ... /index.html`: đường dẫn lạ như `/dien-thoai/iphone-16` trả về `index.html`, để React Router (Phần 9) tự xử lý.
- Trong `docker-compose.yml`, service `server` đặt `DB_HOST: sqlserver`. Bên trong Docker, `localhost` là chính container đó, không phải máy bạn. Vì vậy API phải gọi SQL Server bằng tên service.
- `depends_on` với `condition: service_healthy`: container `web` đợi `server` healthy, `server` đợi `sqlserver` healthy, rồi mới chạy.

Chế độ này giống cách hệ thống chạy trên server thật. Khi code hằng ngày thì vẫn dùng `npm run dev`, để được tự reload khi sửa code.

### Bước 6: Thử làm hỏng để hiểu

- [ ] Đang chạy `npm run dev`, tắt SQL Server bằng `npm run db:down` rồi tải lại trang web. Dòng **SQL Server** chuyển sang "không kết nối được", và http://localhost:3000/api/v1/health trả **503**. Bật lại bằng `npm run db:up`.
- [ ] Mở DevTools (F12), tab **Network**, tải lại trang. Request đi tới `localhost:5173/api/v1`, không phải `:3000`. Đó chính là proxy.
- [ ] Gọi http://localhost:3000/api/v1/khong-co. NestJS tự trả 404 dạng JSON: `{"message":"Cannot GET /api/v1/khong-co","error":"Not Found","statusCode":404}`.
- [ ] Đổi tên file `.env` thành `.env.bak`, chạy `npm run db:up` để thấy thông báo `Missing .env`. Sau đó đổi tên lại.
- [ ] Trong `app.module.ts`, tạm đổi `'DB_NAME'` thành `'DB_NAMEX'` rồi lưu. API báo lỗi ngay khi khởi động, nhờ `getOrThrow`. Sau đó sửa lại.

### Bước 7: Đưa lên GitHub và học chung với teammate

#### Người tạo repo (làm một lần)

1. Vào https://github.com/new và tạo repo tên `tech-store`. **Không** tick "Add a README", ".gitignore" hay "license", vì repo ở máy đã có sẵn các file này. Repo trên GitHub phải trống thì lần push đầu mới không bị xung đột.
2. Commit và đẩy lên (thay `<tai-khoan>` bằng tên tài khoản GitHub):

```powershell
cd C:\NodeJS\tech-store
git add .
git status          # kiểm tra: KHÔNG được có node_modules, dist hay .env
git commit -m "Set up NestJS API, SQL Server (Docker) and React web"
git remote add origin https://github.com/<tai-khoan>/tech-store.git
git push -u origin main
```

- `git remote add origin ...`: đặt tên `origin` cho địa chỉ repo trên GitHub.
- `git push -u origin main`: đẩy nhánh `main` lên. Cờ `-u` ghi nhớ liên kết này, nên các lần sau chỉ cần `git push`.
- Lần đầu push, Windows sẽ mở cửa sổ đăng nhập GitHub (Git Credential Manager). Đăng nhập bằng trình duyệt là xong.
3. Vào **Settings → Collaborators** trên GitHub để mời teammate.

Lưu ý bảo mật khi repo để **public**:
- `.env` không lên GitHub. Luôn xem `git status` trước khi commit để chắc chắn.
- Mật khẩu `TechStore@123` có trong `.env.example`, nên **sẽ** lên GitHub. Không sao, vì nó chỉ dùng cho SQL Server chạy ở máy mỗi người. Tuyệt đối không dùng lại mật khẩu này ở server thật.

#### Teammate

Làm theo mục **2. Chạy ở máy local** trong README: clone, `copy .env.example .env`, `npm run setup`, `npm run db:up`, `npm run dev`.

#### Quy ước làm chung

- **Không code thẳng trên `main`.** Mỗi người làm trên nhánh riêng, ví dụ `git switch -c part-2-categories`. Push nhánh lên và tạo **Pull Request** để người kia review rồi mới merge vào `main`.
- Trước khi bắt đầu: `git switch main`, rồi `git pull`, rồi `npm run setup` nếu có thư viện mới.
- Trước khi tạo Pull Request: `npm run lint` và `npm test` phải qua.

### Bài tập nhỏ (tự làm, không bắt buộc)

1. Thêm route `GET /api/v1/ping` trả về `{ "pong": true }`. Gợi ý: thêm một method có `@Get('ping')` vào `AppController`. Xem log để thấy route mới được `Mapped`.
2. Viết thêm một unit test cho `getInfo()`: kiểm tra `time` là chuỗi ngày giờ hợp lệ. Gợi ý: `expect(Number.isNaN(Date.parse(info.time))).toBe(false)`.
3. Thêm nút **"Kiểm tra lại"** trên trang React, bấm vào thì gọi lại cả hai API:
   - Tách 2 lời gọi `getJson` trong `useEffect` ra thành hàm `load()`.
   - Gọi `load()` trong `useEffect` và trong `onClick` của nút.

---

## Phần 2 trở đi: học theo task trên GitHub

Từ Phần 2, mỗi phần được chia thành các **task** trên bảng Kanban **TechStore** (GitHub Projects). Mỗi task là một issue có hướng dẫn từng bước kèm code đã được chạy thử; nội dung giống hệt file tương ứng trong thư mục [`AI/tasks/`](tasks/README.md).

| Phần | Task (issue) | Hướng dẫn |
|---|---|---|
| 2 | #3 Module categories · #4 Module brands | [p2-1](tasks/p2-1-categories-module.md) · [p2-2](tasks/p2-2-brands-module.md) |
| 3 | #5 ValidationPipe (làm trước) · #6 DTO categories · #7 DTO brands | [p3-1](tasks/p3-1-validation-pipe.md) · [p3-2](tasks/p3-2-categories-dto.md) · [p3-3](tasks/p3-3-brands-dto.md) |
| 4 | #8 ERD · #9 Truy vấn báo cáo · #10 Truy vấn tồn kho | [p4-1](tasks/p4-1-erd.md) · [p4-2](tasks/p4-2-report-queries.md) · [p4-3](tasks/p4-3-inventory-queries.md) |
| 5 | #11 Entity Category · #12 Entity Brand | [p5-1](tasks/p5-1-category-entity.md) · [p5-2](tasks/p5-2-brand-entity.md) |
| 6 | #13 Entity Product · #14 API danh sách sản phẩm · #15 API chi tiết sản phẩm · #16 Filter lỗi SQL (song song với #13) | [p6-1](tasks/p6-1-product-entities.md) · [p6-2](tasks/p6-2-product-list-api.md) · [p6-3](tasks/p6-3-product-detail-api.md) · [p6-4](tasks/p6-4-sql-exception-filter.md) |
| 7 | #17 Entity User · #18 Đăng ký, đăng nhập JWT · #19 AuthGuard, @Public · #20 Phân quyền admin (làm theo thứ tự) | [p7-1](tasks/p7-1-user-entity.md) · [p7-2](tasks/p7-2-register-login.md) · [p7-3](tasks/p7-3-auth-guard.md) · [p7-4](tasks/p7-4-roles-guard.md) |
| 8–14 | #21 – #44 | Hướng dẫn chi tiết được bổ sung khi team học tới |

Luồng làm một task: nhận task (Assignees) → kéo sang **In progress** → tạo nhánh → làm theo hướng dẫn → Pull Request có `Closes #<số>` → teammate review → merge (thẻ tự sang **Done**).

Lưu ý khi pull code Phần 7 về: thêm `JWT_SECRET` và `JWT_EXPIRES_IN` vào `.env` của mình (xem `.env.example`), thiếu là API không khởi động.

<!-- Phần 8 sẽ được thêm vào đây khi học tới -->
