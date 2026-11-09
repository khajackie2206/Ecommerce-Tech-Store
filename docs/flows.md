# TechStore: các flow business và develop

Tài liệu tổng hợp các luồng hoạt động của API `users` và các bước phát triển đang dùng trong project.

---

## Phần 1. Flow business

### 1.1. Tạo user: `POST /users`

```
Client gửi: POST http://localhost:3000/users
Body: { email, password, fullName, phone? }
  │
  ▼
① ValidationPipe kiểm tra body theo CreateUserDto
  │   ├─ Có field lạ (ví dụ "role")  → 400 "property role should not exist"
  │   ├─ Sai định dạng / thiếu field → 400 + danh sách tất cả lỗi
  │   └─ Hợp lệ → đi tiếp
  ▼
② UsersController.create(dto) → usersService.createAccount(dto)
  ▼
③ UsersService.createAccount
  │   ├─ findByEmail(email): email đã có? → 409 "Email đã được đăng ký"
  │   ├─ argon2.hash(password) → passwordHash
  │   └─ create({ email, passwordHash, fullName, phone })
  │        └─ email được trim + chuyển về chữ thường
  ▼
④ Repository<User>.save() → INSERT INTO Users ...
  ▼
⑤ SQL Server lưu dòng mới, tự điền: id, role = 'customer', isActive = 1, createdAt, updatedAt
  ▼
⑥ ClassSerializerInterceptor bỏ passwordHash (@Exclude)
  ▼
Client nhận: 201 Created + JSON user (không có passwordHash)
```

Luật kiểm tra của body (`CreateUserDto`):

| Field | Bắt buộc | Luật |
|---|---|---|
| `email` | Có | Đúng định dạng email, tối đa 255 ký tự |
| `password` | Có | Chuỗi, 8–100 ký tự, có cả chữ và số |
| `fullName` | Có | Chuỗi, không rỗng, tối đa 100 ký tự |
| `phone` | Không | Nếu gửi: 10 số, bắt đầu bằng 0 |

Kết quả trả về:

| Trường hợp | Mã |
|---|---|
| Tạo thành công | 201 |
| Dữ liệu sai hình dạng | 400 |
| Email đã tồn tại (không phân biệt hoa/thường) | 409 |

### 1.2. Lấy danh sách user: `GET /users`

```
Client gửi: GET http://localhost:3000/users
  ▼
① UsersController.getAll() → usersService.findAll()
  ▼
② Repository<User>.find({ order: { createdAt: 'DESC' } })
   → SELECT * FROM Users ORDER BY createdAt DESC
  ▼
③ TypeORM chuyển mỗi dòng thành object của class User
  ▼
④ ClassSerializerInterceptor duyệt từng phần tử, bỏ passwordHash
  ▼
Client nhận: 200 OK + mảng user (mới nhất trước, không có passwordHash)
```

### 1.3. Kiểm tra trạng thái API: `GET /health`

```
Client gửi: GET http://localhost:3000/health
  ▼
AppController.getHealth() → appService.checkHealth()
  ├─ Kết nối được SQL Server   → 200 { "status": "ok", "database": "up" }
  └─ Không kết nối được        → 503
```

---

## Phần 2. Flow develop

### 2.1. Vòng đời một request trong NestJS

```
Request
  ▼
main.ts + app.setup.ts      Khởi động app, bật ValidationPipe, bật Swagger (/docs)
  ▼
app.module.ts               Đọc .env, mở kết nối SQL Server, nạp các module tính năng,
                            đăng ký ClassSerializerInterceptor cho toàn app
  ▼
Router                      @Controller('users') + @Post() / @Get() → chọn method
  ▼
ValidationPipe              Kiểm tra body theo DTO (sai → 400)
  ▼
Controller                  Nhận dữ liệu, gọi service
  ▼
Service                     Logic nghiệp vụ, throw exception khi lỗi (409, 404...)
  ▼
Repository (TypeORM)        Chuyển lời gọi hàm thành câu SQL
  ▼
SQL Server                  Thực thi, trả kết quả
  ▼ (đi ngược lên)
ClassSerializerInterceptor  Bỏ các field @Exclude()
  ▼
Response JSON
```

Vai trò từng file trong module `users`:

