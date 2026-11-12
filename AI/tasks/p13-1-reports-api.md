## Mục tiêu

Ba API báo cáo cho admin (`@Roles('admin')`), dùng cho trang dashboard ở task sau:

| URL | Trả về |
|---|---|
| `GET /api/v1/admin/reports/summary?from=&to=` | Doanh thu, số đơn hoàn thành, giá trị đơn trung bình, số sản phẩm đã bán, số đơn theo từng trạng thái |
| `GET /api/v1/admin/reports/revenue-by-day?from=&to=` | Doanh thu **từng ngày** trong khoảng (ngày không có đơn = 0) |
| `GET /api/v1/admin/reports/top-products?from=&to=&limit=5` | Sản phẩm bán chạy nhất theo số lượng |

`from`, `to` dạng `YYYY-MM-DD` theo giờ Việt Nam, tính cả hai đầu. Không gửi thì lấy **30 ngày gần nhất**. Doanh thu chỉ tính đơn `completed`.

Kèm theo: script `database/seed-orders.sql` sinh khoảng 150 đơn hàng mẫu trong 60 ngày qua, để báo cáo và biểu đồ có dữ liệu.

**Làm sau:** Phần 11 (bảng `Orders`, `OrderItems` có dữ liệu thật). Làm **song song** được với các task của Phần 12.

**Đọc trước:** task "Truy vấn báo cáo sản phẩm theo hãng và danh mục" (Phần 4): `GROUP BY`, `SUM`, `JOIN`. Bài này đưa đúng các câu SQL kiểu đó vào NestJS.

## Khi nào viết SQL tay?

Tới giờ ta dùng repository (`find`, `save`) và QueryBuilder. Báo cáo thì khác: gộp dữ liệu từ 4 bảng, `GROUP BY` theo ngày tính ra từ một cột, không trả về entity nào. Viết bằng QueryBuilder được, nhưng khó đọc hơn chính câu SQL. TypeORM cho chạy SQL tay:

```ts
this.dataSource.query('SELECT ... WHERE createdAt >= @0 AND createdAt < @1', [start, end]);
```

`@0`, `@1` là **tham số** (với SQL Server), giá trị đi riêng, không ghép vào chuỗi SQL, nên vẫn an toàn trước SQL Injection như QueryBuilder. **Không bao giờ** viết `` `... WHERE code = '${code}'` ``.

## Ngày theo giờ Việt Nam, dữ liệu theo giờ UTC

`Orders.createdAt` lưu giờ UTC (`SYSUTCDATETIME()`, Phần 4). Một đơn đặt lúc 6 giờ sáng ngày 1/11 ở Việt Nam được lưu là 23 giờ ngày **31/10** UTC. Nếu nhóm theo `CAST(createdAt AS DATE)`, đơn đó rơi nhầm sang ngày hôm trước.

Ta xử lý ở cả hai đầu:
- **Lọc:** ngày 1/11 giờ Việt Nam = từ `2026-10-31T17:00Z` (tính) đến `2026-11-01T17:00Z` (không tính). Service đổi `from`/`to` sang hai mốc UTC này rồi truyền làm tham số.
- **Nhóm:** `CAST(DATEADD(HOUR, 7, createdAt) AS DATE)`: cộng 7 giờ rồi mới lấy ngày.

## Bước 1: Đơn hàng mẫu

Tạo `database/seed-orders.sql`:

