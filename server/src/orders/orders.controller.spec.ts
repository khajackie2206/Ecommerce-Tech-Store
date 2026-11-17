import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload } from '../auth/jwt-payload.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

describe('OrdersController', () => {
  let controller: OrdersController;
  // Fake service: the controller only forwards to it
  const ordersService = { create: vi.fn() };
  const user: JwtPayload = {
    sub: 'user-1',
    email: 'an@mail.com',
    role: 'customer',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: ordersService }],
    }).compile();

    controller = module.get(OrdersController);
  });

  it('create takes the user id from the token, not from the body', async () => {
    ordersService.create.mockResolvedValue({ code: 'TS261113ABC123' });
    const dto = {
      items: [{ variantId: 4, quantity: 1 }],
      shippingName: 'Trần Thị Bình',
      shippingPhone: '0901234567',
      shippingAddress: '12 Nguyễn Huệ, Q1',
    } as CreateOrderDto;

    await expect(controller.create(user, dto)).resolves.toEqual({
      code: 'TS261113ABC123',
    });
    expect(ordersService.create).toHaveBeenCalledWith('user-1', dto);
  });
});
