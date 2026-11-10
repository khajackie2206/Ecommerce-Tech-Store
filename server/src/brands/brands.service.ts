import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from './brands.entity.js';

export interface CreateBrandInput {
  name: string;
  slug: string;
  logoUrl?: string;
  isActive?: boolean;
}

export type UpdateBrandInput = Partial<CreateBrandInput>;

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandsRepo: Repository<Brand>,
  ) {}

  findAll(): Promise<Brand[]> {
    return this.brandsRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: number): Promise<Brand> {
    const brand = await this.brandsRepo.findOneBy({ id });
    if (!brand) throw new NotFoundException(`Không tìm thấy hãng id=${id}`);
    return brand;
  }

  create(input: CreateBrandInput): Promise<Brand> {
    const brand = this.brandsRepo.create(input); // builds the object, nothing saved yet
    return this.brandsRepo.save(brand); // INSERT INTO Brands ...
  }

  async update(id: number, input: UpdateBrandInput): Promise<Brand> {
    const brand = await this.findOne(id); // throws 404 when missing
    Object.assign(brand, input); // copy the sent fields onto the loaded row
    return this.brandsRepo.save(brand); // has an id, so this is an UPDATE
  }

  async remove(id: number): Promise<void> {
    const brand = await this.findOne(id); // throws 404 when missing
    await this.brandsRepo.remove(brand); // DELETE FROM Brands WHERE id = @0
  }
}
