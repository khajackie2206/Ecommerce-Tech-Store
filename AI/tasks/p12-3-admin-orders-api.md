## Mục tiêu

API cho admin xử lý đơn hàng (`@Roles('admin')`):

| Method | URL | Việc |
|---|---|---|
| GET | `/api/v1/admin/orders?status=&q=&page=&limit=` | Mọi đơn, mới nhất trước. Lọc theo trạng thái, tìm theo mã đơn, số điện thoại hoặc tên người nhận. Kèm người đặt (`user`) và các dòng hàng |
| GET | `/api/v1/admin/orders/:code` | Chi tiết một đơn bất kỳ |
| PATCH | `/api/v1/admin/orders/:code/status` | Chuyển trạng thái theo đúng quy trình |

Quy trình (vòng đời) của một đơn:

```
pending ──► confirmed ──► shipping ──► completed
   │            │
   └────────────┴──► cancelled (trả lại tồn kho)
```

Chuyển sai bước (bỏ qua bước, đi lùi, sửa đơn đã kết thúc) → **409** "Không thể chuyển đơn từ "completed" sang "cancelled"".

**Làm sau:** Phần 11 task "API lịch sử đơn hàng và huỷ đơn" (dùng lại `restoreStock`, `PaginationQueryDto`). Làm **song song** được với task "API admin: quản lý sản phẩm và phiên bản".

**Đọc trước:** hai task API đơn hàng của Phần 11.

## Quy tắc chuyển trạng thái là một bảng dữ liệu

Có thể viết quy trình bằng một chuỗi `if`: "nếu đang pending thì được sang confirmed hoặc cancelled, nếu đang confirmed thì...". Cách gọn và khó sai hơn là một **bảng tra**: mỗi trạng thái → danh sách trạng thái được phép đi tiếp. Kiểm tra chỉ còn một dòng `NEXT_STATUSES[hiện tại].includes(mới)`. Muốn đổi quy trình (ví dụ cho huỷ cả khi đang giao) thì sửa bảng, không sửa logic. Test cũng sinh tự động từ bảng (Bước 4).

## Bước 1: DTO

Tạo `src/orders/dto/admin-orders.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ORDER_STATUSES, type OrderStatus } from '../entities/order.entity.js';

// GET /api/v1/admin/orders?status=&q=&page=&limit=
export class ListAdminOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES, { message: `status: ${ORDER_STATUSES.join(', ')}` })
  status?: OrderStatus;

  @ApiPropertyOptional({
    description: 'Mã đơn, số điện thoại hoặc tên người nhận',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

// Body of PATCH /api/v1/admin/orders/:code/status
export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES, example: 'confirmed' })
  @IsIn(ORDER_STATUSES, { message: `status: ${ORDER_STATUSES.join(', ')}` })
  status: OrderStatus;
}
```

`@ApiPropertyOptional({ enum: ORDER_STATUSES })`: Swagger hiện ô chọn (dropdown) các trạng thái thay vì ô nhập tự do.

## Bước 2: Service

