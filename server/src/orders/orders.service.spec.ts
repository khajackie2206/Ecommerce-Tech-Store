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
