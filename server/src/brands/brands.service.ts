import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from './brands.entity.js';
import type { CreateBrandDto } from './dto/create-brand.dto.js';
import type { UpdateBrandDto } from './dto/update-brand.dto.js';

@Injectable()
export class BrandsService {
  // Repository<Brand>: find/save/remove... on the Brands table,
  // provided by TypeOrmModule.forFeature([Brand]) in BrandsModule
  constructor(
    @InjectRepository(Brand)
    private readonly brandsRepo: Repository<Brand>,
  ) {}

  // SELECT ... FROM Brands ORDER BY name
  findAll(): Promise<Brand[]> {
    return this.brandsRepo.find({ order: { name: 'ASC' } });
  }

  // SELECT ... WHERE id = @0
  async findOne(id: number): Promise<Brand> {
    const brand = await this.brandsRepo.findOneBy({ id });
    if (!brand) throw new NotFoundException(`Không tìm thấy hãng id=${id}`);
    return brand;
  }

  async create(dto: CreateBrandDto): Promise<Brand> {
    await this.ensureSlugIsFree(dto.slug);
    const brand = this.brandsRepo.create(dto); // builds the object, nothing saved yet
    return this.brandsRepo.save(brand); // INSERT INTO Brands ...
  }

  async update(id: number, dto: UpdateBrandDto): Promise<Brand> {
    const brand = await this.findOne(id); // throws 404 when missing
    if (dto.slug !== undefined) await this.ensureSlugIsFree(dto.slug, id);
    Object.assign(brand, dto);
    return this.brandsRepo.save(brand); // has an id, so this is an UPDATE
  }

  async remove(id: number): Promise<void> {
    const brand = await this.findOne(id); // throws 404 when missing
    await this.brandsRepo.remove(brand); // DELETE FROM Brands WHERE id = @0
  }

  // Slugs appear in URLs, so two brands can't share one (409 Conflict).
  // The UNIQUE constraint in SQL Server is the final safety net.
  private async ensureSlugIsFree(
    slug: string,
    exceptId?: number,
  ): Promise<void> {
    const existing = await this.brandsRepo.findOneBy({ slug });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`Slug "${slug}" đã được dùng`);
    }
  }
}