Thay toàn bộ `src/orders/orders.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  Like,
  type EntityManager,
  type FindOptionsWhere,
} from 'typeorm';
import type {
  Paginated,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import type { ListAdminOrdersQueryDto } from './dto/admin-orders.dto.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import { Order, type OrderStatus } from './entities/order.entity.js';
import { generateOrderCode } from './order-code.js';

// Shipping rule of the shop: free from 2,000,000 VND, otherwise a flat fee
export const FREE_SHIPPING_FROM = 2_000_000;
export const SHIPPING_FEE = 30_000;

// The order life cycle: which status may follow which.
// completed and cancelled are final: nothing can follow them.
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  shipping: ['completed'],
  completed: [],
  cancelled: [],
};

@Injectable()
export class OrdersService {
  // DataSource (not a single Repository): placing an order touches several tables
  // inside ONE transaction
  constructor(private readonly dataSource: DataSource) {}

  // Place an order: check stock, take it, save the order. All or nothing.
  create(userId: string, dto: CreateOrderDto): Promise<Order> {
    // transaction(): BEGIN TRANSACTION, run the callback, COMMIT.
    // If the callback throws (out of stock, any SQL error), TypeORM runs ROLLBACK:
    // the stock taken so far is given back automatically.
    // Inside, EVERY query must go through `manager`, otherwise it runs outside the transaction.
    return this.dataSource.transaction(async (manager) => {
      const variants = await this.lockVariants(
        manager,
        dto.items.map((line) => line.variantId),
      );

      const items = dto.items.map((line) => {
        const variant = variants.get(line.variantId);
        if (!variant || !variant.isActive || !variant.product.isActive) {
          throw new BadRequestException(
            `Phiên bản #${line.variantId} không còn được bán`,
          );
        }
        if (variant.stock < line.quantity) {
          throw new ConflictException(
            `"${variant.product.name} ${variant.name}" chỉ còn ${variant.stock} sản phẩm`,
          );
        }
        return {
          variantId: variant.id,
          // Snapshot: copy name and price as they are right now
          productName: variant.product.name,
          variantName: variant.name,
          unitPrice: variant.salePrice ?? variant.price,
          quantity: line.quantity,
        };
      });

      // Take the stock: UPDATE ProductVariants SET stock = stock - @0 WHERE id = @1
      for (const item of items) {
        await manager.decrement(
          ProductVariant,
          { id: item.variantId },
          'stock',
          item.quantity,
        );
      }

      const subtotal = items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      const shippingFee = subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;

      const order = manager.create(Order, {
        code: generateOrderCode(),
        userId,
        paymentMethod: dto.paymentMethod ?? 'cod',
        subtotal,
        shippingFee,
        total: subtotal + shippingFee, // CK_Orders_total checks this sum too
        shippingName: dto.shippingName,
        shippingPhone: dto.shippingPhone,
        shippingAddress: dto.shippingAddress,
        note: dto.note ?? null,
        items, // cascade: ['insert'] -> INSERT INTO OrderItems for each line
      });
      return manager.save(order);
    });
  }

  // Order history of one customer, newest first, with the lines of each order
  async findMine(
    userId: string,
    { page, limit }: PaginationQueryDto,
  ): Promise<Paginated<Order>> {
    // findAndCount = the page of rows + COUNT(*) of all matching rows, in one call
    const [items, total] = await this.dataSource
      .getRepository(Order)
      .findAndCount({
        where: { userId },
        relations: { items: true },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return { items, total, page, limit };
  }

  // One order of this customer. Someone else's order gives the same 404 as a
  // missing one: never confirm that an order code exists to a stranger.
  async findMineByCode(userId: string, code: string): Promise<Order> {
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { code, userId },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException(`Không tìm thấy đơn hàng ${code}`);
    return order;
  }

  // The customer cancels an order that the shop has not confirmed yet.
  // Status change + stock given back: one transaction again.
  cancelMine(userId: string, code: string): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      // Lock the order row: two clicks on Huỷ (or the shop confirming at the same
      // moment) are handled one after the other
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('o.items', 'i')
        .where('o.code = :code AND o.userId = :userId', { code, userId })
        .getOne();
      if (!order)
        throw new NotFoundException(`Không tìm thấy đơn hàng ${code}`);
      if (order.status !== 'pending') {
        throw new ConflictException('Chỉ huỷ được đơn hàng đang chờ xác nhận');
      }

      await this.restoreStock(manager, order);
      // UPDATE Orders SET status = 'cancelled', updatedAt = ... WHERE id = @0
      await manager.update(Order, { id: order.id }, { status: 'cancelled' });
      order.status = 'cancelled';
      return order;
    });
  }

  // ---------- Admin ----------

  // All orders, newest first, filtered by status and/or a search text
  async findAllForAdmin(
    query: ListAdminOrdersQueryDto,
  ): Promise<Paginated<Order>> {
    const { page, limit, status, q } = query;
    const base: FindOptionsWhere<Order> = status ? { status } : {};
    // Array = OR: code LIKE ... OR shippingPhone LIKE ... OR shippingName LIKE ...
    const where = q
      ? [
          { ...base, code: Like(`%${q}%`) },
          { ...base, shippingPhone: Like(`%${q}%`) },
          { ...base, shippingName: Like(`%${q}%`) },
        ]
      : base;

    const [items, total] = await this.dataSource
      .getRepository(Order)
      .findAndCount({
        where,
        relations: { user: true, items: true }, // user: who placed it (passwordHash excluded)
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return { items, total, page, limit };
  }

  async findByCodeForAdmin(code: string): Promise<Order> {
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { code },
      relations: { user: true, items: true },
    });
    if (!order) throw new NotFoundException(`Không tìm thấy đơn hàng ${code}`);
    return order;
  }

  // Move an order to its next status. Cancelling gives the stock back.
  changeStatus(code: string, next: OrderStatus): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('o.items', 'i')
        .where('o.code = :code', { code })
        .getOne();
      if (!order)
        throw new NotFoundException(`Không tìm thấy đơn hàng ${code}`);

      if (!NEXT_STATUSES[order.status].includes(next)) {
        throw new ConflictException(
          `Không thể chuyển đơn từ "${order.status}" sang "${next}"`,
        );
      }

      if (next === 'cancelled') await this.restoreStock(manager, order);
      await manager.update(Order, { id: order.id }, { status: next });
      order.status = next;
      return order;
    });
  }

  // Put back the stock an order took. Must run inside the caller's transaction.
  private async restoreStock(manager: EntityManager, order: Order) {
    for (const item of order.items) {
      await manager.increment(
        ProductVariant,
        { id: item.variantId },
        'stock',
        item.quantity,
      );
    }
  }

  // SELECT the variants WITH (UPDLOCK, ROWLOCK): until this transaction ends, any other
  // transaction that wants to lock the same rows WAITS. Two customers buying the last
  // phone at the same moment are served one after the other, never both.
  private async lockVariants(
    manager: EntityManager,
    ids: number[],
  ): Promise<Map<number, ProductVariant>> {
    const variants = await manager
      .getRepository(ProductVariant)
      .createQueryBuilder('v')
      .setLock('pessimistic_write')
      .innerJoinAndSelect('v.product', 'p')
      .where('v.id IN (:...ids)', { ids })
      .getMany();
    return new Map(variants.map((variant) => [variant.id, variant]));
  }
}
```

Phần mới (từ `// ---------- Admin ----------`):
- `NEXT_STATUSES: Record<OrderStatus, OrderStatus[]>`: kiểu `Record` bắt buộc khai báo **đủ** mọi trạng thái. Thêm trạng thái mới vào `ORDER_STATUSES` mà quên khai báo ở đây thì TypeScript báo lỗi ngay.
- `findAllForAdmin`: lọc giống `AdminProductsService.findAll` (mảng trong `where` là OR). `relations: { user: true }` kèm người đặt; `ClassSerializerInterceptor` (Phần 7) vẫn bỏ `passwordHash` vì `user` là instance của `User`.
- `changeStatus`: cùng khuôn với `cancelMine` của khách: transaction, khoá dòng đơn, kiểm tra, rồi cập nhật. Khoá dòng ở đây quan trọng: admin bấm "Xác nhận" đúng lúc khách bấm "Huỷ" thì một trong hai phải chờ và sẽ thấy trạng thái mới.
- Chỉ khi chuyển sang `cancelled` mới gọi `restoreStock`. Đơn đã `shipping` không huỷ được: hàng đã rời kho, xử lý trả hàng là một quy trình khác.

