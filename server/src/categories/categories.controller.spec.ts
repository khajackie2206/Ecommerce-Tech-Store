import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

describe('CategoriesController', () => {
  let controller: CategoriesController;

  // The controller only forwards to the service, so a fake service is enough.
  // Each method returns a recognisable value to check the controller passes it back.
  const fakeService = {
    findAll: vi.fn().mockResolvedValue([{ id: 1 }]),
    findOne: vi.fn().mockResolvedValue({ id: 1 }),
    create: vi.fn().mockResolvedValue({ id: 5 }),
    update: vi.fn().mockResolvedValue({ id: 1, name: 'Smartphone' }),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: fakeService }],
    }).compile();

    controller = module.get(CategoriesController);
  });

  it('findAll returns what the service returns', async () => {
    await expect(controller.findAll()).resolves.toEqual([{ id: 1 }]);
  });

  it('findOne passes the id through', async () => {
    await controller.findOne(1);
    expect(fakeService.findOne).toHaveBeenCalledWith(1);
  });

  it('create passes the body through', async () => {
    const dto = { name: 'Đồng hồ', slug: 'dong-ho' };
    await expect(controller.create(dto)).resolves.toEqual({ id: 5 });
    expect(fakeService.create).toHaveBeenCalledWith(dto);
  });

  it('update passes the id and the body through', async () => {
    await controller.update(1, { name: 'Smartphone' });
    expect(fakeService.update).toHaveBeenCalledWith(1, { name: 'Smartphone' });
  });

  it('remove returns the Promise so Nest waits for it', async () => {
    // If remove() forgot "return", the result would be undefined, not a Promise
    const result = controller.remove(1);
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(fakeService.remove).toHaveBeenCalledWith(1);
  });
});