```sql
-- =============================================================================
-- Sample orders for the reports and the admin dashboard (Part 13).
-- ~150 orders spread over the last 60 days, owned by a demo customer.
-- Run:  npm run db:seed-orders   (safe to run again: it replaces its own orders)
--
-- These orders are HISTORY: they do not take stock from ProductVariants.
-- Prices are copied from the current variants, like a real order would.
-- =============================================================================
SET NOCOUNT ON;
SET XACT_ABORT ON; -- any error rolls the whole script back
BEGIN TRANSACTION;

-- The demo customer. The hash is not a real argon2 hash: nobody can log in with it.
IF NOT EXISTS (SELECT 1 FROM Users WHERE email = 'khachmau@techstore.vn')
  INSERT INTO Users (email, passwordHash, fullName, phone)
  VALUES ('khachmau@techstore.vn', 'not-a-real-hash', N'Khách mẫu', '0900000000');

DECLARE @userId UNIQUEIDENTIFIER =
  (SELECT id FROM Users WHERE email = 'khachmau@techstore.vn');

-- Start over: remove the demo orders of a previous run (OrderItems: ON DELETE CASCADE)
DELETE FROM Orders WHERE userId = @userId;

DECLARE @i INT = 0;
WHILE @i < 150
BEGIN
  -- NEWID() is random every call; CHECKSUM turns it into an INT, ABS(...) % n into 0..n-1
  DECLARE @daysAgo INT = ABS(CHECKSUM(NEWID())) % 60;
  DECLARE @createdAt DATETIME2 = DATEADD(MINUTE, -(ABS(CHECKSUM(NEWID())) % 1440),
                                 DATEADD(DAY, -@daysAgo, SYSUTCDATETIME()));
  DECLARE @roll INT = ABS(CHECKSUM(NEWID())) % 100;

  -- Recent orders are still in progress, older ones are finished
  DECLARE @status VARCHAR(20) = CASE
    WHEN @daysAgo < 2 AND @roll < 60 THEN 'pending'
    WHEN @daysAgo < 4 AND @roll < 60 THEN 'confirmed'
    WHEN @daysAgo < 6 AND @roll < 60 THEN 'shipping'
    WHEN @roll < 12 THEN 'cancelled'
    ELSE 'completed'
  END;

  DECLARE @orderId UNIQUEIDENTIFIER = NEWID();
  -- Same format as the API: TS + yyMMdd (Vietnam time) + 6 random characters
  DECLARE @code VARCHAR(20) = 'TS' + FORMAT(DATEADD(HOUR, 7, @createdAt), 'yyMMdd')
    + LEFT(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''), 6);

  -- Totals are 0 for now: CK_Orders_total (total = subtotal + shippingFee) still holds
  INSERT INTO Orders (id, code, userId, status, paymentMethod, subtotal, shippingFee, total,
                      shippingName, shippingPhone, shippingAddress, createdAt, updatedAt)
  VALUES (@orderId, @code, @userId, @status,
          CASE WHEN @roll % 3 = 0 THEN 'bank_transfer' ELSE 'cod' END,
          0, 0, 0, N'Khách mẫu', '0900000000', N'1 Lê Lợi, Quận 1, TP.HCM',
          @createdAt, @createdAt);

  -- 1 or 2 random variants of active products, 1-2 units each (accessories up to 3)
  INSERT INTO OrderItems (orderId, variantId, productName, variantName, unitPrice, quantity)
  SELECT TOP (1 + @roll % 2)
    @orderId, v.id, p.name, v.name, COALESCE(v.salePrice, v.price),
    CASE WHEN COALESCE(v.salePrice, v.price) < 1000000 THEN 1 + ABS(CHECKSUM(NEWID())) % 3
         ELSE 1 + ABS(CHECKSUM(NEWID())) % 2 END
  FROM ProductVariants v
  JOIN Products p ON p.id = v.productId
  WHERE v.isActive = 1 AND p.isActive = 1
  ORDER BY NEWID(); -- random order = random pick

  -- Now the real totals, with the shop's shipping rule (free from 2,000,000)
  UPDATE o SET
    subtotal = t.subtotal,
    shippingFee = CASE WHEN t.subtotal >= 2000000 THEN 0 ELSE 30000 END,
    total = t.subtotal + CASE WHEN t.subtotal >= 2000000 THEN 0 ELSE 30000 END
  FROM Orders o
  CROSS APPLY (SELECT SUM(unitPrice * quantity) AS subtotal
               FROM OrderItems WHERE orderId = o.id) t
  WHERE o.id = @orderId;

  SET @i += 1;
END;

COMMIT;

-- What we just created
SELECT status, COUNT(*) AS orders, SUM(total) AS total
FROM Orders WHERE userId = @userId
GROUP BY status ORDER BY orders DESC;
```

Thêm script vào `package.json` ở thư mục gốc (cạnh `db:seed`):

```json
    "db:seed-orders": "docker compose exec sqlserver bash /database/run-sql.sh seed-orders.sql",
```

Chạy `npm run db:seed-orders`. Kết quả in ra số đơn theo trạng thái (con số mỗi lần chạy một khác vì dữ liệu ngẫu nhiên):

```
status    orders total
completed 126    6866660000.00
cancelled 14     923300000.00
...
```

