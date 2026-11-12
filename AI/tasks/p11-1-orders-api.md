## Mục tiêu

API đặt hàng `POST /api/v1/orders` (cần đăng nhập):

1. Nhận giỏ hàng (`variantId`, `quantity`) và thông tin giao hàng.
2. **Khoá** các dòng phiên bản trong database, kiểm tra còn bán và đủ hàng.
3. Trừ tồn kho, tính tiền, lưu đơn `Orders` và các dòng `OrderItems`.

Tất cả nằm trong **một transaction**: hoặc mọi bước thành công, hoặc không có gì thay đổi.

| Tình huống | Kết quả |
|---|---|
| Hợp lệ | **201** + đơn hàng (mã `TS261111XC7Z9T`, `status: "pending"`) |
| Chưa đăng nhập | **401** |
| Body sai (số lượng 0, trùng phiên bản, thiếu địa chỉ, gửi kèm `price`...) | **400** |
| Phiên bản không tồn tại hoặc đã ẩn | **400** "Phiên bản #99999 không còn được bán" |
| Không đủ hàng | **409** "\"iPhone 17 Pro Max 1TB - Cam vũ trụ\" chỉ còn 2 sản phẩm" |
| Hai người cùng mua chiếc cuối cùng | Một người 201, người kia 409. Tồn kho không bao giờ âm |

**Làm sau:** Phần 7 (cần đăng nhập) và task "Exception filter cho lỗi SQL Server" (Phần 6). Làm **song song** được với task "Trang thanh toán" ở frontend nếu hai bạn thống nhất trước body của request (bảng ở Bước 3).

**Đọc trước:** task "Đọc hiểu schema.sql" (Phần 4) phần bảng `Orders`, `OrderItems`; giáo trình Bài 8 (transaction).

## Ba ý tưởng chính của bài

**1. Transaction.** Đặt một đơn gồm nhiều câu SQL: trừ kho từng phiên bản, `INSERT` đơn, `INSERT` từng dòng. Nếu đã trừ kho mà `INSERT` đơn lỗi, kho bị trừ oan. Transaction gom chúng lại: `BEGIN TRANSACTION` ... `COMMIT` nếu mọi thứ ổn, `ROLLBACK` (huỷ hết) nếu có lỗi.

**2. Khoá dòng (row lock).** Còn 1 chiếc, hai khách bấm "Đặt hàng" cùng lúc. Nếu cả hai cùng đọc thấy `stock = 1` rồi cùng trừ thì tồn kho thành -1 (`CK_ProductVariants_stock` sẽ chặn, nhưng khách thứ hai nhận lỗi khó hiểu). Ta đọc phiên bản bằng `SELECT ... WITH (UPDLOCK, ROWLOCK)`: transaction nào khoá trước thì làm trước, transaction sau **phải chờ** tới khi transaction trước `COMMIT`, rồi mới đọc được số tồn kho **mới**.

**3. Không tin giá từ trình duyệt.** Body chỉ có `variantId` và `quantity`. Tên, giá đều do server đọc từ database rồi **chép vào** `OrderItems` (gọi là *snapshot*): sau này cửa hàng đổi giá hay đổi tên sản phẩm, đơn cũ vẫn ghi đúng thứ khách đã mua với giá đã trả.

## Bước 1: Sinh khung

```powershell
cd server
npx nest g module orders
npx nest g controller orders
npx nest g service orders
```

## Bước 2: Entity