## Bước 3: Controller

Tạo `src/orders/admin-orders.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  ListAdminOrdersQueryDto,
  UpdateOrderStatusDto,
} from './dto/admin-orders.dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('Admin: Đơn hàng')
@Roles('admin')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({
    summary: 'Tất cả đơn hàng, lọc theo trạng thái, tìm theo mã/SĐT/tên',
  })
  @Get()
  findAll(@Query() query: ListAdminOrdersQueryDto) {
    return this.ordersService.findAllForAdmin(query);
  }

  @ApiOperation({ summary: 'Chi tiết đơn hàng, kèm thông tin người đặt' })
  @ApiNotFoundResponse({ description: 'Không có đơn' })
  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.ordersService.findByCodeForAdmin(code);
  }

  @ApiOperation({
    summary:
      'Đổi trạng thái: pending → confirmed → shipping → completed; huỷ khi pending/confirmed (trả kho)',
  })
  @ApiNotFoundResponse({ description: 'Không có đơn' })
  @ApiConflictResponse({ description: 'Bước chuyển trạng thái không hợp lệ' })
  @Patch(':code/status')
  changeStatus(@Param('code') code: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.changeStatus(code, dto.status);
  }
}
```

Trong `src/orders/orders.module.ts`, thêm `AdminOrdersController` vào `controllers` (kèm import):

