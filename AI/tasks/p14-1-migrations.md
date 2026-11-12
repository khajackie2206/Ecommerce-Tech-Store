## Mục tiêu

Từ task này, database được dựng và thay đổi bằng **migration** của TypeORM thay cho `database/schema.sql`:

- `server/src/migrations/`: mỗi file là một bước thay đổi database có thứ tự, có `up()` (làm) và `down()` (hoàn tác).
- `npm run db:migrate`: chạy các migration chưa chạy.
- `npm run db:reset`: xoá database, tạo lại **trống**, chạy migration, nạp `seed.sql`.
- Container API (Docker) tự chạy migration trước khi khởi động.
- Migration thứ hai thêm index `IX_Orders_status_createdAt` cho báo cáo của Phần 13: ví dụ về một thay đổi database **sau khi** đã có dữ liệu thật.

**Làm sau:** mọi task backend trước đó đã merge (migration đầu tiên chụp lại schema đang có). Đây là task đầu của Phần 14; hai task sau (CI, triển khai) dùng lại `npm run db:reset` và cách Docker chạy migration.

**Đọc trước:** giáo trình Bài 7 phần `synchronize` (vì sao không dùng trong production). Tài liệu TypeORM "Migrations": https://typeorm.io/docs/advanced-topics/migrations/

## Vì sao cần migration?

Tới giờ: muốn đổi database thì sửa `schema.sql` rồi `npm run db:reset`, **mất sạch dữ liệu**. Ở máy mình thì không sao, nhưng database thật của cửa hàng không thể xoá đi tạo lại mỗi lần thêm một cột.

Migration giải quyết bằng cách ghi lại **từng bước thay đổi**:

```
1794400000000-InitialSchema.ts                (tạo 8 bảng)
1794400100000-AddOrdersStatusCreatedAtIndex.ts (thêm 1 index)
1794500000000-AddProductViewCount.ts           (sau này: thêm 1 cột)...
```

TypeORM tự tạo bảng `migrations` trong database để nhớ bước nào **đã chạy**. `migration:run` chỉ chạy những bước còn thiếu. Máy của bạn, máy teammate, server production: database nào cũng đi đúng chuỗi bước đó và có cùng schema. File migration nằm trong Git, review như code.

| | `schema.sql` (tới Phần 13) | Migration (từ giờ) |
|---|---|---|
| Thay đổi database | Sửa file, xoá DB tạo lại | Thêm một file migration mới |
| Dữ liệu cũ | Mất | Giữ nguyên |
| Biết DB đang ở phiên bản nào | Không | Bảng `migrations` |
| Hoàn tác | Không | `migration:revert` chạy `down()` |

## Bước 1: Migration đầu tiên = schema hiện tại