Tạo `src/orders/entities/order.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../../users/user.entity.js';
import { OrderItem } from './order-item.entity.js';

// The values CK_Orders_status / CK_Orders_paymentMethod allow in schema.sql
export const ORDER_STATUSES = [
  'pending', // just placed, waiting for the shop to confirm
  'confirmed',
  'shipping',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ['cod', 'bank_transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Maps the existing Orders table (database/schema.sql)
@Entity('Orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Short code shown to customers, e.g. TS261108K3P9QZ
  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ type: 'uniqueidentifier' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: OrderStatus;

  @Column({ type: 'varchar', length: 20, default: 'cod' })
  paymentMethod: PaymentMethod;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  shippingFee: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  total: number;

  @Column({ type: 'nvarchar', length: 100 })
  shippingName: string;

  @Column({ type: 'varchar', length: 20 })
  shippingPhone: string;

  @Column({ type: 'nvarchar', length: 500 })
  shippingAddress: string;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  note: string | null;

  // cascade insert: saving an Order with items inserts the OrderItems too
  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items: Relation<OrderItem>[];

  @CreateDateColumn({ type: 'datetime2' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime2' })
  updatedAt: Date;
}
```

Tạo `src/orders/entities/order-item.entity.ts`:

```ts
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Order } from './order.entity.js';

// One line of an order. Name and price are COPIED from the product at the time of
// purchase (a snapshot): if the shop later renames the product or changes its price,
// old orders must still show what the customer actually bought and paid.
@Entity('OrderItems')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uniqueidentifier' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  // Still points at the variant (for stock, reports), but no relation is needed here
  @Column({ type: 'int' })
  variantId: number;

  @Column({ type: 'nvarchar', length: 200 })
  productName: string;

  @Column({ type: 'nvarchar', length: 150 })
  variantName: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  unitPrice: number;

  @Column({ type: 'int' })
  quantity: number;
}
```

Giải thích:
- `ORDER_STATUSES`, `PAYMENT_METHODS` khớp với `CK_Orders_status`, `CK_Orders_paymentMethod` trong `schema.sql`, cùng cách làm với `USER_ROLES` ở Phần 7.
- `cascade: ['insert']`: lưu một `Order` có mảng `items` thì TypeORM tự `INSERT` luôn các `OrderItem`. Chỉ cascade `insert`: dòng đơn hàng không bao giờ bị sửa hay xoá qua `Order`.
- `userId` có kiểu `uniqueidentifier` vì `Users.id` là GUID (Phần 7).
- `OrderItem` chỉ giữ `variantId`, không khai báo quan hệ tới `ProductVariant`: đơn hàng không cần đọc lại phiên bản, đã có snapshot.

## Bước 3: DTO

Tạo `src/orders/dto/create-order.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../entities/order.entity.js';

// One line of the cart. Only ids and quantities: the server looks up names and
// prices itself. Never trust a price sent by the browser.
export class OrderLineDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'variantId phải là số nguyên' })
  @Min(1, { message: 'variantId không hợp lệ' })
  variantId: number;

  @ApiProperty({ example: 1 })
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng tối thiểu là 1' })
  @Max(10, { message: 'Mỗi sản phẩm mua tối đa 10 chiếc' })
  quantity: number;
}

// Body accepted by POST /api/v1/orders
export class CreateOrderDto {
  // @ValidateNested + @Type: validate EVERY element of the array as an OrderLineDto
  // (without them class-validator only checks "is it an array" and lets anything in)
  @ArrayMinSize(1, { message: 'Giỏ hàng đang trống' })
  @ArrayMaxSize(20, { message: 'Tối đa 20 dòng sản phẩm mỗi đơn' })
  @ArrayUnique((line: OrderLineDto) => line.variantId, {
    message: 'Mỗi phiên bản chỉ được xuất hiện một lần',
  })
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items: OrderLineDto[];

  @ApiProperty({ example: 'Trần Thị Bình' })
  @IsString({ message: 'Tên người nhận phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên người nhận không được để trống' })
  @MaxLength(100, { message: 'Tên người nhận tối đa 100 ký tự' })
  shippingName: string;

  @ApiProperty({ example: '0901234567' })
  @Matches(/^0\d{9}$/, {
    message: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0',
  })
  shippingPhone: string;

  @ApiProperty({ example: '12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM' })
  @IsString({ message: 'Địa chỉ phải là chuỗi' })
  @IsNotEmpty({ message: 'Địa chỉ không được để trống' })
  @MaxLength(500, { message: 'Địa chỉ tối đa 500 ký tự' })
  shippingAddress: string;

  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;

  @IsOptional()
  @IsIn(PAYMENT_METHODS, {
    message: `Phương thức thanh toán: ${PAYMENT_METHODS.join(', ')}`,
  })
  paymentMethod?: PaymentMethod;
}
```

