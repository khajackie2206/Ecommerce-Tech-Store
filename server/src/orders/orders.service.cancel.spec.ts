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
