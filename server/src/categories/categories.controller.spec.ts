import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

describe('CategoriesController', () => {
  let controller: CategoriesController;

  // The controller only talks to the service, so a fake service is enough here
  const fakeService = {
    findAll: vi.fn().mockResolvedValue([{ id: 1, slug: 'dien-thoai' }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: fakeService }],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns what the service returns', async () => {
    await expect(controller.findAll()).resolves.toEqual([
      { id: 1, slug: 'dien-thoai' },
    ]);
  });
});