Body mẫu:

```json
{
  "items": [
    { "variantId": 4, "quantity": 1 },
    { "variantId": 45, "quantity": 2 }
  ],
  "shippingName": "Trần Thị Bình",
  "shippingPhone": "0901234567",
  "shippingAddress": "12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM",
  "note": "Giao giờ hành chính",
  "paymentMethod": "cod"
}
```

Giải thích:
- **Mảng object** cần ba decorator đi cùng nhau: `@ValidateNested({ each: true })` (kiểm tra từng phần tử), `@Type(() => OrderLineDto)` (để class-transformer biết đổi phần tử thành class nào). Thiếu một trong hai, các quy tắc trong `OrderLineDto` **không chạy**, khách gửi `quantity: -5` cũng lọt.
- `@ArrayUnique(line => line.variantId)`: cùng một phiên bản không được xuất hiện hai dòng. Giỏ hàng ở frontend phải gộp thành một dòng tăng số lượng.
- `@Max(10)` mỗi dòng, `@ArrayMaxSize(20)`: giới hạn hợp lý cho cửa hàng bán lẻ, chặn đơn bất thường.
- Lỗi trong mảng có tiền tố vị trí: `items.0.Số lượng tối thiểu là 1` là dòng đầu tiên.

## Bước 4: Mã đơn hàng

Tạo `src/orders/order-code.ts`:

```ts
import { randomInt } from 'node:crypto';

// Order code shown to customers: "TS" + date (yyMMdd, Vietnam time) + 6 random characters,
// e.g. TS261108K3P9QZ. Random, not 0001, 0002...: a counter would need a query per order
// and would tell competitors how many orders the shop gets per day.
// UQ_Orders_code in the database is the safety net against the (tiny) chance of a repeat.
export function generateOrderCode(now = new Date()): string {
  const vietnamTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const date = vietnamTime.toISOString().slice(2, 10).replaceAll('-', ''); // "261108"
  const random = randomInt(0, 36 ** 6) // 0 .. 2 176 782 335
    .toString(36) // base 36: digits + letters
    .toUpperCase()
    .padStart(6, '0');
  return `TS${date}${random}`;
}
```

`randomInt` của `node:crypto` an toàn hơn `Math.random()` (không đoán được). `toString(36)` đổi số sang hệ 36 (0-9, a-z), nên 6 ký tự có hơn 2 tỷ khả năng mỗi ngày.

## Bước 5: Service