Giải thích:
- `SET XACT_ABORT ON` + `BEGIN TRANSACTION` ... `COMMIT`: lỗi ở bất kỳ câu nào thì cả script rollback, không để lại nửa chừng.
- `ABS(CHECKSUM(NEWID())) % 60`: `NEWID()` tạo GUID ngẫu nhiên mỗi lần gọi, `CHECKSUM` đổi nó thành số, `% 60` lấy số từ 0 đến 59. Cách sinh số ngẫu nhiên quen thuộc trong T-SQL.
- `INSERT ... SELECT TOP (n) ... ORDER BY NEWID()`: chọn ngẫu nhiên n phiên bản.
- Đơn được tạo với tổng tiền 0 trước, rồi `UPDATE ... CROSS APPLY (SELECT SUM(...))` tính lại từ các dòng. Cả hai bước đều thoả `CK_Orders_total`.
- Chạy lại script nhiều lần không sao: nó xoá đơn mẫu cũ của chính "Khách mẫu" trước khi tạo mới.

## Bước 2: DTO

Tạo `src/reports/dto/report-range-query.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// ?from=2026-10-01&to=2026-10-31 (days in Vietnam time, both included).
// Missing: the last 30 days up to today.
export class ReportRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(DAY, { message: 'from phải có dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Matches(DAY, { message: 'to phải có dạng YYYY-MM-DD' })
  to?: string;
}

export class TopProductsQueryDto extends ReportRangeQueryDto {
  @ApiPropertyOptional({ default: 5 })
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(20, { message: 'limit tối đa là 20' })
  limit = 5;
}
```

## Bước 3: Service

```powershell
cd server
npx nest g module reports
npx nest g controller reports
npx nest g service reports
```

