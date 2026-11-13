import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const PRODUCT_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'name_asc',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Query string of GET /api/v1/products. Every value arrives as a string:
// @Type(() => Number) turns "2" into 2 before the number rules run.
export class ListProductsQueryDto {
  @ApiPropertyOptional({ description: 'Slug danh mục, ví dụ laptop' })
  @IsOptional()
  @Matches(SLUG, { message: 'category phải là slug hợp lệ, ví dụ laptop' })
  category?: string;

  @ApiPropertyOptional({ description: 'Slug hãng, ví dụ apple' })
  @IsOptional()
  @Matches(SLUG, { message: 'brand phải là slug hợp lệ, ví dụ apple' })
  brand?: string;

  @ApiPropertyOptional({ description: 'Tìm trong tên sản phẩm' })
  @IsOptional()
  @IsString({ message: 'q phải là chuỗi' })
  @MaxLength(100, { message: 'Từ khoá tìm kiếm tối đa 100 ký tự' })
  q?: string;

  @ApiPropertyOptional({ description: 'Giá thấp nhất (VND), ví dụ 20000000' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'minPrice phải là số nguyên' })
  @Min(0, { message: 'minPrice không được âm' })
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Giá cao nhất (VND)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxPrice phải là số nguyên' })
  @Min(0, { message: 'maxPrice không được âm' })
  maxPrice?: number;

  // "true" / "false" in the URL -> boolean; anything else fails @IsBoolean
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'featured phải là true hoặc false' })
  featured?: boolean;

  @IsOptional()
  @IsIn(PRODUCT_SORTS, {
    message: `sort chỉ nhận: ${PRODUCT_SORTS.join(', ')}`,
  })
  sort: ProductSort = 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(50, { message: 'limit tối đa là 50' })
  limit: number = 12;
}
