import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BrandsService } from './brands.service.js';
import { Brand } from './brands.entity.js';

describe('BrandsService', () => {
  let service: BrandsService;

  // Fake repository: unit tests run without SQL Server
  const fakeRepo = {
    find: vi.fn(),
    findOneBy: vi.fn(),
    create: vi.fn((data: Partial<Brand>) => data),
    save: vi.fn(async (data: Partial<Brand>) => ({ id: 1, ...data })),
    remove: vi.fn(),
  };

  // A row as the database would return it
  const apple = (): Brand =>
    Object.assign(new Brand(), {
      id: 1,
      name: 'Apple',
      slug: 'apple',
      logoUrl: null,
      isActive: true,
    });

  beforeEach(async () => {
    // Forget the calls and fake results of the previous test
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandsService,
        // Whoever asks for Repository<Brand> gets the fake one
        { provide: getRepositoryToken(Brand), useValue: fakeRepo },
      ],
    }).compile();

    service = module.get(BrandsService);
  });

  describe('findAll', () => {
    it('sorts by name A to Z', async () => {
      fakeRepo.find.mockResolvedValue([apple()]);

      await expect(service.findAll()).resolves.toHaveLength(1);
      expect(fakeRepo.find).toHaveBeenCalledWith({
        order: { name: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the brand when it exists', async () => {
      fakeRepo.findOneBy.mockResolvedValue(apple());
      await expect(service.findOne(1)).resolves.toMatchObject({ id: 1 });
      expect(fakeRepo.findOneBy).toHaveBeenCalledWith({ id: 1 });
    });

    it('throws 404 when it does not exist', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('saves the brand when the slug is free', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null); // no brand uses this slug
      const result = await service.create({ name: 'Google', slug: 'google' });

      expect(result).toEqual({ id: 1, name: 'Google', slug: 'google' });
      expect(fakeRepo.save).toHaveBeenCalledOnce();
    });

    it('rejects a duplicate slug with 409 and saves nothing', async () => {
      fakeRepo.findOneBy.mockResolvedValue({ id: 2, slug: 'samsung' });

      await expect(
        service.create({ name: 'Samsung', slug: 'samsung' }),
      ).rejects.toThrow(ConflictException);
      expect(fakeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('copies the sent fields onto the row and saves it', async () => {
      fakeRepo.findOneBy.mockResolvedValue(apple());

      const result = await service.update(1, { name: 'Apple Inc' });

      expect(result).toMatchObject({
        id: 1,
        name: 'Apple Inc',
        slug: 'apple',
      });
      // No slug in the body: no need to check for duplicates
      expect(fakeRepo.findOneBy).toHaveBeenCalledOnce();
    });

    it('allows keeping its own slug', async () => {
      // 1st call: findOne(1). 2nd call: the slug check finds... the same brand
      fakeRepo.findOneBy
        .mockResolvedValueOnce(apple())
        .mockResolvedValueOnce(apple());

      await expect(service.update(1, { slug: 'apple' })).resolves.toMatchObject(
        { slug: 'apple' },
      );
    });

    it("rejects another brand's slug with 409", async () => {
      fakeRepo.findOneBy
        .mockResolvedValueOnce(apple())
        .mockResolvedValueOnce({ id: 2, slug: 'samsung' });

      await expect(service.update(1, { slug: 'samsung' })).rejects.toThrow(
        ConflictException,
      );
      expect(fakeRepo.save).not.toHaveBeenCalled();
    });

    it('throws 404 for a missing brand', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);
      await expect(service.update(999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes the loaded row', async () => {
      const row = apple();
      fakeRepo.findOneBy.mockResolvedValue(row);

      await service.remove(1);

      expect(fakeRepo.remove).toHaveBeenCalledWith(row);
    });

    it('throws 404 and deletes nothing for a missing brand', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(fakeRepo.remove).not.toHaveBeenCalled();
    });
  });
});