Thay toàn bộ `src/reports/reports.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { OrderStatus } from '../orders/entities/order.entity.js';
import type {
  ReportRangeQueryDto,
  TopProductsQueryDto,
} from './dto/report-range-query.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

// A range of Vietnam days turned into UTC instants, because Orders.createdAt is UTC.
// Vietnam day 2026-11-01 = from 2026-10-31T17:00Z (included) to 2026-11-01T17:00Z (excluded)
interface DayRange {
  from: string; // "2026-10-01"
  to: string; // "2026-10-31"
  startUtc: Date;
  endUtc: Date; // exclusive
}

export interface DailyRevenue {
  date: string;
  orders: number;
  revenue: number;
}

export interface TopProduct {
  productId: number;
  name: string;
  slug: string;
  thumbnailUrl: string | null;
  quantity: number;
  revenue: number;
}

@Injectable()
export class ReportsService {
  // Reports read across many tables with GROUP BY: plain SQL is the clearest tool
  constructor(private readonly dataSource: DataSource) {}

  // Key figures for the dashboard cards
  async summary(query: ReportRangeQueryDto) {
    const range = this.toRange(query);

    // One row per status present in the range. @0, @1 are parameters, never glued text
    const byStatus: { status: OrderStatus; orders: number; total: number }[] =
      await this.dataSource.query(
        `SELECT status, COUNT(*) AS orders, SUM(total) AS total
         FROM Orders
         WHERE createdAt >= @0 AND createdAt < @1
         GROUP BY status`,
        [range.startUtc, range.endUtc],
      );

    const [{ itemsSold }]: { itemsSold: number }[] =
      await this.dataSource.query(
        `SELECT COALESCE(SUM(i.quantity), 0) AS itemsSold
       FROM OrderItems i
       JOIN Orders o ON o.id = i.orderId
       WHERE o.status = 'completed' AND o.createdAt >= @0 AND o.createdAt < @1`,
        [range.startUtc, range.endUtc],
      );

    // Revenue = money from completed orders only (cancelled never paid, others not yet)
    const completed = byStatus.find((row) => row.status === 'completed');
    const revenue = completed?.total ?? 0;
    const completedOrders = completed?.orders ?? 0;
    return {
      from: range.from,
      to: range.to,
      revenue,
      completedOrders,
      averageOrderValue: completedOrders
        ? Math.round(revenue / completedOrders)
        : 0,
      itemsSold,
      ordersByStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row.orders]),
      ),
    };
  }

  // Revenue per day, EVERY day of the range: a chart needs the days without orders too
  async revenueByDay(query: ReportRangeQueryDto): Promise<DailyRevenue[]> {
    const range = this.toRange(query);

    // CROSS APPLY computes the Vietnam date once per row, then we group by it.
    // CONVERT(CHAR(10), date, 23) formats a DATE as 'yyyy-mm-dd'.
    const rows: DailyRevenue[] = await this.dataSource.query(
      `SELECT CONVERT(CHAR(10), d.day, 23) AS date,
              COUNT(*) AS orders,
              SUM(o.total) AS revenue
       FROM Orders o
       CROSS APPLY (SELECT CAST(DATEADD(HOUR, 7, o.createdAt) AS DATE) AS day) d
       WHERE o.status = 'completed' AND o.createdAt >= @0 AND o.createdAt < @1
       GROUP BY d.day
       ORDER BY d.day`,
      [range.startUtc, range.endUtc],
    );

    // Fill the gaps with 0 in JavaScript (simpler than a calendar table in SQL)
    const byDate = new Map(rows.map((row) => [row.date, row]));
    const days: DailyRevenue[] = [];
    for (
      let t = Date.parse(range.from);
      t <= Date.parse(range.to);
      t += DAY_MS
    ) {
      const date = new Date(t).toISOString().slice(0, 10);
      days.push(byDate.get(date) ?? { date, orders: 0, revenue: 0 });
    }
    return days;
  }

  // Best sellers by units sold, grouped by product (all its variants together)
  topProducts(query: TopProductsQueryDto): Promise<TopProduct[]> {
    const range = this.toRange(query);
    return this.dataSource.query(
      `SELECT TOP (@2)
              p.id AS productId, p.name, p.slug, p.thumbnailUrl,
              SUM(i.quantity) AS quantity,
              SUM(i.unitPrice * i.quantity) AS revenue
       FROM OrderItems i
       JOIN Orders o ON o.id = i.orderId
       JOIN ProductVariants v ON v.id = i.variantId
       JOIN Products p ON p.id = v.productId
       WHERE o.status = 'completed' AND o.createdAt >= @0 AND o.createdAt < @1
       GROUP BY p.id, p.name, p.slug, p.thumbnailUrl
       ORDER BY quantity DESC, revenue DESC`,
      [range.startUtc, range.endUtc, query.limit],
    );
  }

  private toRange({ from, to }: ReportRangeQueryDto): DayRange {
    // "Today" in Vietnam, as yyyy-mm-dd
    const today = new Date(Date.now() + VIETNAM_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
    const end = to ?? today;
    const endMs = this.parseDay(end);
    const start =
      from ?? new Date(endMs - 29 * DAY_MS).toISOString().slice(0, 10);
    const startMs = this.parseDay(start);

    if (startMs > endMs) {
      throw new BadRequestException('from phải trước hoặc bằng to');
    }
    if (endMs - startMs > 366 * DAY_MS) {
      throw new BadRequestException('Khoảng thời gian tối đa 1 năm');
    }
    return {
      from: start,
      to: end,
      startUtc: new Date(startMs - VIETNAM_OFFSET_MS),
      endUtc: new Date(endMs + DAY_MS - VIETNAM_OFFSET_MS),
    };
  }

  // "2026-02-31" passes the YYYY-MM-DD pattern, and Date.parse quietly turns it into
  // March 3. Formatting the result back must give the same text, otherwise it's no real day.
  private parseDay(day: string): number {
    const ms = Date.parse(day);
    if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== day) {
      throw new BadRequestException(`Ngày không hợp lệ: ${day}`);
    }
    return ms;
  }
}
```

Giải thích:
- `summary`: một câu `GROUP BY status` cho số đơn và tổng tiền mỗi trạng thái, một câu nữa cho số sản phẩm đã bán. `Object.fromEntries` đổi mảng `[{status, orders}]` thành object `{ completed: 63, pending: 5, ... }`.
- `revenueByDay`: `CROSS APPLY (SELECT ... AS day) d` tính "ngày Việt Nam" **một lần** cho mỗi dòng và đặt tên `d.day`, để `GROUP BY` và `SELECT` dùng chung, khỏi viết biểu thức dài hai lần. `CONVERT(CHAR(10), d.day, 23)` định dạng ngày thành `yyyy-mm-dd`.
- Ngày không có đơn hàng không có dòng nào trong kết quả SQL. Biểu đồ thì cần đủ mọi ngày, nên service điền 0 bằng JavaScript (đơn giản hơn tạo bảng lịch trong SQL).
- `topProducts`: `JOIN` 4 bảng để gộp mọi phiên bản về sản phẩm, `TOP (@2)` cũng là tham số. `ORDER BY quantity DESC, revenue DESC`: bằng số lượng thì sản phẩm doanh thu cao hơn đứng trước.
- `parseDay`: `"2026-02-31"` qua được `@Matches(YYYY-MM-DD)`, và `Date.parse` lặng lẽ biến nó thành **3/3**. Định dạng ngược lại mà không ra đúng chuỗi ban đầu thì đó không phải ngày thật → 400.
- Giới hạn khoảng 1 năm: báo cáo quét bảng `Orders`, khoảng càng dài càng nặng.

