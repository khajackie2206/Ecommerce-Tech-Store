## Mục tiêu

Ba API cho khách hàng (cần đăng nhập), chỉ thấy và thao tác trên **đơn của chính mình**:

| Method | URL | Kết quả |
|---|---|---|
| GET | `/api/v1/orders?page=1&limit=10` | Lịch sử đơn hàng, mới nhất trước, kèm các dòng hàng |
| GET | `/api/v1/orders/:code` | Chi tiết một đơn. Đơn của người khác → **404** (như không tồn tại) |
| PATCH | `/api/v1/orders/:code/cancel` | Huỷ đơn **đang chờ xác nhận** và trả lại tồn kho. Đơn đã xác nhận, đã huỷ → **409** |

**Làm sau:** task "API đặt hàng: transaction trừ tồn kho" (cùng sửa `orders.service.ts`, `orders.controller.ts`).

**Đọc trước:** task trước (transaction, khoá dòng). Task này dùng lại cả hai.

## Vì sao huỷ đơn cũng cần transaction và khoá?

Huỷ đơn làm hai việc: đổi `status` thành `cancelled` **và** cộng lại tồn kho cho từng dòng. Thiếu transaction, lỗi xảy ra giữa chừng sẽ để lại đơn đã huỷ mà kho chưa được cộng, hoặc ngược lại.

Thiếu khoá thì có chuyện khác: khách bấm "Huỷ" hai lần thật nhanh (hoặc mạng chậm nên trình duyệt gửi lại). Cả hai request cùng đọc thấy `pending`, cùng cộng kho: kho được cộng **hai lần**. Khoá dòng `Orders` buộc request thứ hai chờ, và khi tới lượt nó đọc thấy `cancelled` → 409.

## Bước 1: DTO phân trang dùng chung

Nhiều danh sách cần `?page=&limit=` (lịch sử đơn, danh sách đơn của admin ở Phần 12...). Tạo `src/common/dto/pagination-query.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

// ?page=&limit= shared by every paginated list (order history, admin lists...).
// Extend it to add filters: class ListAdminOrdersQueryDto extends PaginationQueryDto {...}
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number) // query string values are strings: "2" -> 2
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page = 1;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(50, { message: 'limit tối đa là 50' })
  limit = 10;
}

// Shape of every paginated response
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
```

- `page = 1`, `limit = 10`: giá trị mặc định khi không gửi. Hoạt động được nhờ `transform: true` của `ValidationPipe` (Phần 3): DTO được tạo bằng `new`, nên giá trị khởi tạo có hiệu lực.
- `@Type(() => Number)`: mọi thứ trên query string đều là chuỗi, phải đổi sang số trước khi `@IsInt` kiểm tra.
- `Paginated<T>`: kiểu chung cho kết quả có phân trang, `T` là kiểu của từng phần tử (generic của TypeScript).

## Bước 2: Service

Thay toàn bộ `src/orders/orders.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type {
  Paginated,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import { Order } from './entities/order.entity.js';
import { generateOrderCode } from './order-code.js';

// Shipping rule of the shop: free from 2,000,000 VND, otherwise a flat fee
export const FREE_SHIPPING_FROM = 2_000_000;
export const SHIPPING_FEE = 30_000;

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

Phần mới so với task trước:
- `findAndCount`: một lần gọi trả về cả **trang dữ liệu** (`skip`, `take`) và **tổng số dòng**. Với `relations`, TypeORM tự tách thành nhiều câu SQL để phân trang theo **đơn** chứ không theo dòng hàng.
- `findMineByCode`: `where: { code, userId }`. Đơn của người khác thì không tìm thấy, trả 404 giống hệt đơn không tồn tại. Nếu trả 403 "không phải đơn của bạn", kẻ xấu biết được mã đó **có tồn tại**.
- `cancelMine`: khoá dòng đơn hàng (`setLock`), kiểm tra `status`, cộng lại kho (`restoreStock`), rồi `manager.update(...)`. Mọi bước dùng `manager` của transaction.
- `restoreStock` để `private` và nhận `manager` làm tham số: Phần 12 (admin huỷ đơn) dùng lại đúng hàm này.
- `manager.update(Order, { id }, { status: 'cancelled' })` sinh ra `UPDATE Orders SET status = @0, updatedAt = @1 WHERE id = @2`: TypeORM tự cập nhật cột `@UpdateDateColumn`.

## Bước 3: Controller

Thay toàn bộ `src/orders/orders.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService } from './orders.service.js';

