import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

describe('ProductsController', () => {
  let controller: ProductsController;

  // The controller only talks to the service, so a fake service is enough here
  const fakeService = {
    findBySlug: vi.fn().mockResolvedValue({ slug: 'iphone-17' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: fakeService }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes the slug to the service', async () => {
    await expect(controller.findBySlug('iphone-17')).resolves.toEqual({
      slug: 'iphone-17',
    });
    expect(fakeService.findBySlug).toHaveBeenCalledWith('iphone-17');
  });
});
