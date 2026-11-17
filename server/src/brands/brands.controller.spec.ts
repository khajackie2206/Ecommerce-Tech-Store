import { Test, TestingModule } from '@nestjs/testing';
import { BrandsController } from './brands.controller.js';
import { BrandsService } from './brands.service.js';

describe('BrandsController', () => {
  let controller: BrandsController;

  // The controller only forwards to the service, so a fake service is enough.
  // Each method returns a recognisable value to check the controller passes it back.
  const fakeService = {
    findAll: vi.fn().mockResolvedValue([{ id: 1 }]),
    findOne: vi.fn().mockResolvedValue({ id: 1 }),
    create: vi.fn().mockResolvedValue({ id: 5 }),
    update: vi.fn().mockResolvedValue({ id: 1, name: 'Apple Inc' }),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandsController],
      providers: [{ provide: BrandsService, useValue: fakeService }],
    }).compile();

    controller = module.get(BrandsController);
  });

  it('findAll returns what the service returns', async () => {
    await expect(controller.findAll()).resolves.toEqual([{ id: 1 }]);
  });

  it('findOne passes the id through', async () => {
    await controller.findOne(1);
    expect(fakeService.findOne).toHaveBeenCalledWith(1);
  });

  it('create passes the body through', async () => {
    const dto = { name: 'Google', slug: 'google' };
    await expect(controller.create(dto)).resolves.toEqual({ id: 5 });
    expect(fakeService.create).toHaveBeenCalledWith(dto);
  });

  it('update passes the id and the body through', async () => {
    await controller.update(1, { name: 'Apple Inc' });
    expect(fakeService.update).toHaveBeenCalledWith(1, { name: 'Apple Inc' });
  });

  it('remove returns the Promise so Nest waits for it', async () => {
    // If remove() forgot "return", the result would be undefined, not a Promise
    const result = controller.remove(1);
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(fakeService.remove).toHaveBeenCalledWith(1);
  });
});
