import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from './entities/product.entity.js';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';

export interface ProductListItem {
  id: number;
  name: string;
  slug: string;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  isFeatured: boolean;
  category: { name: string; slug: string };
  brand: { name: string; slug: string };
  fromPrice: number;
  listPrice: number;
  inStock: boolean;
}

export interface ProductListResult {
  items: ProductListItem[];
  total: number;
  page: number;
  limit: number;
}

interface ProductListRow {
  id: number;
  name: string;
  slug: string;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  isFeatured: boolean;
  categoryName: string;
  categorySlug: string;
  brandName: string;
  brandSlug: string;
  fromPrice: number;
  listPrice: number;
  totalStock: number;
}

const EFFECTIVE_PRICE = 'MIN(COALESCE(v.salePrice, v.price))';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  async findAll(query: ListProductsQueryDto): Promise<ProductListResult> {
    const base = this.buildListQuery(query);

    const dataQuery = base
      .clone()
      .select('p.id', 'id')
      .addSelect('p.name', 'name')
      .addSelect('p.slug', 'slug')
      .addSelect('p.shortDescription', 'shortDescription')
      .addSelect('p.thumbnailUrl', 'thumbnailUrl')
      .addSelect('p.isFeatured', 'isFeatured')
      .addSelect('c.name', 'categoryName')
      .addSelect('c.slug', 'categorySlug')
      .addSelect('b.name', 'brandName')
      .addSelect('b.slug', 'brandSlug')
      .addSelect(EFFECTIVE_PRICE, 'fromPrice')
      .addSelect('MIN(v.price)', 'listPrice')
      .addSelect('SUM(v.stock)', 'totalStock');

    switch (query.sort) {
      case 'price_asc':
        dataQuery.orderBy(EFFECTIVE_PRICE, 'ASC');
        break;
      case 'price_desc':
        dataQuery.orderBy(EFFECTIVE_PRICE, 'DESC');
        break;
      case 'name_asc':
        dataQuery.orderBy('p.name', 'ASC');
        break;
      default:
        dataQuery.orderBy('p.createdAt', 'DESC');
    }

    dataQuery.addOrderBy('p.id', 'DESC');
    dataQuery.offset((query.page - 1) * query.limit).limit(query.limit);

    const countQuery = this.productsRepo.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from(`(${base.getQuery()})`, 'matches')
      .setParameters(base.getParameters());

    const [rows, countRow] = await Promise.all([
      dataQuery.getRawMany<ProductListRow>(),
      countQuery.getRawOne<{ total: number }>(),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        shortDescription: row.shortDescription,
        thumbnailUrl: row.thumbnailUrl,
        isFeatured: row.isFeatured,
        category: { name: row.categoryName, slug: row.categorySlug },
        brand: { name: row.brandName, slug: row.brandSlug },
        fromPrice: row.fromPrice,
        listPrice: row.listPrice,
        inStock: row.totalStock > 0,
      })),
      total: countRow?.total ?? 0,
      page: query.page,
      limit: query.limit,
    };
  }

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: { slug, isActive: true },
      relations: { category: true, brand: true, variants: true, images: true },
      order: { images: { sortOrder: 'ASC' }, variants: { price: 'ASC' } },
    });
    if (!product)
      throw new NotFoundException(`Không tìm thấy sản phẩm "${slug}"`);

    product.variants = product.variants.filter((variant) => variant.isActive);
    return product;
  }

  private buildListQuery(
    query: ListProductsQueryDto,
  ): SelectQueryBuilder<Product> {
    const qb = this.productsRepo
      .createQueryBuilder('p')
      .innerJoin('p.category', 'c')
      .innerJoin('p.brand', 'b')
      // Only active variants count towards price and stock
      .innerJoin('p.variants', 'v', 'v.isActive = 1')
      .select('p.id')
      .where('p.isActive = 1')
      .groupBy('p.id')
      .addGroupBy('p.name')
      .addGroupBy('p.slug')
      .addGroupBy('p.shortDescription')
      .addGroupBy('p.thumbnailUrl')
      .addGroupBy('p.isFeatured')
      .addGroupBy('p.createdAt')
      .addGroupBy('c.name')
      .addGroupBy('c.slug')
      .addGroupBy('b.name')
      .addGroupBy('b.slug');

    // Values are always passed as :parameters, never glued into the SQL text
    if (query.category)
      qb.andWhere('c.slug = :category', { category: query.category });
    if (query.brand) qb.andWhere('b.slug = :brand', { brand: query.brand });
    if (query.q) qb.andWhere('p.name LIKE :q', { q: `%${query.q}%` });
    if (query.featured !== undefined)
      qb.andWhere('p.isFeatured = :featured', { featured: query.featured });

    // Price filters apply to the aggregated price, so they go in HAVING, not WHERE
    if (query.minPrice !== undefined)
      qb.andHaving(`${EFFECTIVE_PRICE} >= :minPrice`, {
        minPrice: query.minPrice,
      });
    if (query.maxPrice !== undefined)
      qb.andHaving(`${EFFECTIVE_PRICE} <= :maxPrice`, {
        maxPrice: query.maxPrice,
      });

    return qb;
  }
}
