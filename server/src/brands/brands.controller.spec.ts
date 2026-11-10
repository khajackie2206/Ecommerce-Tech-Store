import { Test, TestingModule } from '@nestjs/testing';
import { BrandsController } from './brands.controller.js';
import { BrandsService } from './brands.service.js';

describe('BrandsController', () => {
  let controller: BrandsController;

  // The controller only talks to the service, so a fake service is enough here
  const fakeService = {
    findAll: vi.fn().mockResolvedValue([{ id: 1, slug: 'apple' }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandsController],
      providers: [{ provide: BrandsService, useValue: fakeService }],
    }).compile();

    controller = module.get<BrandsController>(BrandsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns what the service returns', async () => {
    await expect(controller.findAll()).resolves.toEqual([
      { id: 1, slug: 'apple' },
    ]);
  });
});