Migration đầu tiên chứa đúng các câu `CREATE TABLE`, `CREATE INDEX` của `schema.sql` (bỏ phần `DROP` và các dòng `GO`, vì `GO` là lệnh của công cụ `sqlcmd`, không phải SQL). Tạo `server/src/migrations/1794400000000-InitialSchema.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

// First migration: the schema as it was in database/schema.sql (Parts 4-13).
// From now on the database changes ONLY through migrations, never by editing tables by hand.
export class InitialSchema1794400000000 implements MigrationInterface {
  name = 'InitialSchema1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE Users (
        id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Users_id DEFAULT NEWSEQUENTIALID(),
        email        NVARCHAR(255)    NOT NULL,
        passwordHash NVARCHAR(255)    NOT NULL, -- argon2 hash, never the plain password
        fullName     NVARCHAR(100)    NOT NULL,
        phone        VARCHAR(20)      NULL,
        role         VARCHAR(20)      NOT NULL CONSTRAINT DF_Users_role DEFAULT 'customer',
        isActive     BIT              NOT NULL CONSTRAINT DF_Users_isActive DEFAULT 1,
        createdAt    DATETIME2        NOT NULL CONSTRAINT DF_Users_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt    DATETIME2        NOT NULL CONSTRAINT DF_Users_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_Users PRIMARY KEY (id),
        CONSTRAINT UQ_Users_email UNIQUE (email),
        CONSTRAINT CK_Users_role CHECK (role IN ('customer', 'admin'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE Categories (
        id        INT IDENTITY(1,1) NOT NULL,
        name      NVARCHAR(100)     NOT NULL,
        slug      VARCHAR(120)      NOT NULL, -- URL-friendly name, e.g. dien-thoai
        sortOrder INT               NOT NULL CONSTRAINT DF_Categories_sortOrder DEFAULT 0,
        isActive  BIT               NOT NULL CONSTRAINT DF_Categories_isActive DEFAULT 1,
        createdAt DATETIME2         NOT NULL CONSTRAINT DF_Categories_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_Categories PRIMARY KEY (id),
        CONSTRAINT UQ_Categories_slug UNIQUE (slug)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE Brands (
        id        INT IDENTITY(1,1) NOT NULL,
        name      NVARCHAR(100)     NOT NULL,
        slug      VARCHAR(120)      NOT NULL,
        logoUrl   NVARCHAR(500)     NULL,
        isActive  BIT               NOT NULL CONSTRAINT DF_Brands_isActive DEFAULT 1,
        createdAt DATETIME2         NOT NULL CONSTRAINT DF_Brands_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_Brands PRIMARY KEY (id),
        CONSTRAINT UQ_Brands_slug UNIQUE (slug)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE Products (
        id               INT IDENTITY(1,1) NOT NULL,
        categoryId       INT               NOT NULL,
        brandId          INT               NOT NULL,
        name             NVARCHAR(200)     NOT NULL,
        slug             VARCHAR(220)      NOT NULL,
        shortDescription NVARCHAR(500)     NULL,
        description      NVARCHAR(MAX)     NULL,
        specs            NVARCHAR(MAX)     NULL, -- technical specs as JSON: {"screen": "...", "chip": "..."}
        thumbnailUrl     NVARCHAR(500)     NULL,
        isFeatured       BIT               NOT NULL CONSTRAINT DF_Products_isFeatured DEFAULT 0,
        isActive         BIT               NOT NULL CONSTRAINT DF_Products_isActive DEFAULT 1,
        createdAt        DATETIME2         NOT NULL CONSTRAINT DF_Products_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt        DATETIME2         NOT NULL CONSTRAINT DF_Products_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_Products PRIMARY KEY (id),
        CONSTRAINT UQ_Products_slug UNIQUE (slug),
        CONSTRAINT FK_Products_Categories FOREIGN KEY (categoryId) REFERENCES Categories(id),
        CONSTRAINT FK_Products_Brands FOREIGN KEY (brandId) REFERENCES Brands(id),
        CONSTRAINT CK_Products_specs_json CHECK (specs IS NULL OR ISJSON(specs) = 1)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IX_Products_categoryId ON Products (categoryId)
    `);
    await queryRunner.query(`
      CREATE INDEX IX_Products_brandId ON Products (brandId)
    `);
    await queryRunner.query(`
      CREATE TABLE ProductVariants (
        id        INT IDENTITY(1,1) NOT NULL,
        productId INT               NOT NULL,
        sku       VARCHAR(50)       NOT NULL, -- stock keeping unit, unique code per variant
        name      NVARCHAR(150)     NOT NULL,
        color     NVARCHAR(50)      NULL,
        storage   NVARCHAR(50)      NULL,     -- phones: "256GB"; laptops: "16GB/512GB" (RAM/SSD)
        price     DECIMAL(18,2)     NOT NULL, -- list price (VND)
        salePrice DECIMAL(18,2)     NULL,     -- discounted price, NULL when not on sale
        stock     INT               NOT NULL CONSTRAINT DF_ProductVariants_stock DEFAULT 0,
        isActive  BIT               NOT NULL CONSTRAINT DF_ProductVariants_isActive DEFAULT 1,
        createdAt DATETIME2         NOT NULL CONSTRAINT DF_ProductVariants_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_ProductVariants PRIMARY KEY (id),
        CONSTRAINT UQ_ProductVariants_sku UNIQUE (sku),
        CONSTRAINT FK_ProductVariants_Products FOREIGN KEY (productId) REFERENCES Products(id) ON DELETE CASCADE,
        CONSTRAINT CK_ProductVariants_price CHECK (price > 0),
        CONSTRAINT CK_ProductVariants_salePrice CHECK (salePrice IS NULL OR (salePrice > 0 AND salePrice <= price)),
        CONSTRAINT CK_ProductVariants_stock CHECK (stock >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IX_ProductVariants_productId ON ProductVariants (productId)
    `);
    await queryRunner.query(`
      CREATE TABLE ProductImages (
        id        INT IDENTITY(1,1) NOT NULL,
        productId INT               NOT NULL,
        url       NVARCHAR(500)     NOT NULL,
        sortOrder INT               NOT NULL CONSTRAINT DF_ProductImages_sortOrder DEFAULT 0,
        CONSTRAINT PK_ProductImages PRIMARY KEY (id),
        CONSTRAINT FK_ProductImages_Products FOREIGN KEY (productId) REFERENCES Products(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IX_ProductImages_productId ON ProductImages (productId)
    `);
    await queryRunner.query(`
      CREATE TABLE Orders (
        id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Orders_id DEFAULT NEWSEQUENTIALID(),
        code            VARCHAR(20)      NOT NULL, -- human-friendly code shown to customers, e.g. TS2611080001
        userId          UNIQUEIDENTIFIER NOT NULL,
        status          VARCHAR(20)      NOT NULL CONSTRAINT DF_Orders_status DEFAULT 'pending',
        paymentMethod   VARCHAR(20)      NOT NULL CONSTRAINT DF_Orders_paymentMethod DEFAULT 'cod',
        subtotal        DECIMAL(18,2)    NOT NULL,
        shippingFee     DECIMAL(18,2)    NOT NULL CONSTRAINT DF_Orders_shippingFee DEFAULT 0,
        total           DECIMAL(18,2)    NOT NULL,
        shippingName    NVARCHAR(100)    NOT NULL,
        shippingPhone   VARCHAR(20)      NOT NULL,
        shippingAddress NVARCHAR(500)    NOT NULL,
        note            NVARCHAR(500)    NULL,
        createdAt       DATETIME2        NOT NULL CONSTRAINT DF_Orders_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt       DATETIME2        NOT NULL CONSTRAINT DF_Orders_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_Orders PRIMARY KEY (id),
        CONSTRAINT UQ_Orders_code UNIQUE (code),
        CONSTRAINT FK_Orders_Users FOREIGN KEY (userId) REFERENCES Users(id),
        CONSTRAINT CK_Orders_status CHECK (status IN ('pending', 'confirmed', 'shipping', 'completed', 'cancelled')),
        CONSTRAINT CK_Orders_paymentMethod CHECK (paymentMethod IN ('cod', 'bank_transfer')),
        CONSTRAINT CK_Orders_total CHECK (total = subtotal + shippingFee)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IX_Orders_userId_createdAt ON Orders (userId, createdAt DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE OrderItems (
        id          INT IDENTITY(1,1) NOT NULL,
        orderId     UNIQUEIDENTIFIER  NOT NULL,
        variantId   INT               NOT NULL,
        productName NVARCHAR(200)     NOT NULL,
        variantName NVARCHAR(150)     NOT NULL,
        unitPrice   DECIMAL(18,2)     NOT NULL,
        quantity    INT               NOT NULL,
        CONSTRAINT PK_OrderItems PRIMARY KEY (id),
        CONSTRAINT FK_OrderItems_Orders FOREIGN KEY (orderId) REFERENCES Orders(id) ON DELETE CASCADE,
        CONSTRAINT FK_OrderItems_ProductVariants FOREIGN KEY (variantId) REFERENCES ProductVariants(id),
        CONSTRAINT CK_OrderItems_quantity CHECK (quantity > 0),
        CONSTRAINT CK_OrderItems_unitPrice CHECK (unitPrice > 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IX_OrderItems_orderId ON OrderItems (orderId)
    `);
  }

  // Undo = drop the tables in reverse order (children before the tables they reference)
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE OrderItems');
    await queryRunner.query('DROP TABLE Orders');
    await queryRunner.query('DROP TABLE ProductImages');
    await queryRunner.query('DROP TABLE ProductVariants');
    await queryRunner.query('DROP TABLE Products');
    await queryRunner.query('DROP TABLE Brands');
    await queryRunner.query('DROP TABLE Categories');
    await queryRunner.query('DROP TABLE Users');
  }
}
```

- Số `1794400000000` ở tên file và tên class là **timestamp**: TypeORM sắp xếp migration theo số này. Migration tự tạo bằng CLI (Bước 4) sẽ có số lớn hơn, nên luôn chạy sau.
- `queryRunner.query(...)`: chạy một câu SQL, giống `dataSource.query` ở Phần 13. Mỗi câu một lần gọi.
- `down()` xoá bảng theo thứ tự **ngược** (bảng con trước bảng cha), nếu không sẽ vướng khoá ngoại.
- Khi viết hướng dẫn này, database dựng bằng migration đã được đối chiếu với database dựng bằng `schema.sql`: giống hệt nhau về cột, kiểu, ràng buộc, index.

Sửa phần đầu `database/schema.sql` để không ai dùng nhầm nó nữa:

```sql
-- =============================================================================
-- REFERENCE ONLY since Part 14: the database is built by the migrations in
-- server/src/migrations (npm run db:migrate). Do not run this file.
-- It stays here because Parts 4-13 explain the schema with it.
-- =============================================================================
```

## Bước 2: Kết nối cho CLI

CLI của TypeORM chạy ngoài NestJS (không có `ConfigService`), nên cần một file kết nối riêng. Tạo `server/src/data-source.ts`:

```ts
import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