// Customer side of orders. Not @Public(): every route needs a logged-in user,
// and every query is limited to that user's own orders.
@ApiTags('Đơn hàng')
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({
    summary: 'Đặt hàng: kiểm tra tồn kho, trừ kho, lưu đơn (một transaction)',
  })
  @ApiBadRequestResponse({
    description: 'Dữ liệu không hợp lệ hoặc phiên bản không còn bán',
  })
  @ApiConflictResponse({ description: 'Không đủ hàng' })
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrderDto) {
    // The user id comes from the token, never from the body
    return this.ordersService.create(user.sub, dto);
  }

  @ApiOperation({ summary: 'Lịch sử đơn hàng của tôi, mới nhất trước' })
  @Get()
  findMine(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.ordersService.findMine(user.sub, query);
  }

  @ApiOperation({ summary: 'Chi tiết một đơn hàng của tôi' })
  @ApiNotFoundResponse({ description: 'Không có đơn này trong tài khoản' })
  @Get(':code')
  findMineByCode(@CurrentUser() user: JwtPayload, @Param('code') code: string) {
    return this.ordersService.findMineByCode(user.sub, code);
  }

  @ApiOperation({
    summary: 'Huỷ đơn đang chờ xác nhận, trả lại tồn kho (một transaction)',
  })
  @ApiNotFoundResponse({ description: 'Không có đơn này trong tài khoản' })
  @ApiConflictResponse({ description: 'Đơn đã được xác nhận, không huỷ được' })
  @Patch(':code/cancel')
  cancelMine(@CurrentUser() user: JwtPayload, @Param('code') code: string) {
    return this.ordersService.cancelMine(user.sub, code);
  }
}
```

- `@Patch(':code/cancel')`: huỷ là một **hành động**, không phải gửi lại cả đơn. Kiểu URL "danh từ/:id/động từ" hay gặp cho các hành động như vậy.
- Không route nào nhận `userId` từ URL hay body: luôn là `user.sub` trong token.

## Bước 4: Test

Tạo `src/orders/orders.service.cancel.spec.ts` (file riêng cho phần huỷ đơn, để file test của task trước giữ nguyên):

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { OrderStatus } from './entities/order.entity.js';
import { OrdersService } from './orders.service.js';

describe('OrdersService.cancelMine', () => {
  let service: OrdersService;

  // The order the locking query finds (null = not found / not this customer's)
  let lockedOrder: object | null = null;
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

  const orderWith = (status: OrderStatus) => ({
    id: 'order-1',
    code: 'TS261111ABCDEF',
    status,
    items: [
      { variantId: 4, quantity: 2 },
      { variantId: 45, quantity: 1 },
    ],
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersService, { provide: DataSource, useValue: dataSource }],
    }).compile();
    service = module.get(OrdersService);
  });

  it('cancels a pending order and gives back the stock of every line', async () => {
    lockedOrder = orderWith('pending');

    const order = await service.cancelMine('user-1', 'TS261111ABCDEF');

    expect(order.status).toBe('cancelled');
    expect(manager.increment).toHaveBeenCalledWith(
      expect.anything(),
      { id: 4 },
      'stock',
      2,
    );
    expect(manager.increment).toHaveBeenCalledWith(
      expect.anything(),
      { id: 45 },
      'stock',
      1,
    );
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'order-1' },
      { status: 'cancelled' },
    );
  });

  it.each<OrderStatus>(['confirmed', 'shipping', 'completed', 'cancelled'])(
    'refuses to cancel a %s order with 409, stock untouched',
    async (status) => {
      lockedOrder = orderWith(status);

      await expect(
        service.cancelMine('user-1', 'TS261111ABCDEF'),
      ).rejects.toThrow(ConflictException);
      expect(manager.increment).not.toHaveBeenCalled();
    },
  );

  it("returns 404 for an unknown code or someone else's order", async () => {
    lockedOrder = null;
    await expect(
      service.cancelMine('user-1', 'TS000000XXXXXX'),
    ).rejects.toThrow(NotFoundException);
  });

  it('only looks at orders of the logged-in customer', async () => {
    lockedOrder = orderWith('pending');
    await service.cancelMine('user-1', 'TS261111ABCDEF');
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'o.code = :code AND o.userId = :userId',
      { code: 'TS261111ABCDEF', userId: 'user-1' },
    );
  });
});
```