```ts
  controllers: [OrdersController, AdminOrdersController],
```

Hai controller dùng chung một `OrdersService`: khách và admin cùng thao tác trên một bảng, chỉ khác quyền và quy tắc.

## Bước 4: Test

Tạo `src/orders/orders.service.admin.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ORDER_STATUSES, type OrderStatus } from './entities/order.entity.js';
import { NEXT_STATUSES, OrdersService } from './orders.service.js';

describe('OrdersService.changeStatus (admin)', () => {
  let service: OrdersService;

  let lockedOrder: { id: string; status: OrderStatus; items: object[] } | null;
  const queryBuilder = {
    setLock: vi.fn().mockReturnThis(),
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn(async () => lockedOrder),
  };
  const manager = {
    getRepository: vi.fn(() => ({ createQueryBuilder: () => queryBuilder })),
    increment: vi.fn(),
    update: vi.fn(),
  };
  const dataSource = {
    transaction: vi.fn((callback: (m: typeof manager) => unknown) =>
      callback(manager),
    ),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersService, { provide: DataSource, useValue: dataSource }],
    }).compile();
    service = module.get(OrdersService);
  });

  // Every (from, to) pair: 5 x 5 = 25 cases, generated from the status list
  const pairs = ORDER_STATUSES.flatMap((from) =>
    ORDER_STATUSES.map((to) => [from, to] as const),
  );

  it.each(pairs)('%s -> %s follows NEXT_STATUSES', async (from, to) => {
    lockedOrder = {
      id: 'o1',
      status: from,
      items: [{ variantId: 4, quantity: 2 }],
    };
    const allowed = NEXT_STATUSES[from].includes(to);

    if (allowed) {
      await expect(service.changeStatus('TS1', to)).resolves.toMatchObject({
        status: to,
      });
      // Only a cancellation gives the stock back
      expect(manager.increment).toHaveBeenCalledTimes(
        to === 'cancelled' ? 1 : 0,
      );
    } else {
      await expect(service.changeStatus('TS1', to)).rejects.toThrow(
        ConflictException,
      );
      expect(manager.update).not.toHaveBeenCalled();
    }
  });

  it('returns 404 for an unknown order', async () => {
    lockedOrder = null;
    await expect(service.changeStatus('TS0', 'confirmed')).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

`pairs` sinh ra **25 test** từ 5 trạng thái (mọi cặp "từ → sang"). Mỗi test tự tính kết quả mong đợi từ `NEXT_STATUSES`, nên kiểm tra được cả những cặp không ai nghĩ tới như `completed → pending`. Kết quả hiện từng dòng: `pending -> confirmed follows NEXT_STATUSES`...

Tạo `test/admin-orders.e2e-spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Order } from './../src/orders/entities/order.entity.js';
import { ProductVariant } from './../src/products/entities/product-variant.entity.js';
import { User } from './../src/users/user.entity.js';
import { bearer } from './auth-helper.js';

