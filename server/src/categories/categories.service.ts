import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Catetogy } from './category.controller.entity.js';
import { Repository } from 'typeorm';

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
        @InjectRepository(Catetogy)
        private readonly categoriesRepo: Repository<Catetogy>,
    ) {}

    findAll(): Promise<Catetogy[]> {
        return this.categoriesRepo.find({order: {sortOrder: 'DESC'}});
    }

    async findOne(id: number): Promise<Catetogy> {
        const category = await this.categoriesRepo.findOneBy({id});
        if (!category) {
            throw new NotFoundException(`Not found category id=${id}`);
        }
        return category;
    }

    create(input: CreateCategoryInput): Promise<Catetogy> {
        const category = this.categoriesRepo.create(input);
        return this.categoriesRepo.save(category);
    }

    async update(id: number, input: UpdateCategoryInput): Promise<Catetogy> {
        const category = await this.findOne(id);
        Object.assign(category, input);
        return this.categoriesRepo.save(category);
    }

    async remove(id: number): Promise<void> {
        const category = await this.findOne(id);
        await this.categoriesRepo.remove(category);
    }
}
