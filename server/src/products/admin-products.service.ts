import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository, type FindOptionsWhere } from 'typeorm';
import type { Paginated } from '../common/dto/pagination-query.dto.js';
import type {
  CreateProductDto,
  CreateVariantDto,
} from './dto/create-product.dto.js';
import type { ListAdminProductsQueryDto } from './dto/list-admin-products-query.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import type { UpdateVariantDto } from './dto/update-variant.dto.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';

// Admin side of the catalog. Unlike ProductsService (the shop), it also sees
// hidden products and hidden variants.
@Injectable()
export class AdminProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
  ) {}

  async findAll(query: ListAdminProductsQueryDto): Promise<Paginated<Product>> {
    const { page, limit, q, categoryId } = query;
    const base: FindOptionsWhere<Product> = categoryId ? { categoryId } : {};
    // Array in `where` = OR: name LIKE ... OR slug LIKE ...
    const where = q
      ? [
          { ...base, name: Like(`%${q}%`) },
          { ...base, slug: Like(`%${q}%`) },
        ]
      : base;

    const [items, total] = await this.productsRepo.findAndCount({
      where,
      relations: { category: true, brand: true, variants: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: { id },
      relations: { category: true, brand: true, variants: true, images: true },
      order: { variants: { id: 'ASC' }, images: { sortOrder: 'ASC' } },
    });
    if (!product)
      throw new NotFoundException(`Không tìm thấy sản phẩm id=${id}`);
    return product;
  }

  // Product + its variants in one save(). save() wraps the inserts in a transaction
  // by itself: if one variant fails (duplicate SKU...), the product is not created either.
  async create(dto: CreateProductDto): Promise<Product> {
    await this.ensureSlugIsFree(dto.slug);
    for (const variant of dto.variants) {
      this.ensureSalePriceIsValid(variant.price, variant.salePrice);
      await this.ensureSkuIsFree(variant.sku);
    }
    const product = this.productsRepo.create(dto); // variants: cascade insert
    const saved = await this.productsRepo.save(product);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    await this.findOne(id); // 404 for an unknown product
    if (dto.slug !== undefined) await this.ensureSlugIsFree(dto.slug, id);
    // UPDATE Products SET <only the sent columns> WHERE id = @0
    await this.productsRepo.update({ id }, dto);
    return this.findOne(id); // read it back: updatedAt, relations
  }

  // Real DELETE. A product that was ever ordered can't be deleted:
  // FK_OrderItems_ProductVariants blocks it (SQL error 547), and the SQL filter of
  // Part 6 answers 409 "Không thể xoá vì dữ liệu đang được sử dụng". Hide it instead.
  async remove(id: number): Promise<void> {
    const product = await this.findOne(id);
    await this.productsRepo.manager.transaction(async (manager) => {
      await manager.delete(ProductVariant, { productId: id });
      await manager.remove(product); // images go too: ON DELETE CASCADE
    });
  }

  async addVariant(productId: number, dto: CreateVariantDto) {
    await this.findOne(productId); // 404 for an unknown product
    this.ensureSalePriceIsValid(dto.price, dto.salePrice);
    await this.ensureSkuIsFree(dto.sku);
    const variant = this.variantsRepo.create(dto);
    variant.productId = productId;
    return this.variantsRepo.save(variant);
  }

  async updateVariant(id: number, dto: UpdateVariantDto) {
    const variant = await this.variantsRepo.findOneBy({ id });
    if (!variant)
      throw new NotFoundException(`Không tìm thấy phiên bản id=${id}`);
    // Check the pair as it WILL be: new price with old sale price, or the opposite
    this.ensureSalePriceIsValid(
      dto.price ?? variant.price,
      dto.salePrice !== undefined ? dto.salePrice : variant.salePrice,
    );
    if (dto.sku !== undefined) await this.ensureSkuIsFree(dto.sku, id);
    Object.assign(variant, dto);
    return this.variantsRepo.save(variant);
  }

  async removeVariant(id: number): Promise<void> {
    const variant = await this.variantsRepo.findOneBy({ id });
    if (!variant)
      throw new NotFoundException(`Không tìm thấy phiên bản id=${id}`);
    await this.variantsRepo.remove(variant); // ordered before -> 547 -> 409
  }

  // Same rule as CK_ProductVariants_salePrice, but with a clear message
  private ensureSalePriceIsValid(price: number, salePrice?: number | null) {
    if (salePrice != null && salePrice > price) {
      throw new BadRequestException(
        'Giá khuyến mãi không được lớn hơn giá gốc',
      );
    }
  }

  private async ensureSlugIsFree(slug: string, exceptId?: number) {
    const existing = await this.productsRepo.findOneBy({ slug });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`Slug "${slug}" đã được dùng`);
    }
  }

  private async ensureSkuIsFree(sku: string, exceptId?: number) {
    const existing = await this.variantsRepo.findOneBy({ sku });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`SKU "${sku}" đã được dùng`);
    }
  }
}
