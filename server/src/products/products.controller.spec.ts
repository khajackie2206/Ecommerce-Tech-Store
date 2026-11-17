import { Test, TestingModule } from '@nestjs/testing';
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

describe('ProductsController', () => {
  let controller: ProductsController;

  // Fake service: list and detail return recognisable values
  const fakeService = {
    findAll: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 12 }),
    findBySlug: vi.fn().mockResolvedValue({ slug: 'iphone-17' }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: fakeService }],
    }).compile();

    controller = module.get(ProductsController);
  });

  it('findAll passes the parsed query string to the service', async () => {
    const query = {
      category: 'laptop',
      page: 1,
      limit: 12,
    } as ListProductsQueryDto;

    await expect(controller.findAll(query)).resolves.toMatchObject({
      total: 0,
    });
    expect(fakeService.findAll).toHaveBeenCalledWith(query);
  });

  it('findBySlug passes the slug to the service', async () => {
    await expect(controller.findBySlug('iphone-17')).resolves.toEqual({
      slug: 'iphone-17',
    });
    expect(fakeService.findBySlug).toHaveBeenCalledWith('iphone-17');
  });
});
