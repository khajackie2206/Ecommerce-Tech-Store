import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-caregory.dto.js';
import { Category } from './category.entity.js';

export interface CreateCategoryInput {
    name: string;
    slug: string;
    sortOrder?: number;
    isActive?: boolean;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

@Injectable()
export class CategoriesService {
    constructor(
        @InjectRepository(Category)
        private readonly categoriesRepo: Repository<Category>,
    ) {}

    findAll(): Promise<Category[]> {
        return this.categoriesRepo.find({order: {sortOrder: 'DESC'}});
    }

    async findOne(id: number): Promise<Category> {
        const category = await this.categoriesRepo.findOneBy({id});
        if (!category) {
            throw new NotFoundException(`Not found category id=${id}`);
        }
        return category;
    }

    async create(dto: CreateCategoryDto): Promise<Category> {
        await this.ensureSlugFree(dto.slug);
        const category = this.categoriesRepo.create(dto);
        return this.categoriesRepo.save(category);
    }

    async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
        const category = await this.findOne(id);
        if(dto.slug !== undefined) await this.ensureSlugFree(dto.slug, id);
        Object.assign(category, dto);
        return this.categoriesRepo.save(category);
    }

    async remove(id: number): Promise<void> {
        const category = await this.findOne(id);
        await this.categoriesRepo.remove(category);
    }

    private async ensureSlugFree(slug: string, exeptId?: number) {
        const existing = await this.categoriesRepo.findOneBy({ slug });
        if (existing && existing.id !== exeptId) {
            throw new ConflictException(`Slug "${slug}" already exists`);
        }
    }
}