Thay toàn bộ `src/orders/orders.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
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

Giải thích theo thứ tự chạy:
1. `this.dataSource.transaction(async (manager) => {...})`: TypeORM mở transaction và đưa vào một `EntityManager` gắn với transaction đó. **Mọi** câu truy vấn bên trong phải đi qua `manager`. Lỡ dùng một repository inject từ constructor thì câu đó chạy trên kết nối khác, **ngoài** transaction, không được rollback và có thể kẹt chờ chính khoá của mình.
2. `lockVariants`: `setLock('pessimistic_write')` sinh ra `WITH (UPDLOCK, ROWLOCK)` cho SQL Server. Khoá giữ tới khi transaction kết thúc. Kết quả được đưa vào `Map` để tra theo `id` cho nhanh.
3. Kiểm tra **mọi** dòng trước khi ghi bất cứ thứ gì. Dòng nào lỗi thì `throw`, transaction rollback.
4. `variant.salePrice ?? variant.price`: giá khách trả là giá khuyến mãi nếu có.
5. `manager.decrement(...)`: `UPDATE ... SET stock = stock - 2`. Trừ ngay trong SQL, không đọc rồi ghi lại.
6. Phí ship: miễn phí từ 2.000.000đ, dưới đó 30.000đ. `total = subtotal + shippingFee` cũng được `CK_Orders_total` kiểm tra lại trong database.
7. `manager.save(order)`: `INSERT` đơn, rồi `INSERT` các dòng nhờ cascade. Callback trả về đơn đã lưu, transaction `COMMIT`.

Câu `SELECT` khoá cả dòng `Products` vì có `JOIN` sang bảng này. Hệ quả: hai đơn mua **hai phiên bản khác nhau của cùng một sản phẩm** cũng phải chờ nhau một chút. Với cửa hàng nhỏ thì không đáng kể; cửa hàng lớn sẽ đọc sản phẩm bằng một câu riêng không khoá.

## Bước 6: Controller và module

Thay toàn bộ `src/orders/orders.controller.ts`:

```ts
import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
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
}
```

Thay toàn bộ `src/orders/orders.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from './entities/order-item.entity.js';
import { Order } from './entities/order.entity.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  // Registers the entities (autoLoadEntities). The service works through
  // DataSource/EntityManager inside transactions, so no repository is injected.
  imports: [TypeOrmModule.forFeature([Order, OrderItem])],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
```

- Không có `@Public()`: `AuthGuard` (Phần 7) bắt buộc phải đăng nhập.
- `user.sub` lấy từ token: **không bao giờ** nhận `userId` từ body, nếu không khách A đặt hàng được dưới tên khách B.
- `@ApiUnauthorizedResponse` đặt trên class: áp dụng cho mọi route của controller.

Kiểm tra `src/app.module.ts` đã có `OrdersModule` trong `imports` (CLI tự thêm ở Bước 1).

## Bước 7: Unit test

Thay toàn bộ `src/orders/orders.service.spec.ts`:

```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService, SHIPPING_FEE } from './orders.service.js';

// A variant row as the locking query returns it (with its product joined)
const variant = (data: object) => ({
  id: 4,
  name: '1TB - Cam vũ trụ',
  price: 50990000,
  salePrice: null,
  stock: 4,
  isActive: true,
  product: { name: 'iPhone 17 Pro Max', isActive: true },
  ...data,
});

const shipping = {
  shippingName: 'Trần Thị Bình',
  shippingPhone: '0901234567',
  shippingAddress: '12 Nguyễn Huệ, Q1',
};

