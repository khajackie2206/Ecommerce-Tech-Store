import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

@Injectable()
export class CategoriesService {
  // Repository<Category>: find/save/remove... on the Categories table,
  // provided by TypeOrmModule.forFeature([Category]) in CategoriesModule
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
  ) {}

  // SELECT ... FROM Categories ORDER BY sortOrder (menu order: smallest first)
  findAll(): Promise<Category[]> {
    return this.categoriesRepo.find({ order: { sortOrder: 'ASC' } });
  }

  // SELECT ... WHERE id = @0
  async findOne(id: number): Promise<Category> {
    const category = await this.categoriesRepo.findOneBy({ id });
    if (!category) {
      throw new NotFoundException(`Không tìm thấy danh mục id=${id}`);
    }
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    await this.ensureSlugIsFree(dto.slug);
    const category = this.categoriesRepo.create(dto); // builds the object, nothing saved yet
    return this.categoriesRepo.save(category); // INSERT INTO Categories ...
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id); // throws 404 when missing
    if (dto.slug !== undefined) await this.ensureSlugIsFree(dto.slug, id);
    Object.assign(category, dto);
    return this.categoriesRepo.save(category); // has an id, so this is an UPDATE
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id); // throws 404 when missing
    await this.categoriesRepo.remove(category); // DELETE FROM Categories WHERE id = @0
  }

  // Slugs appear in URLs, so two categories can't share one (409 Conflict).
  // The UNIQUE constraint in SQL Server is the final safety net.
  private async ensureSlugIsFree(
    slug: string,
    exceptId?: number,
  ): Promise<void> {
    const existing = await this.categoriesRepo.findOneBy({ slug });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`Slug "${slug}" đã được dùng`);
    }
  }
}
