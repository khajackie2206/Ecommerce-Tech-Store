import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service.js';
import { Category } from './category.entity.js';

describe('CategoriesService', () => {
  let service: CategoriesService;

  // Fake repository: unit tests run without SQL Server
  const fakeRepo = {
    find: vi.fn(),
    findOneBy: vi.fn(),
    create: vi.fn((data: Partial<Category>) => data),
    save: vi.fn(async (data: Partial<Category>) => ({ id: 1, ...data })),
    remove: vi.fn(),
  };

  // A row as the database would return it
  const phones = (): Category =>
    Object.assign(new Category(), {
      id: 1,
      name: 'Điện thoại',
      slug: 'dien-thoai',
      sortOrder: 1,
      isActive: true,
    });

  beforeEach(async () => {
    // Forget the calls and fake results of the previous test
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        // Whoever asks for Repository<Category> gets the fake one
        { provide: getRepositoryToken(Category), useValue: fakeRepo },
      ],
    }).compile();

    service = module.get(CategoriesService);
  });

  describe('findAll', () => {
    it('sorts by sortOrder, smallest first (menu order)', async () => {
      fakeRepo.find.mockResolvedValue([phones()]);

      await expect(service.findAll()).resolves.toHaveLength(1);
      expect(fakeRepo.find).toHaveBeenCalledWith({
        order: { sortOrder: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the category when it exists', async () => {
      fakeRepo.findOneBy.mockResolvedValue(phones());
      await expect(service.findOne(1)).resolves.toMatchObject({ id: 1 });
      expect(fakeRepo.findOneBy).toHaveBeenCalledWith({ id: 1 });
    });

    it('throws 404 when it does not exist', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('saves the category when the slug is free', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null); // no category uses this slug
      const result = await service.create({ name: 'Đồng hồ', slug: 'dong-ho' });

      expect(result).toEqual({ id: 1, name: 'Đồng hồ', slug: 'dong-ho' });
      expect(fakeRepo.save).toHaveBeenCalledOnce();
    });

    it('rejects a duplicate slug with 409 and saves nothing', async () => {
      fakeRepo.findOneBy.mockResolvedValue({ id: 2, slug: 'laptop' });

      await expect(
        service.create({ name: 'Laptop', slug: 'laptop' }),
      ).rejects.toThrow(ConflictException);
      expect(fakeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('copies the sent fields onto the row and saves it', async () => {
      fakeRepo.findOneBy.mockResolvedValue(phones());

      const result = await service.update(1, { name: 'Smartphone' });

      expect(result).toMatchObject({
        id: 1,
        name: 'Smartphone',
        slug: 'dien-thoai',
      });
      // No slug in the body: no need to check for duplicates
      expect(fakeRepo.findOneBy).toHaveBeenCalledOnce();
    });

    it('allows keeping its own slug', async () => {
      // 1st call: findOne(1). 2nd call: the slug check finds... the same category
      fakeRepo.findOneBy
        .mockResolvedValueOnce(phones())
        .mockResolvedValueOnce(phones());

      await expect(
        service.update(1, { slug: 'dien-thoai' }),
      ).resolves.toMatchObject({ slug: 'dien-thoai' });
    });

    it("rejects another category's slug with 409", async () => {
      fakeRepo.findOneBy
        .mockResolvedValueOnce(phones())
        .mockResolvedValueOnce({ id: 2, slug: 'laptop' });

      await expect(service.update(1, { slug: 'laptop' })).rejects.toThrow(
        ConflictException,
      );
      expect(fakeRepo.save).not.toHaveBeenCalled();
    });

    it('throws 404 for a missing category', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);
      await expect(service.update(999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes the loaded row', async () => {
      const row = phones();
      fakeRepo.findOneBy.mockResolvedValue(row);

      await service.remove(1);

      expect(fakeRepo.remove).toHaveBeenCalledWith(row);
    });

    it('throws 404 and deletes nothing for a missing category', async () => {
      fakeRepo.findOneBy.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(fakeRepo.remove).not.toHaveBeenCalled();
    });
  });
});