// Connection used by the TypeORM CLI (migration:run, migration:revert...).
// The CLI does not start NestJS, so it can't use ConfigService: it reads process.env.
// It runs on the BUILT code (dist/), because entities use decorators.

// Load the .env file when there is one (Node 22 built-in, no extra package).
// Variables already set (Docker, CI) win over the file.
for (const file of ['.env', '../.env']) {
  try {
    process.loadEnvFile(file);
    break;
  } catch {
    // no such file here, try the next one
  }
}

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

export default new DataSource({
  type: 'mssql',
  host: required('DB_HOST'),
  port: Number(process.env.DB_PORT ?? 1433),
  username: required('DB_USERNAME'),
  password: required('DB_PASSWORD'),
  database: required('DB_NAME'),
  options: { encrypt: true, trustServerCertificate: true, useUTC: true },
  // import.meta.dirname = the folder of this file once built: dist/
  entities: [join(import.meta.dirname, '**/*.entity.js')],
  migrations: [join(import.meta.dirname, 'migrations/*.js')],
  // Applied migrations are recorded in this table (created automatically)
  migrationsTableName: 'migrations',
});
```

Giải thích:
- `process.loadEnvFile('.env')`: có sẵn trong Node 22, nạp file `.env` vào `process.env` mà không cần thư viện `dotenv`. Biến đã có sẵn (Docker, GitHub Actions) **không** bị file ghi đè.
- CLI chạy trên code **đã build** (`dist/`): entity dùng decorator nên Node không chạy thẳng file `.ts` được. `import.meta.dirname` là thư mục `dist/` khi đã build, nên đường dẫn `migrations/*.js` trỏ đúng các file migration đã biên dịch.
- `AppModule` **không** cần biết về migration: nó vẫn kết nối như cũ, `DB_SYNCHRONIZE=false`.

## Bước 3: Lệnh npm

Trong `server/package.json`, thêm vào `scripts`:

```json
    "migration:run": "npm run build && typeorm migration:run -d dist/data-source.js",
    "migration:revert": "npm run build && typeorm migration:revert -d dist/data-source.js",
    "migration:show": "npm run build && typeorm migration:show -d dist/data-source.js",
    "migration:create": "typeorm migration:create"
```

Tạo `database/recreate-db.sh` (chạy trong container SQL Server, giống `run-sql.sh`):

```bash
#!/bin/bash
# Drops the app database and creates it again, EMPTY. All data is lost.
# Executed INSIDE the SQL Server container (npm run db:recreate), where
# MSSQL_SA_PASSWORD and DB_NAME are set by docker-compose.
# The tables are then created by the migrations (npm run db:migrate).
set -euo pipefail

/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -b -d master -Q "
IF DB_ID('$DB_NAME') IS NOT NULL
BEGIN
  -- Disconnect everyone (the running API) so the database can be dropped
  ALTER DATABASE [$DB_NAME] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  DROP DATABASE [$DB_NAME];
END;
CREATE DATABASE [$DB_NAME];
PRINT 'Database $DB_NAME recreated (empty).';"
```

Trong `package.json` ở thư mục gốc: **xoá** `db:schema`, thay `db:reset` và thêm hai lệnh:

```json
    "db:recreate": "docker compose exec sqlserver bash /database/recreate-db.sh",
    "db:migrate": "npm --prefix server run migration:run",
    "db:reset": "npm run db:recreate && npm run db:migrate && npm run db:seed",
```

Thử:

```powershell
npm run db:reset
npm --prefix server run migration:show
```

`migration:show` in ra:

```
[X] 1 InitialSchema1794400000000
```

Mở database trong VS Code: có thêm bảng `migrations` ghi lại bước đã chạy. Đơn hàng mẫu (Phần 13): `npm run db:seed-orders`.

## Bước 4: Một thay đổi mới bằng migration

Báo cáo (Phần 13) luôn lọc `Orders` theo `status` và khoảng `createdAt`. Thêm một index cho truy vấn đó, **không** xoá dữ liệu.

```powershell
cd server
npm run migration:create -- src/migrations/AddOrdersStatusCreatedAtIndex
```

Lệnh tạo file `src/migrations/<timestamp>-AddOrdersStatusCreatedAtIndex.ts` với `up()`, `down()` rỗng (`--` để npm chuyển phần sau cho `typeorm`). Điền nội dung:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

// Reports (Part 13) always filter Orders by status and a createdAt range:
//   WHERE status = 'completed' AND createdAt >= @0 AND createdAt < @1
// This index lets SQL Server jump straight to those rows instead of reading the whole table.
export class AddOrdersStatusCreatedAtIndex1794400100000 implements MigrationInterface {
  name = 'AddOrdersStatusCreatedAtIndex1794400100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IX_Orders_status_createdAt ON Orders (status, createdAt)',
    );
  }

  // Every migration must be reversible: down() undoes exactly what up() did
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IX_Orders_status_createdAt ON Orders');
  }
}
```

Timestamp của bạn sẽ khác số trong mẫu, giữ nguyên số CLI sinh ra (cả tên file lẫn tên class). File CLI sinh ra dùng `import { MigrationInterface, QueryRunner }` và dấu nháy kép: đổi thành `import type` như mẫu (hai thứ đó chỉ là kiểu) và chạy `npm run format` cho đúng chuẩn của dự án. Chạy:

```powershell
npm run migration:run      # "Migration AddOrdersStatusCreatedAtIndex... has been executed successfully"
npm run migration:revert   # chạy down(): DROP INDEX
npm run migration:show     # [X] InitialSchema / [ ] AddOrdersStatusCreatedAtIndex
npm run migration:run      # chạy lại
npm run migration:run      # "No migrations are pending": chạy nhiều lần cũng an toàn
```

Trong lúc đó, dữ liệu trong `Orders` vẫn còn nguyên. Đó là khác biệt lớn nhất so với `schema.sql`.

TypeORM còn có `migration:generate`: so entity với database rồi tự sinh SQL. Dự án này không dùng: schema của ta có nhiều thứ entity không mô tả (tên ràng buộc `CK_...`, `DF_...`, `CHECK`, index), lệnh đó sẽ sinh ra rất nhiều câu "sửa" không mong muốn. Ta viết migration bằng tay: ít, rõ, review được.

## Bước 5: Docker tự chạy migration

Trong `server/Dockerfile`, thay dòng `CMD` cuối cùng:

```dockerfile
# 1) apply the migrations that are not in the database yet, 2) start the API.
# "exec" replaces the shell with node, so node still receives SIGTERM and shuts down gracefully.
CMD ["sh", "-c", "node node_modules/typeorm/cli.js migration:run -d dist/data-source.js && exec node dist/main.js"]
```

- `&&`: migration lỗi thì API **không** khởi động. Thà không chạy còn hơn chạy trên database sai schema.
- `node node_modules/typeorm/cli.js`: image production không có `npx`/`npm run` cho lệnh này, gọi thẳng file CLI.
- `exec`: không có `exec` thì `sh` là tiến trình chính (PID 1) và Docker gửi tín hiệu tắt cho `sh`, không tới Node (Phần 1 đã nói vì sao cần nhận `SIGTERM`).

Thử: `npm run app:down`, `npm run db:recreate` (database trống), `npm run app:up`, rồi `docker compose logs server`: thấy hai dòng `Migration ... has been executed successfully` trước `API is running`.

## Bước 6: Cập nhật tài liệu

- `README.md`: mục "Các lệnh" thay `db:schema` bằng `db:recreate`, `db:migrate`; giải thích `db:reset` giờ dùng migration.
- Quy ước nhóm (thêm vào README): **không ai sửa bảng trực tiếp** bằng VS Code hay sửa migration đã merge. Muốn đổi database → thêm migration mới trong Pull Request.

## Kiểm tra

- [ ] `npm run db:reset` dựng được database từ trống, `npm run test:e2e` qua trên database đó
- [ ] `migration:show`, `migration:revert`, `migration:run` hoạt động như Bước 4, dữ liệu không mất
- [ ] `npm run app:up` trên database trống: container tự migrate rồi chạy, `/api/v1/health` báo `up`
- [ ] Giải thích được: bảng `migrations` để làm gì; vì sao không sửa một migration đã merge mà thêm migration mới; vì sao không dùng `synchronize` ở production
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review. **Báo teammate** chạy `npm run setup` và `npm run db:reset` sau khi pull

## Tự luyện

1. Thêm cột `Products.viewCount INT NOT NULL CONSTRAINT DF_Products_viewCount DEFAULT 0` bằng một migration mới (nhớ `down()`: xoá ràng buộc `DF_...` trước rồi mới xoá cột). Thêm property tương ứng vào entity `Product`.
2. Vì sao migration đầu tiên không chứa dữ liệu mẫu (`seed.sql`)? Khi nào dữ liệu **nên** nằm trong migration? (Gợi ý: danh mục mặc định mà mọi môi trường đều phải có.)