## Bước 4: Controller và module

Thay toàn bộ `src/reports/reports.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  ReportRangeQueryDto,
  TopProductsQueryDto,
} from './dto/report-range-query.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Admin: Báo cáo')
@ApiBadRequestResponse({ description: 'Khoảng ngày không hợp lệ' })
@Roles('admin')
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @ApiOperation({
    summary: 'Doanh thu, số đơn theo trạng thái, giá trị đơn trung bình',
  })
  @Get('summary')
  summary(@Query() query: ReportRangeQueryDto) {
    return this.reports.summary(query);
  }

  @ApiOperation({ summary: 'Doanh thu từng ngày (đơn đã hoàn thành)' })
  @Get('revenue-by-day')
  revenueByDay(@Query() query: ReportRangeQueryDto) {
    return this.reports.revenueByDay(query);
  }

  @ApiOperation({ summary: 'Sản phẩm bán chạy nhất theo số lượng' })
  @Get('top-products')
  topProducts(@Query() query: TopProductsQueryDto) {
    return this.reports.topProducts(query);
  }
}
```

Thay toàn bộ `src/reports/reports.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

// Read-only module: plain SQL through DataSource, no entity of its own
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
```

Module không có `TypeOrmModule.forFeature`: nó không dùng repository nào, chỉ dùng `DataSource` (có sẵn toàn app).

## Bước 5: Test

Thay toàn bộ `src/reports/reports.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  let service: ReportsService;
  const dataSource = { query: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(ReportsService);
  });

  describe('revenueByDay', () => {
    it('turns Vietnam days into UTC boundaries for the SQL parameters', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.revenueByDay({ from: '2026-11-01', to: '2026-11-03' });

      // 00:00 on Nov 1 in Vietnam (UTC+7) is 17:00 on Oct 31 in UTC.
      // The end is exclusive: 00:00 on Nov 4 in Vietnam.
      const [, params] = dataSource.query.mock.calls[0] ?? [];
      expect(params).toEqual([
        new Date('2026-10-31T17:00:00.000Z'),
        new Date('2026-11-03T17:00:00.000Z'),
      ]);
    });

    it('returns every day of the range, 0 for days without orders', async () => {
      dataSource.query.mockResolvedValue([
        { date: '2026-11-02', orders: 2, revenue: 50000000 },
      ]);

      const days = await service.revenueByDay({
        from: '2026-11-01',
        to: '2026-11-03',
      });

      expect(days).toEqual([
        { date: '2026-11-01', orders: 0, revenue: 0 },
        { date: '2026-11-02', orders: 2, revenue: 50000000 },
        { date: '2026-11-03', orders: 0, revenue: 0 },
      ]);
    });

    it('defaults to the last 30 days', async () => {
      dataSource.query.mockResolvedValue([]);
      await expect(service.revenueByDay({})).resolves.toHaveLength(30);
    });

    it.each([
      ['a day that does not exist', { from: '2026-02-31' }],
      ['from after to', { from: '2026-11-10', to: '2026-11-01' }],
      ['more than a year', { from: '2024-01-01', to: '2026-01-01' }],
    ])('rejects %s with 400', async (_case, range) => {
      await expect(service.revenueByDay(range)).rejects.toThrow(
        BadRequestException,
      );
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('summary', () => {
    it('counts revenue from completed orders only', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          { status: 'completed', orders: 4, total: 100000000 },
          { status: 'cancelled', orders: 1, total: 30000000 },
          { status: 'pending', orders: 2, total: 20000000 },
        ])
        .mockResolvedValueOnce([{ itemsSold: 6 }]);

      const summary = await service.summary({
        from: '2026-11-01',
        to: '2026-11-30',
      });

      expect(summary).toMatchObject({
        revenue: 100000000,
        completedOrders: 4,
        averageOrderValue: 25000000,
        itemsSold: 6,
        ordersByStatus: { completed: 4, cancelled: 1, pending: 2 },
      });
    });
  });
});
```