`it.each<OrderStatus>([...])`: một test cho từng trạng thái **không** được huỷ, kiểm tra luôn là kho không bị cộng.

Thay toàn bộ `test/orders.e2e-spec.ts` (thêm `beforeEach` đặt lại tồn kho và 3 test mới):

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

// Places real orders in SQL Server, then removes them and puts the stock back,
// so the test can run again and again without draining the sample data.
describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let token: string;
  let variant: ProductVariant; // a variant with plenty of stock
  const email = `orders-e2e-${Date.now()}@test.local`;
  const shipping = {
    shippingName: 'Người Test',
    shippingPhone: '0901234567',
    shippingAddress: '1 Đường Test, TP.HCM',
  };

  const placeOrder = (variantId: number, quantity: number) =>
    request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ variantId, quantity }], ...shipping });

  const stockOf = async (id: number) =>
    (await dataSource.getRepository(ProductVariant).findOneByOrFail({ id }))
      .stock;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);

    // A real customer account, so the order has a real userId (FK_Orders_Users)
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'matkhau123', fullName: 'Người Test' });
    token = res.body.accessToken;

    variant = await dataSource
      .getRepository(ProductVariant)
      .findOneByOrFail({ sku: 'SS-TA25W-WHT' }); // 25W charger, 120 in stock
  });

  // Each test starts from the same stock, whatever the previous test did
  beforeEach(async () => {
    await dataSource
      .getRepository(ProductVariant)
      .update({ id: variant.id }, { stock: 50 });
  });

  afterAll(async () => {
    // Undo everything this test did: delete its orders and user, restore the stock
    const user = await dataSource.getRepository(User).findOneBy({ email });
    if (user) {
      // OrderItems go too: FK_OrderItems_Orders has ON DELETE CASCADE
      await dataSource.getRepository(Order).delete({ userId: user.id });
      await dataSource.getRepository(User).delete({ id: user.id });
    }
    await dataSource
      .getRepository(ProductVariant)
      .update({ id: variant.id }, { stock: variant.stock });
    await app.close();
  });

  it('POST /orders saves the order and takes the stock', async () => {
    const before = await stockOf(variant.id);

    const res = await placeOrder(variant.id, 2).expect(201);

    expect(res.body.code).toMatch(/^TS\d{6}[0-9A-Z]{6}$/);
    expect(res.body.status).toBe('pending');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(res.body.subtotal + res.body.shippingFee);
    expect(await stockOf(variant.id)).toBe(before - 2);
  });

  it('POST /orders without a token returns 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({ items: [{ variantId: variant.id, quantity: 1 }], ...shipping })
      .expect(401);
  });

  it('POST /orders asking for more than the stock returns 409 and takes nothing', async () => {
    await dataSource
      .getRepository(ProductVariant)
      .update({ id: variant.id }, { stock: 3 });

    const res = await placeOrder(variant.id, 5).expect(409);

    expect(res.body.message).toContain('chỉ còn 3 sản phẩm');
    expect(await stockOf(variant.id)).toBe(3);
  });

  it('GET /orders lists my orders, newest first', async () => {
    const placed = await placeOrder(variant.id, 1).expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/orders?limit=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items[0].code).toBe(placed.body.code);
    expect(res.body.items[0].items).toHaveLength(1);
    expect(res.body).toMatchObject({ page: 1, limit: 5 });
  });

  it("GET /orders/:code of someone else's order returns 404", async () => {
    const placed = await placeOrder(variant.id, 1).expect(201);
    // Another logged-in customer (token signed by the app, see auth-helper.ts)
    const stranger = await bearer(app, 'customer');

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${placed.body.code}`)
      .set('Authorization', stranger)
      .expect(404);
  });

  it('PATCH /orders/:code/cancel gives the stock back, and only once', async () => {
    const before = await stockOf(variant.id);
    const placed = await placeOrder(variant.id, 2).expect(201);
    expect(await stockOf(variant.id)).toBe(before - 2);

    const cancel = () =>
      request(app.getHttpServer())
        .patch(`/api/v1/orders/${placed.body.code}/cancel`)
        .set('Authorization', `Bearer ${token}`);

    const res = await cancel().expect(200);
    expect(res.body.status).toBe('cancelled');
    expect(await stockOf(variant.id)).toBe(before);

    await cancel().expect(409); // already cancelled: no second refund of stock
    expect(await stockOf(variant.id)).toBe(before);
  });

  it('two customers buying the last unit at the same time: only one wins', async () => {
    // Leave exactly 1 unit, then fire two orders at once
    await dataSource
      .getRepository(ProductVariant)
      .update({ id: variant.id }, { stock: 1 });

    const results = await Promise.all([
      placeOrder(variant.id, 1),
      placeOrder(variant.id, 1),
    ]);

    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(await stockOf(variant.id)).toBe(0); // never negative
  });
});
```

- `beforeEach` đưa tồn kho về 50 trước **mỗi** test. Thiếu nó, test trước để lại tồn kho 3 (test 409) và test sau hết hàng một cách khó hiểu. Mỗi test phải tự chuẩn bị dữ liệu, không trông chờ vào test chạy trước.
- Test "someone else's order" dùng `bearer(app, 'customer')` của Phần 7: một token hợp lệ của **người khác**.
- Test huỷ gọi `cancel()` hai lần: lần hai phải 409 và kho không được cộng thêm.

## Bước 5: Gọi thử

Thêm vào `server/requests/orders.http`:

```http
### My orders (page 1)
GET {{baseUrl}}/orders?page=1&limit=5
Authorization: Bearer {{login.response.body.$.accessToken}}

### One order: replace the code with one from the list
GET {{baseUrl}}/orders/TS261111XC7Z9T
Authorization: Bearer {{login.response.body.$.accessToken}}

### Cancel it -> 200 status "cancelled"; again -> 409
PATCH {{baseUrl}}/orders/TS261111XC7Z9T/cancel
Authorization: Bearer {{login.response.body.$.accessToken}}
```

Trước và sau khi huỷ, chạy `SELECT sku, stock FROM ProductVariants WHERE id = 4;` để thấy kho được cộng lại. Với `DB_LOGGING=true`, log của request huỷ có `BEGIN TRANSACTION`, `SELECT ... FROM "Orders" "o" WITH (UPDLOCK, ROWLOCK)`, các `UPDATE ... SET "stock" = "stock" + 2`, `UPDATE "Orders" SET "status" = ...`, `COMMIT`.

## Kiểm tra

- [ ] Lịch sử chỉ có đơn của tài khoản đang đăng nhập, mới nhất trước, có `total`, `page`, `limit`
- [ ] Đơn của người khác → 404; huỷ đơn `pending` → kho được cộng lại; huỷ lần hai → 409
- [ ] Giải thích được vì sao trả 404 chứ không phải 403 cho đơn của người khác, và vì sao huỷ đơn cần khoá dòng
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm bộ lọc `?status=pending` cho `GET /orders`: tạo `ListMyOrdersQueryDto extends PaginationQueryDto` có thêm `status?: OrderStatus` (`@IsOptional() @IsIn(ORDER_STATUSES)`), rồi thêm vào `where` khi có.
2. Gửi `GET /orders?limit=100`: 400 "limit tối đa là 50". Vì sao API nên luôn có giới hạn `limit`?