| File | Vai trò |
|---|---|
| [users.module.ts](../server/src/users/users.module.ts) | Gói tính năng: khai báo controller, service, `forFeature([User])`, export service |
| [users.controller.ts](../server/src/users/users.controller.ts) | Nhận HTTP request, định tuyến URL, gọi service |
| [users.service.ts](../server/src/users/users.service.ts) | Logic nghiệp vụ, làm việc với `Repository<User>` |
| [user.entity.ts](../server/src/users/user.entity.ts) | Mô tả bảng `Users` bằng class |
| [dto/create-user.dto.ts](../server/src/users/dto/create-user.dto.ts) | Mô tả và kiểm tra dữ liệu client gửi lên |

### 2.2. Flow validate dữ liệu đầu vào

```
Body JSON
  ▼
class-transformer   Đổi JSON thường thành object CreateUserDto (transform: true)
  ▼
whitelist           Field không có decorator → bị coi là field lạ
  ▼
forbidNonWhitelisted  Có field lạ → 400 "property X should not exist"
  ▼
class-validator     Đọc decorator của từng field, chạy tất cả luật,
                    gom toàn bộ lỗi (không dừng ở lỗi đầu tiên)
  │   └─ @IsOptional(): field không gửi → bỏ qua mọi luật khác của field đó
  ▼
Có lỗi → 400 + mảng message      Không lỗi → dto vào controller
```

Các lớp kiểm tra dữ liệu theo thứ tự:

| Lớp | Nơi | Kiểm tra | Mã lỗi |
|---|---|---|---|
| 1 | Frontend (form React) | Báo lỗi khi người dùng nhập | - |
| 2 | DTO + ValidationPipe | Hình dạng dữ liệu: kiểu, độ dài, định dạng, field lạ | 400 |
| 3 | Service | Luật nghiệp vụ cần hỏi database (email trùng) | 409 |
| 4 | Database (`schema.sql`) | Constraint: `UQ_Users_email`, `CK_Users_role`, `NOT NULL` | - |

### 2.3. Flow ẩn field nhạy cảm khỏi response

```
Lúc khởi động:
  @Exclude() trên User.passwordHash  → ghi metadata "bỏ field này khi chuyển thành JSON"
  @ApiHideProperty()                 → ẩn field khỏi tài liệu Swagger
  APP_INTERCEPTOR: ClassSerializerInterceptor → áp dụng cho mọi route

Mỗi request:
  Service trả về User (hoặc User[]), vẫn còn passwordHash
    ▼
  ClassSerializerInterceptor chờ Promise xong
    ▼
  instanceToPlain(result): đọc metadata của class User, bỏ passwordHash
    ▼
  NestJS gửi JSON không có passwordHash
```

### 2.4. Thứ tự viết code cho một tính năng mới

**Bảng → Entity → Module → DTO → Service → Controller → Test**

| # | Bước | Việc làm |
|---|---|---|
| 0 | Đọc `database/schema.sql` | Xem bảng có những cột nào, kiểu gì, constraint gì |
| 1 | Sinh khung bằng CLI | `npx nest g module <tên>`, `npx nest g controller <tên>`, `npx nest g service <tên>` (chạy trong `server/`) |
| 2 | Entity | `<tên-số-ít>.entity.ts`: `@Entity('<Bảng>')`, mỗi cột một `@Column` khớp với `schema.sql` |
| 3 | Module | Thêm `imports: [TypeOrmModule.forFeature([Entity])]`, `exports` service nếu module khác cần dùng |
| 4 | DTO | `dto/create-<tên>.dto.ts`, `dto/update-<tên>.dto.ts`: chỉ các field client được gửi, mỗi field có decorator của `class-validator` |
| 5 | Service | Inject `Repository<Entity>`, viết `findAll`, `findOne`, `create`, `update`, `remove`; throw exception khi lỗi |
| 6 | Controller | `@ApiTags('<tên>')`, `@Controller('<tên>')`, các method `@Get()`, `@Post()`, `@Patch(':id')`, `@Delete(':id')` chỉ gọi service |
| 7 | Test | Sửa `*.spec.ts` (repository/service giả bằng `vi.fn()`), chạy `npm test`, gọi thử trên Swagger |

Kết quả sau bước 1 (ví dụ `brands`):

```
server/src/
  app.module.ts            ← CLI tự thêm BrandsModule vào imports
  brands/
    brands.module.ts       ← CLI tự khai báo controller + service
    brands.controller.ts
    brands.controller.spec.ts
    brands.service.ts
    brands.service.spec.ts
```

Các lệnh CLI:

| Lệnh | Tạo ra |
|---|---|
| `npx nest g module <tên>` | `<tên>/<tên>.module.ts`, tự import vào `app.module.ts` |
| `npx nest g controller <tên>` | Controller + spec, tự gắn vào module |
| `npx nest g service <tên>` | Service + spec, tự gắn vào module |
| `npx nest g resource <tên>` | Cả bộ: module, controller, service, DTO, entity (chọn REST API) |
| Thêm `--dry-run` | Chỉ in ra file sẽ tạo, không ghi |
| Thêm `--no-spec` | Không tạo file test |
| Thêm `--flat` | Không tạo thư mục con |

Mỗi thư mục là một tính năng; các bảng luôn đi cùng nhau nằm chung một module:

| Module | Bảng |
|---|---|
| `categories/` | `Categories` |
| `brands/` | `Brands` |
| `products/` | `Products`, `ProductVariants`, `ProductImages` |
| `users/` | `Users` |
| `orders/` | `Orders`, `OrderItems` |

### 2.5. Flow kết nối database

```
app.module.ts
  TypeOrmModule.forRootAsync(...)    1 lần cho cả app: 1 kết nối dùng chung, đọc DB_* từ .env
  autoLoadEntities: true             entity khai báo ở forFeature được tự đăng ký

<tính năng>.module.ts
  TypeOrmModule.forFeature([Entity]) mỗi module: tạo Repository<Entity>

<tính năng>.service.ts
  @InjectRepository(Entity) repo     dùng repo.find / findOneBy / create / save ...
```

### 2.6. Flow setup môi trường local (SQL Server cài trên máy, không dùng Docker)

```
1. SQL Server Configuration Manager
   → Protocols for MSSQLSERVER → TCP/IP: Enable
   → IPAll: TCP Dynamic Ports = (trống), TCP Port = 1433

2. Bật đăng nhập user/password + tạo database và login (Windows Authentication):
   sqlcmd -S localhost -E -C -Q "EXEC xp_instance_regwrite N'HKEY_LOCAL_MACHINE', N'Software\Microsoft\MSSQLServer\MSSQLServer', N'LoginMode', REG_DWORD, 2; CREATE DATABASE TechStoreDb; CREATE LOGIN techstore WITH PASSWORD = '<mật khẩu>', CHECK_POLICY = OFF; USE TechStoreDb; CREATE USER techstore FOR LOGIN techstore; ALTER ROLE db_owner ADD MEMBER techstore;"

3. Restart service (PowerShell quyền Administrator):
   Restart-Service MSSQLSERVER -Force

4. Tạo .env ở thư mục gốc repo:
   DB_HOST=localhost
   DB_PORT=1433
   DB_USERNAME=techstore
   DB_PASSWORD=<mật khẩu ở bước 2>
   DB_NAME=TechStoreDb

5. Tạo bảng + dữ liệu mẫu:
   sqlcmd -S localhost -E -C -b -f 65001 -d TechStoreDb -i database\schema.sql
   sqlcmd -S localhost -E -C -b -f 65001 -d TechStoreDb -i database\seed.sql

6. Cài thư viện (thư mục gốc):
   npm run setup

7. Chạy app (thư mục gốc):
   npm run dev
```

Các cổng:

| Cổng | Dùng cho |
|---|---|
| `1433` | SQL Server (API, SSMS, VS Code SQL extension kết nối vào) |
| `3000` | API NestJS: `http://localhost:3000/users`, `/health`, `/docs` |
| `5173` | Web React (Vite): request `/api/...` được chuyển sang `localhost:3000/...` |

### 2.7. Flow gọi thử API bằng Swagger

```
1. npm run dev (khởi động lại sau khi đổi nest-cli.json)
2. Mở http://localhost:3000/docs
3. Chọn API (ví dụ POST /users) → Try it out
4. Sửa Request body → Execute
5. Xem: lệnh curl, URL đã gọi, mã trạng thái, response
```

Cách Swagger biết các API và body:

```
Lúc build (plugin @nestjs/swagger trong nest-cli.json)
  ├─ Đọc controller: @Controller, @Get, @Post, @ApiTags → danh sách endpoint, nhóm
  ├─ Đọc DTO: field có "?" → không bắt buộc; không có "?" → bắt buộc
  ├─ classValidatorShim: @IsEmail, @MinLength, @Matches... → format, minLength, pattern
  └─ introspectComments: comment trên field/method → mô tả
Lúc chạy (main.ts, khi NODE_ENV khác production)
  └─ setupSwagger(app) → trang /docs và /docs-json
```