Test đầu kiểm tra phần dễ sai nhất: mốc giờ UTC truyền vào câu SQL. `dataSource.query.mock.calls[0]` là các tham số của lần gọi đầu tiên.

Tạo `test/reports.e2e-spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { bearer } from './auth-helper.js';

// Runs the real SQL of the reports. Works with or without the sample orders
// (npm run db:seed-orders): it checks that the reports agree with each other.
// The last 90 days up to today, so the test keeps working next year
const DAY_MS = 24 * 60 * 60 * 1000;
const day = (msAgo: number) =>
  new Date(Date.now() - msAgo).toISOString().slice(0, 10);
const RANGE = `from=${day(89 * DAY_MS)}&to=${day(0)}`;

describe('Reports (e2e)', () => {
  let app: INestApplication<App>;
  let admin: string;

  const get = (path: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/admin/reports/${path}`)
      .set('Authorization', admin);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    admin = await bearer(app, 'admin');
  });

  afterAll(async () => {
    await app.close();
  });

  it('the daily revenue adds up to the summary revenue', async () => {
    const summary = (await get(`summary?${RANGE}`).expect(200)).body;
    const days = (await get(`revenue-by-day?${RANGE}`).expect(200)).body;

    expect(days).toHaveLength(90);
    const total = days.reduce(
      (sum: number, day: { revenue: number }) => sum + day.revenue,
      0,
    );
    expect(total).toBe(summary.revenue);
  });

  it('top products are sorted by quantity, best first', async () => {
    const top = (await get(`top-products?${RANGE}&limit=5`)).body;

    expect(top.length).toBeLessThanOrEqual(5);
    const quantities = top.map((p: { quantity: number }) => p.quantity);
    expect(quantities).toEqual([...quantities].sort((a, b) => b - a));
  });

  it('rejects an impossible date', async () => {
    await get('summary?from=2026-02-31').expect(400);
  });

  it('is admin only', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/reports/summary')
      .set('Authorization', await bearer(app, 'customer'))
      .expect(403);
  });
});
```

Test e2e không biết trước dữ liệu là gì (đơn mẫu sinh ngẫu nhiên), nên nó kiểm tra các báo cáo **khớp với nhau**: tổng doanh thu từng ngày phải bằng doanh thu trong `summary`. Khoảng ngày tính theo ngày chạy test, để sang năm test vẫn chạy được.

## Bước 6: Thử trên Swagger

**Authorize** bằng admin, nhóm **Admin: Báo cáo**:

1. `GET /admin/reports/summary` không tham số: số liệu 30 ngày gần nhất.
2. `GET /admin/reports/revenue-by-day?from=...&to=...` (7 ngày gần đây): đủ 7 phần tử, có ngày `revenue: 0`.
3. `GET /admin/reports/top-products?limit=3`.
4. `from=2026-02-31` → 400 "Ngày không hợp lệ: 2026-02-31".

Đối chiếu bằng SQL trong VS Code: tự viết câu tính tổng doanh thu đơn `completed` trong 30 ngày qua và so với `summary.revenue`.

## Kiểm tra

- [ ] `npm run db:seed-orders` chạy được và chạy lại được
- [ ] Ba API trả số liệu đúng, `revenue-by-day` đủ mọi ngày; khách gọi → 403
- [ ] Giải thích được: vì sao phải cộng 7 giờ khi nhóm theo ngày; `@0`, `@1` an toàn hơn ghép chuỗi ở chỗ nào
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm `GET /admin/reports/revenue-by-category`: doanh thu theo danh mục trong khoảng ngày (`JOIN` thêm `Categories`, `GROUP BY c.name`).
2. Tạm sửa câu `revenueByDay` thành `CAST(o.createdAt AS DATE)` (bỏ `DATEADD`). Đặt một đơn lúc 6 giờ sáng (giờ máy), gọi báo cáo: đơn đó nằm ở ngày nào? Trả lại như cũ.
3. Đo chi phí câu `revenueByDay`: trong VS Code chạy `SET STATISTICS IO ON;` rồi chạy câu SQL đó (thay `@0`, `@1` bằng hai mốc ngày), xem dòng `logical reads` của bảng `Orders` trong kết quả. Tạo `CREATE INDEX IX_Orders_status_createdAt ON Orders (status, createdAt);` rồi đo lại. Với 150 đơn thì chênh lệch nhỏ; nghĩ xem với 1 triệu đơn thì sao.