describe('OrdersService.create', () => {
  let service: OrdersService;

  // Fake EntityManager: the locking query returns `lockedRows`, writes are recorded
  let lockedRows: object[] = [];
  const queryBuilder = {
    setLock: vi.fn().mockReturnThis(),
    innerJoinAndSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getMany: vi.fn(async () => lockedRows),
  };
  const manager = {
    getRepository: vi.fn(() => ({ createQueryBuilder: () => queryBuilder })),
    decrement: vi.fn(),
    create: vi.fn((_entity: unknown, data: object) => data),
    save: vi.fn(async (data: object) => ({ id: 'new-order', ...data })),
  };
  // transaction(callback) simply runs the callback with the fake manager
  const dataSource = {
    transaction: vi.fn((callback: (m: typeof manager) => unknown) =>
      callback(manager),
    ),
  };

  const order = (items: CreateOrderDto['items']) =>
    service.create('user-1', { items, ...shipping });

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersService, { provide: DataSource, useValue: dataSource }],
    }).compile();
    service = module.get(OrdersService);
  });

  it('copies name and price, takes the stock and computes the totals', async () => {
    lockedRows = [variant({ salePrice: 48990000 })];

    const saved = await order([{ variantId: 4, quantity: 2 }]);

    expect(saved).toMatchObject({
      userId: 'user-1',
      paymentMethod: 'cod',
      subtotal: 97980000, // the sale price is what the customer pays
      shippingFee: 0,
      total: 97980000,
      items: [
        {
          variantId: 4,
          productName: 'iPhone 17 Pro Max',
          variantName: '1TB - Cam vũ trụ',
          unitPrice: 48990000,
          quantity: 2,
        },
      ],
    });
    expect(saved).toHaveProperty('code', expect.stringMatching(/^TS\d{6}/));
    expect(manager.decrement).toHaveBeenCalledWith(
      expect.anything(),
      { id: 4 },
      'stock',
      2,
    );
  });

  it('charges shipping below the free shipping threshold', async () => {
    lockedRows = [variant({ id: 45, price: 290000 })];

    const saved = await order([{ variantId: 45, quantity: 1 }]);

    expect(saved).toMatchObject({
      subtotal: 290000,
      shippingFee: SHIPPING_FEE,
      total: 290000 + SHIPPING_FEE,
    });
  });

  it('refuses when the stock is too low, before touching anything', async () => {
    lockedRows = [variant({ stock: 1 })];

    await expect(order([{ variantId: 4, quantity: 2 }])).rejects.toThrow(
      ConflictException,
    );
    expect(manager.decrement).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown variant', []],
    ['a hidden variant', [variant({ isActive: false })]],
    [
      'a variant of a hidden product',
      [variant({ product: { name: 'X', isActive: false } })],
    ],
  ])('refuses %s with 400', async (_case, rows) => {
    lockedRows = rows;
    await expect(order([{ variantId: 4, quantity: 1 }])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('locks the variant rows it reads', async () => {
    lockedRows = [variant({})];
    await order([{ variantId: 4, quantity: 1 }]);
    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
  });
});
```

- `DataSource` giả chỉ có `transaction(callback)`, và nó chỉ đơn giản gọi `callback(manager)` với `manager` giả. Đủ để kiểm tra **logic** của service: tính tiền, snapshot, thứ tự kiểm tra trước, ghi sau.
- Test "refuses when the stock is too low" kiểm tra cả việc **không** gọi `decrement` và `save`.
- Unit test **không** kiểm tra được khoá và rollback thật: chúng là việc của SQL Server. Việc đó để test e2e làm.

## Bước 8: Test e2e, gồm cả "hai người mua chiếc cuối cùng"

Tạo `test/orders.e2e-spec.ts`:

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

- `beforeAll` đăng ký một khách thật (đơn hàng cần `userId` tồn tại, `FK_Orders_Users`), chọn một phiên bản nhiều hàng (sạc 25W).
- `afterAll` **dọn sạch**: xoá đơn (các dòng tự xoá theo `ON DELETE CASCADE`), xoá khách, trả tồn kho về số ban đầu. Nhờ vậy chạy test bao nhiêu lần dữ liệu mẫu cũng không cạn.
- Test cuối đặt `stock = 1`, bắn **hai** request cùng lúc bằng `Promise.all`. Khoá dòng đảm bảo đúng một request 201, một request 409, tồn kho về 0.

```powershell
npm test
npm run test:e2e
```

## Bước 9: Gọi thử

Tạo `server/requests/orders.http` (đăng nhập bằng request `login` trong `auth.http` trước, hoặc dùng Swagger + **Authorize**):

```http
@baseUrl = http://localhost:3000/api/v1

### Login first
# @name login
POST {{baseUrl}}/auth/login
Content-Type: application/json

{ "email": "binh@mail.com", "password": "matkhau123" }

### Place an order: 2 x "iPhone 17 Pro Max 1TB" (variant 4) -> 201
POST {{baseUrl}}/orders
Authorization: Bearer {{login.response.body.$.accessToken}}
Content-Type: application/json

{
  "items": [{ "variantId": 4, "quantity": 2 }],
  "shippingName": "Trần Thị Bình",
  "shippingPhone": "0901234567",
  "shippingAddress": "12 Nguyễn Huệ, Quận 1, TP.HCM"
}

### Cheap order -> shippingFee 30000
POST {{baseUrl}}/orders
Authorization: Bearer {{login.response.body.$.accessToken}}
Content-Type: application/json

{
  "items": [{ "variantId": 45, "quantity": 2 }],
  "shippingName": "Trần Thị Bình",
  "shippingPhone": "0901234567",
  "shippingAddress": "12 Nguyễn Huệ, Quận 1, TP.HCM",
  "paymentMethod": "bank_transfer"
}
```

`id` của phiên bản trên máy bạn có thể khác: xem trong `GET /products/iphone-17-pro-max`. Sau mỗi đơn, chạy trong VS Code (database `TechStoreDb`):

```sql
SELECT TOP 5 code, status, subtotal, shippingFee, total, createdAt FROM Orders ORDER BY createdAt DESC;
SELECT o.code, i.productName, i.variantName, i.unitPrice, i.quantity
FROM OrderItems i JOIN Orders o ON o.id = i.orderId ORDER BY o.createdAt DESC;
SELECT sku, stock FROM ProductVariants WHERE id IN (4, 45);
```

Bật `DB_LOGGING=true` rồi đặt một đơn, đọc log: `BEGIN TRANSACTION`, câu `SELECT ... WITH (UPDLOCK, ROWLOCK)`, các `UPDATE ... SET "stock" = "stock" - 2`, `INSERT INTO "Orders"`, `INSERT INTO "OrderItems"`, `COMMIT`.

## Kiểm tra

- [ ] Đặt hàng thành công, tồn kho giảm đúng, `OrderItems` có tên và giá snapshot
- [ ] Đơn dưới 2.000.000đ có `shippingFee: 30000`, `total = subtotal + shippingFee`
- [ ] Không đủ hàng → 409, tồn kho không đổi; test "only one wins" qua
- [ ] Giải thích được: vì sao phải dùng `manager` trong transaction; `UPDLOCK` giải quyết chuyện gì; vì sao không nhận giá và `userId` từ body
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. **Thấy rollback tận mắt.** Tạm thay dòng `return manager.save(order);` bằng `throw new Error('Simulated failure after taking stock');`. Đặt một đơn: API trả 500, log có `ROLLBACK`, và tồn kho **không** giảm dù dòng `UPDATE` đã chạy. Nhớ trả lại như cũ.
2. **Bỏ khoá xem chuyện gì xảy ra.** Tạm xoá dòng `.setLock('pessimistic_write')`, chạy `npm run test:e2e`: test "only one wins" **vẫn qua**, vì hai request hiếm khi đọc đúng cùng một khoảnh khắc. Lỗi đồng thời đáng sợ ở chỗ đó: thử mãi không thấy, chạy thật lâu lâu mới gặp. Giờ nới rộng khoảnh khắc ấy: thêm `await new Promise((resolve) => setTimeout(resolve, 500));` ngay **trước** dòng `const items = dto.items.map(...)`, chạy lại. Test đỏ: request thua nhận **400** "Dữ liệu không hợp lệ" thay vì 409. Cả hai cùng đọc thấy còn 1, cùng trừ, và chỉ có `CK_ProductVariants_stock` (lỗi 547 qua filter của Phần 6) chặn được tồn kho âm. Trả lại `setLock`, giữ nguyên dòng chờ, chạy lại: test xanh, vì request sau phải đợi request trước xong. Cuối cùng xoá dòng chờ. Bài học: khoá dòng cho thông báo đúng, ràng buộc `CHECK` là lưới an toàn cuối cùng. Cần **cả hai lớp**.
3. Đổi quy tắc phí ship thành đọc từ `.env` (`FREE_SHIPPING_FROM`, `SHIPPING_FEE`) qua `ConfigService`.