describe('Admin orders (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let admin: string;
  let customer: string;
  let variant: ProductVariant;
  const email = `admin-orders-e2e-${Date.now()}@test.local`;

  const placeOrder = async (quantity: number) =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer}`)
        .send({
          items: [{ variantId: variant.id, quantity }],
          shippingName: 'Khách E2E',
          shippingPhone: '0912345678',
          shippingAddress: '1 Test',
        })
        .expect(201)
    ).body as Order;

  const setStatus = (code: string, status: string) =>
    request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${code}/status`)
      .set('Authorization', admin)
      .send({ status });

  const stock = async () =>
    (
      await dataSource
        .getRepository(ProductVariant)
        .findOneByOrFail({ id: variant.id })
    ).stock;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    admin = await bearer(app, 'admin');

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'matkhau123', fullName: 'Khách E2E' });
    customer = res.body.accessToken;
    variant = await dataSource
      .getRepository(ProductVariant)
      .findOneByOrFail({ sku: 'XM-PB10K-BLK' }); // power bank, 80 in stock
  });

  afterAll(async () => {
    const user = await dataSource.getRepository(User).findOneBy({ email });
    if (user) {
      await dataSource.getRepository(Order).delete({ userId: user.id });
      await dataSource.getRepository(User).delete({ id: user.id });
    }
    await dataSource
      .getRepository(ProductVariant)
      .update({ id: variant.id }, { stock: variant.stock });
    await app.close();
  });

  it('a customer cannot use the admin order routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${customer}`)
      .expect(403);
  });

  it('walks an order through its whole life cycle', async () => {
    const order = await placeOrder(1);

    for (const status of ['confirmed', 'shipping', 'completed']) {
      const res = await setStatus(order.code, status).expect(200);
      expect(res.body.status).toBe(status);
    }
    // completed is final
    await setStatus(order.code, 'cancelled').expect(409);
  });

  it('cannot skip a step', async () => {
    const order = await placeOrder(1);
    await setStatus(order.code, 'completed').expect(409);
  });

  it('cancelling a confirmed order gives the stock back', async () => {
    const before = await stock();
    const order = await placeOrder(3);
    await setStatus(order.code, 'confirmed').expect(200);
    expect(await stock()).toBe(before - 3);

    await setStatus(order.code, 'cancelled').expect(200);
    expect(await stock()).toBe(before);
  });

  it('lists orders filtered by status and searched by phone', async () => {
    const order = await placeOrder(1);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/orders?status=pending&q=0912345678')
      .set('Authorization', admin)
      .expect(200);

    expect(res.body.items.map((o: Order) => o.code)).toContain(order.code);
    expect(res.body.items.every((o: Order) => o.status === 'pending')).toBe(
      true,
    );
    // The buyer is included, without the password hash
    expect(res.body.items[0].user.email).toBe(email);
    expect(res.body.items[0].user).not.toHaveProperty('passwordHash');
  });
});
```

Test e2e dùng pin dự phòng (`XM-PB10K-BLK`), và `afterAll` xoá đơn, xoá khách, trả tồn kho như các test đơn hàng trước.

## Bước 5: Thử trên Swagger

Đăng nhập admin, **Authorize**, nhóm **Admin: Đơn hàng**:

1. `GET /admin/orders` với `status = pending`: thấy các đơn đã đặt ở Phần 11, kèm `user.email`, `user.fullName`.
2. Copy một `code`, `PATCH /admin/orders/{code}/status` với `{ "status": "completed" }` → 409 (không được bỏ qua bước).
3. Lần lượt `confirmed` → `shipping` → `completed` → mỗi bước 200.
4. Thử `{ "status": "cancelled" }` trên đơn vừa `completed` → 409.
5. Đặt đơn mới (nhóm Đơn hàng, bằng tài khoản khách), xác nhận nó, rồi huỷ bằng admin. Chạy `SELECT sku, stock FROM ProductVariants WHERE id = ...` trước và sau để thấy kho được trả lại.

## Kiểm tra

- [ ] Admin xem được mọi đơn, lọc theo trạng thái, tìm theo mã/SĐT/tên; khách gọi → 403
- [ ] Chỉ chuyển được theo đúng quy trình; sai bước → 409, dữ liệu không đổi
- [ ] Huỷ đơn (`pending` hoặc `confirmed`) trả lại tồn kho
- [ ] `npm run lint`, `npm test` (25 test chuyển trạng thái), `npm run test:e2e` đều qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Cửa hàng muốn cho phép huỷ cả khi đang giao (`shipping → cancelled`, ví dụ khách từ chối nhận hàng). Sửa **một dòng** trong `NEXT_STATUSES`, chạy `npm test`: bao nhiêu test thay đổi kết quả? Vì sao không phải sửa test nào? Nhớ trả lại.
2. Lưu lịch sử chuyển trạng thái (ai đổi, lúc nào): thiết kế bảng `OrderStatusHistory(id, orderId, fromStatus, toStatus, changedBy, changedAt)` bằng T-SQL như Phần 4, rồi ghi một dòng trong `changeStatus` (cùng transaction).
